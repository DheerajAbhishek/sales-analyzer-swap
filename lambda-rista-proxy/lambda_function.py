import json
import os
import time
import hmac
import hashlib
import base64
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

RISTA_BASE_URL = os.environ.get("RISTA_API_URL", "https://api.ristaapps.com/v1")
RISTA_API_KEY = os.environ.get("RISTA_API_KEY")
RISTA_SECRET_KEY = os.environ.get("RISTA_SECRET_KEY")

# Utility: base64url without padding
def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

# Utility: create HS256 JWT without external libs
def generate_jwt(api_key: str, secret_key: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"iss": api_key, "iat": int(time.time())}
    header_b64 = b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    signature_b64 = b64url(signature)
    return f"{header_b64}.{payload_b64}.{signature_b64}"

# HTTP GET helper against Rista
def rista_get(path: str, query: dict, api_key: str, secret_key: str):
    token = generate_jwt(api_key, secret_key)
    url = f"{RISTA_BASE_URL}{path}?{urllib.parse.urlencode(query)}"
    req = urllib.request.Request(url)
    req.add_header("x-api-key", api_key)
    req.add_header("x-api-token", token)
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read()
            return json.loads(body.decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else "No response body"
        print(f"Rista API Error {e.code} for {path}: {error_body}")
        raise Exception(f"Rista API returned {e.code}: {error_body}")
    except Exception as e:
        print(f"Request failed for {path}: {str(e)}")
        raise

# Date range iterator (inclusive)
def iter_dates(start_date: str, end_date: str):
    s = datetime.strptime(start_date, "%Y-%m-%d")
    e = datetime.strptime(end_date, "%Y-%m-%d")
    cur = s
    while cur <= e:
        yield cur.strftime("%Y-%m-%d")
        cur += timedelta(days=1)

# Safe sum helper that tries common keys
def sum_amounts(records: list, keys=("totalAmount", "amount", "billAmount")) -> float:
    total = 0.0
    for r in records or []:
        for k in keys:
            v = r.get(k)
            if isinstance(v, (int, float)):
                total += float(v)
                break
    return round(total, 2)

# Aggregate sales response to consolidatedInsights
def aggregate_sales(records: list):
    # Extract actual values from orders (matching rista-fetch-sales.py logic)
    closed_orders = 0
    gross_sale = 0.0
    tax_amount = 0.0
    charge_amount = 0.0
    discount_amount = 0.0
    gross_amount = 0.0
    
    for order in records or []:
        # Only count closed orders
        if order.get("status") != "Closed":
            continue
        
        closed_orders += 1
        
        # Extract amounts (matching reference function)
        tax = order.get("taxAmount", 0) or 0
        charge = order.get("chargeAmount", 0) or 0
        gross = order.get("grossAmount", 0) or 0
        discount = order.get("totalDiscountAmount", 0) or 0
        
        # Debug: Log first order details
        if closed_orders == 1:
            print(f"First closed order sample - taxAmount: {tax}, grossAmount: {gross}, chargeAmount: {charge}, discount: {discount}")
        
        gross_amount += gross
        tax_amount += tax
        charge_amount += charge
        discount_amount += abs(discount)
        
        # Gross Sale = just grossAmount (no calculation)
        gross_sale += gross
    
    # Net Sale = Gross Sale - GST - Discounts (matching reference)
    net_sale = gross_sale - tax_amount - discount_amount
    
    print(f"Sales aggregation: {closed_orders} closed orders, grossSale={gross_sale}, gstOnOrder={tax_amount}, discounts={discount_amount}, packings={charge_amount}")
    
    return {
        "noOfOrders": closed_orders,
        "grossSale": round(gross_sale, 2),
        "netSale": round(net_sale, 2),
        "gstOnOrder": round(tax_amount, 2),
        "discounts": round(discount_amount, 2),
        "packings": round(charge_amount, 2),
        "ads": 0,
        "commissionAndTaxes": 0,
        "totalDeductions": 0
    }

# Inventory: Fetch daily audit totals
def fetch_audit_total(branch: str, day: str, api_key: str, secret_key: str):
    data = rista_get("/inventory/audit/page", {"branch": branch, "day": day, "limit": "50"}, api_key, secret_key)
    records = data.get("data") or data.get("records") or data.get("items") or []
    total = sum_amounts(records, keys=("totalAmount", "amount"))
    return {
        "rawCount": len(records),
        "consolidated": {
            "totalRecords": len(records),
            "totalAmount": total,
        }
    }

# Inventory: Fetch daily PO totals
def fetch_po_total(branch: str, day: str, api_key: str, secret_key: str):
    data = rista_get("/inventory/po/page", {"branch": branch, "day": day, "limit": "50"}, api_key, secret_key)
    records = data.get("data") or data.get("records") or data.get("items") or []
    total = sum_amounts(records, keys=("totalAmount", "amount"))
    return {
        "rawCount": len(records),
        "consolidated": {
            "totalRecords": len(records),
            "totalAmount": total,
        }
    }

# Sales: Fetch daily sales records for channel (page endpoint)
# NOTE: Rista guide shows generic /sales/page; channel filtering may be done server-side; we expose channel param for parity
def fetch_sales_day(branch: str, day: str, api_key: str, secret_key: str, channel: str | None):
    # If channel needs a dedicated param, adapt here; otherwise get all and aggregate
    data = rista_get("/sales/page", {"branch": branch, "day": day, "limit": "50"}, api_key, secret_key)
    records = data.get("data") or data.get("records") or data.get("items") or []
    return aggregate_sales(records)

# Compute Daily Food Costing for a single day
def compute_food_costing(branch: str, day: str, api_key: str, secret_key: str):
    try:
        # Previous day for opening inventory
        # Skip Sunday (weekday 6) - if today is Monday, use Saturday's closing
        d = datetime.strptime(day, "%Y-%m-%d")
        
        # If today is Monday (weekday 0), go back 2 days to Saturday
        if d.weekday() == 0:  # Monday
            prev_day = (d - timedelta(days=2)).strftime("%Y-%m-%d")
        else:
            prev_day = (d - timedelta(days=1)).strftime("%Y-%m-%d")

        print(f"Fetching food costing for branch={branch}, day={day} (weekday={d.weekday()})")
        print(f"Using opening inventory from: {prev_day}")
        
        opening_data = fetch_audit_total(branch, prev_day, api_key, secret_key)
        opening = opening_data["consolidated"]["totalAmount"]
        print(f"Opening (prev day {prev_day}): {opening}")
        
        closing_data = fetch_audit_total(branch, day, api_key, secret_key)
        closing = closing_data["consolidated"]["totalAmount"]
        print(f"Closing: {closing}")
        
        purchases_data = fetch_po_total(branch, day, api_key, secret_key)
        purchases = purchases_data["consolidated"]["totalAmount"]
        print(f"Purchases: {purchases}")
        
        sales_insights = fetch_sales_day(branch, day, api_key, secret_key, None)
        print(f"Sales: {sales_insights}")

        net_sales = float(sales_insights.get("netSale", 0) or 0)
        daily_cogs = round(float(opening) + float(purchases) - float(closing), 2)
        food_cost_pct = round((daily_cogs / net_sales * 100) if net_sales > 0 else 0.0, 2)

        return {
            "branchId": branch,
            "day": day,
            "opening": {"totalAmount": round(float(opening), 2)},
            "purchases": {"totalAmount": round(float(purchases), 2)},
            "closing": {"totalAmount": round(float(closing), 2)},
            "sales": {
                "noOfOrders": sales_insights.get("noOfOrders", 0),
                "grossSale": round(float(sales_insights.get("grossSale", 0) or 0), 2),
                "netSale": round(net_sales, 2),
                "gstOnOrder": round(float(sales_insights.get("gstOnOrder", 0) or 0), 2),
                "discounts": round(float(sales_insights.get("discounts", 0) or 0), 2),
                "packings": round(float(sales_insights.get("packings", 0) or 0), 2)
            },
            "results": {
                "dailyCogs": daily_cogs,
                "foodCostPct": food_cost_pct,
                "targetPct": 25
            }
        }
    except Exception as e:
        print(f"Error in compute_food_costing: {str(e)}")
        raise

# Build CORS response
def response(status: int, body: dict):
    return {
        "statusCode": status,
        "headers": {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "OPTIONS,POST,GET",
            "access-control-allow-headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "content-type": "application/json"
        },
        "body": json.dumps(body)
    }

# Handler
def lambda_handler(event, context):
    try:
        http_method = event.get("httpMethod", "GET").upper()
        path = event.get("path", "")
        qs = event.get("queryStringParameters") or {}
        body = {}
        if event.get("body"):
            try:
                body = json.loads(event["body"]) if isinstance(event["body"], str) else event["body"]
            except Exception:
                body = {}

        # Allow credentials override in request
        api_key = body.get("apiKey") or qs.get("apiKey") or RISTA_API_KEY
        secret_key = body.get("secretKey") or qs.get("secretKey") or RISTA_SECRET_KEY
        if not api_key or not secret_key:
            return response(400, {"error": "Missing RISTA_API_KEY or RISTA_SECRET_KEY"})

        # Normalize routing by path suffixes (and optional query mode)
        # /fetch-from-rista -> sales (GET) supporting channel/groupBy over date range
        # /rista-inventory -> po/audit (POST) over date range
        # /rista-sales -> sales (POST) one channel over date range
        # /food-costing -> aggregate opening/purchases/closing/sales for single day
        mode = qs.get("mode") or body.get("mode")
        if (path.endswith("/fetch-from-rista") or mode == "fetch-from-rista") and http_method == "GET":
            branch = qs.get("branchId") or qs.get("branch")
            start = qs.get("startDate") or qs.get("day")
            end = qs.get("endDate") or start
            channel = qs.get("channel")
            group_by = qs.get("groupBy") or "total"
            if not branch or not start:
                return response(400, {"error": "Missing branchId and startDate"})

            consolidated = {
                "noOfOrders": 0,
                "grossSale": 0,
                "netSale": 0,
                "gstOnOrder": 0,
                "discounts": 0,
                "packings": 0,
                "ads": 0,
                "commissionAndTaxes": 0,
                "totalDeductions": 0
            }
            for day in iter_dates(start, end):
                day_insights = fetch_sales_day(branch, day, api_key, secret_key, channel)
                for k in consolidated:
                    consolidated[k] += day_insights.get(k, 0)

            return response(200, {
                "branchId": branch,
                "startDate": start,
                "endDate": end,
                "channel": channel,
                "groupBy": group_by,
                "body": {"consolidatedInsights": consolidated}
            })

        if (path.endswith("/rista-inventory") or mode == "rista-inventory") and http_method == "POST":
            branch = body.get("branchId") or body.get("branch")
            start = body.get("startDate") or body.get("day")
            end = body.get("endDate") or start
            data_types = body.get("dataTypes") or []
            if not branch or not start or not data_types:
                return response(400, {"error": "Missing branchId, startDate or dataTypes"})

            result = {
                "branchId": branch,
                "startDate": start,
                "endDate": end,
                "data": {},
                "summary": {
                    "totalPurchaseOrderAmount": 0,
                    "totalAuditAmount": 0
                }
            }
            for day in iter_dates(start, end):
                if "audit" in data_types:
                    audit = fetch_audit_total(branch, day, api_key, secret_key)
                    # Sum per day
                    result["summary"]["totalAuditAmount"] += audit["consolidated"]["totalAmount"]
                    # Keep last consolidated as representative; caller can sum from summary
                    result["data"]["audit"] = audit
                if "po" in data_types:
                    po = fetch_po_total(branch, day, api_key, secret_key)
                    result["summary"]["totalPurchaseOrderAmount"] += po["consolidated"]["totalAmount"]
                    result["data"]["po"] = po

            # Round summaries
            result["summary"]["totalPurchaseOrderAmount"] = round(result["summary"]["totalPurchaseOrderAmount"], 2)
            result["summary"]["totalAuditAmount"] = round(result["summary"]["totalAuditAmount"], 2)
            return response(200, result)

        if (path.endswith("/rista-sales") or mode == "rista-sales") and http_method == "POST":
            branch = body.get("branchId") or body.get("branch")
            start = body.get("startDate") or body.get("day")
            end = body.get("endDate") or start
            channel = body.get("channelName") or body.get("channel")
            if not branch or not start:
                return response(400, {"error": "Missing branchId and startDate"})
            consolidated = {
                "noOfOrders": 0,
                "grossSale": 0,
                "netSale": 0,
                "gstOnOrder": 0,
                "discounts": 0,
                "packings": 0,
                "ads": 0,
                "commissionAndTaxes": 0,
                "totalDeductions": 0
            }
            for day in iter_dates(start, end):
                day_insights = fetch_sales_day(branch, day, api_key, secret_key, channel)
                for k in consolidated:
                    consolidated[k] += day_insights.get(k, 0)
            return response(200, {
                "branchId": branch,
                "startDate": start,
                "endDate": end,
                "channel": channel,
                "body": {"consolidatedInsights": consolidated}
            })

        if (path.endswith("/food-costing") or mode == "food-costing") and http_method in ("GET", "POST"):
            branch = (qs.get("branchId") or qs.get("branch") or body.get("branchId") or body.get("branch"))
            day = (qs.get("day") or qs.get("date") or body.get("day") or body.get("date")
                   or qs.get("startDate") or body.get("startDate"))
            if not branch or not day:
                return response(400, {"error": "Missing branchId and day"})
            result = compute_food_costing(branch, day, api_key, secret_key)
            return response(200, result)

        # Preflight CORS
        if http_method == "OPTIONS":
            return response(200, {"ok": True})

        return response(404, {"error": f"Unsupported path {path} or method {http_method}"})
    except Exception as e:
        return response(500, {"error": str(e)})
