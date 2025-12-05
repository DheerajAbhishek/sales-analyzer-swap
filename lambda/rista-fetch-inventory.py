import json
import time
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import jwt
import requests

# --- Configuration ---
MAX_WORKERS = 10  # Max parallel threads for API calls
REQUEST_TIMEOUT = 15  # Timeout per request in seconds

# --- Helper Functions ---

def get_dates_in_range(start_date_str, end_date_str):
    """Generates a list of date strings between two dates."""
    dates = []
    try:
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        delta = end_date - start_date
        for i in range(delta.days + 1):
            day = start_date + timedelta(days=i)
            dates.append(day.strftime('%Y-%m-%d'))
    except ValueError:
        return []
    return dates

def generate_jwt_token(api_key, secret_key, request_id=None):
    """Generate JWT token for Rista API authentication."""
    payload = {
        "iss": api_key,
        "iat": int(time.time()),
    }
    if request_id:
        payload["jti"] = request_id
    return jwt.encode(payload, secret_key, algorithm="HS256")

def get_headers(api_key, secret_key, request_id=None):
    """Generate headers for Rista API requests."""
    token = generate_jwt_token(api_key, secret_key, request_id)
    return {
        "x-api-token": token,
        "x-api-key": api_key,
        "Content-Type": "application/json"
    }

# --- Inventory Fetch Functions (Single Day) ---

def fetch_inventory_page(endpoint, day, branch_id, api_key, secret_key, last_key=None):
    """Fetches a single page of inventory data for a given day and endpoint."""
    request_id = f"req_{int(time.time() * 1000)}_{endpoint}_{day}_{last_key or 'initial'}"
    headers = get_headers(api_key, secret_key, request_id)
    
    url = f"https://api.ristaapps.com/v1/inventory/{endpoint}/page?branch={branch_id}&day={day}"
    if last_key:
        url += f"&lastKey={last_key}"
        
    response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()

def fetch_inventory_for_day(endpoint, day, branch_id, api_key, secret_key):
    """Fetches all pages of inventory data for a given day and endpoint."""
    all_records = []
    last_key = None
    has_more = True

    while has_more:
        try:
            response_data = fetch_inventory_page(endpoint, day, branch_id, api_key, secret_key, last_key)
            if response_data and isinstance(response_data.get('data'), list):
                all_records.extend(response_data['data'])
            
            if response_data and response_data.get('lastKey'):
                last_key = response_data['lastKey']
                has_more = True
            else:
                has_more = False
        except requests.exceptions.RequestException as e:
            print(f"Error fetching {endpoint} page for day {day} with lastKey {last_key}: {e}")
            has_more = False
    return all_records

def fetch_item_activity_for_day(day, branch_id, api_key, secret_key):
    """Fetches item activity (consumption) for a given day."""
    all_records = []
    last_key = None
    has_more = True

    while has_more:
        try:
            request_id = f"req_{int(time.time() * 1000)}_activity_{day}_{last_key or 'initial'}"
            headers = get_headers(api_key, secret_key, request_id)
            
            url = f"https://api.ristaapps.com/v1/inventory/item/activity/page?branch={branch_id}&day={day}"
            if last_key:
                url += f"&lastKey={last_key}"
            
            response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            response_data = response.json()
            
            if response_data and isinstance(response_data.get('data'), list):
                all_records.extend(response_data['data'])
            
            if response_data and response_data.get('lastKey'):
                last_key = response_data['lastKey']
                has_more = True
            else:
                has_more = False
        except requests.exceptions.RequestException as e:
            print(f"Error fetching item activity for day {day} with lastKey {last_key}: {e}")
            has_more = False
    
    return all_records

# --- Parallel Fetch Functions ---

def fetch_endpoint_parallel(endpoint, dates, branch_id, api_key, secret_key):
    """Fetch data for an endpoint across multiple dates in parallel."""
    all_records = []
    
    def fetch_day(day):
        return fetch_inventory_for_day(endpoint, day, branch_id, api_key, secret_key)
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_day = {executor.submit(fetch_day, day): day for day in dates}
        for future in as_completed(future_to_day):
            day = future_to_day[future]
            try:
                records = future.result()
                all_records.extend(records)
            except Exception as e:
                print(f"Error fetching {endpoint} for day {day}: {e}")
    
    return all_records

def fetch_activity_parallel(dates, branch_id, api_key, secret_key):
    """Fetch item activity data across multiple dates in parallel."""
    all_records = []
    
    def fetch_day(day):
        return fetch_item_activity_for_day(day, branch_id, api_key, secret_key)
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_day = {executor.submit(fetch_day, day): day for day in dates}
        for future in as_completed(future_to_day):
            day = future_to_day[future]
            try:
                records = future.result()
                all_records.extend(records)
            except Exception as e:
                print(f"Error fetching activity for day {day}: {e}")
    
    return all_records

def fetch_all_data_types_parallel(data_types, dates, branch_id, api_key, secret_key, sku_codes=None):
    """Fetch all data types in parallel."""
    results = {}
    
    def fetch_data_type(data_type):
        if data_type == 'grn':
            records = fetch_endpoint_parallel('grn', dates, branch_id, api_key, secret_key)
            return ('grn', records)
        elif data_type == 'transfer':
            records = fetch_endpoint_parallel('transfer', dates, branch_id, api_key, secret_key)
            return ('transfer', records)
        elif data_type == 'shrinkage':
            records = fetch_endpoint_parallel('shrinkage', dates, branch_id, api_key, secret_key)
            return ('shrinkage', records)
        elif data_type == 'adjustment':
            records = fetch_endpoint_parallel('adjustment', dates, branch_id, api_key, secret_key)
            return ('adjustment', records)
        elif data_type == 'activity':
            records = fetch_activity_parallel(dates, branch_id, api_key, secret_key)
            return ('activity', records)
        elif data_type == 'stock':
            records = fetch_current_stock(branch_id, api_key, secret_key, sku_codes)
            return ('stock', records)
        return (data_type, [])
    
    with ThreadPoolExecutor(max_workers=len(data_types)) as executor:
        futures = {executor.submit(fetch_data_type, dt): dt for dt in data_types}
        for future in as_completed(futures):
            try:
                data_type, records = future.result()
                results[data_type] = records
            except Exception as e:
                print(f"Error fetching data type: {e}")
    
    return results

def fetch_current_stock(branch_id, api_key, secret_key, sku_codes=None):
    """Fetches current stock levels for a branch."""
    request_id = f"req_{int(time.time() * 1000)}_stock"
    headers = get_headers(api_key, secret_key, request_id)
    
    url = "https://api.ristaapps.com/v1/inventory/item/stock"
    
    body = {"storeCode": branch_id}
    if sku_codes:
        body["skuCodes"] = sku_codes
    
    try:
        response = requests.post(url, headers=headers, json=body, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching current stock: {e}")
        return {"data": []}

# --- Data Processing Functions ---

def consolidate_grn_data(grn_records):
    """Consolidate GRN (Goods Received Note) data."""
    consolidated = {
        "totalRecords": 0,
        "totalItemsAmount": 0,
        "totalTaxAmount": 0,
        "totalAmount": 0,
        "suppliers": {},
        "items": {}
    }
    
    for record in grn_records:
        consolidated["totalRecords"] += 1
        consolidated["totalItemsAmount"] += record.get("itemsAmount", 0) or 0
        consolidated["totalTaxAmount"] += record.get("taxAmount", 0) or 0
        consolidated["totalAmount"] += record.get("totalAmount", 0) or 0
        
        supplier_name = record.get("supplierName", "Unknown")
        if supplier_name not in consolidated["suppliers"]:
            consolidated["suppliers"][supplier_name] = 0
        consolidated["suppliers"][supplier_name] += record.get("totalAmount", 0) or 0
        
        for item in record.get("items", []):
            sku = item.get("skuCode", "Unknown")
            if sku not in consolidated["items"]:
                consolidated["items"][sku] = {
                    "name": item.get("itemName", ""),
                    "quantity": 0,
                    "totalAmount": 0,
                    "unit": item.get("measuringUnit", "")
                }
            consolidated["items"][sku]["quantity"] += item.get("quantity", 0) or 0
            consolidated["items"][sku]["totalAmount"] += item.get("totalAmount", 0) or 0
    
    return consolidated

def consolidate_transfer_data(transfer_records):
    """Consolidate transfer data."""
    consolidated = {
        "totalRecords": 0,
        "totalItemsAmount": 0,
        "totalAmount": 0,
        "destinations": {},
        "items": {}
    }
    
    for record in transfer_records:
        consolidated["totalRecords"] += 1
        consolidated["totalItemsAmount"] += record.get("itemsAmount", 0) or 0
        consolidated["totalAmount"] += record.get("totalAmount", 0) or 0
        
        to_branch = record.get("toBranch", {})
        dest_name = to_branch.get("branchName", "Unknown")
        if dest_name not in consolidated["destinations"]:
            consolidated["destinations"][dest_name] = 0
        consolidated["destinations"][dest_name] += record.get("totalAmount", 0) or 0
        
        for item in record.get("items", []):
            sku = item.get("skuCode", "Unknown")
            if sku not in consolidated["items"]:
                consolidated["items"][sku] = {
                    "name": item.get("itemName", ""),
                    "quantity": 0,
                    "totalAmount": 0,
                    "unit": item.get("measuringUnit", "")
                }
            consolidated["items"][sku]["quantity"] += item.get("quantity", 0) or 0
            consolidated["items"][sku]["totalAmount"] += item.get("totalAmount", 0) or 0
    
    return consolidated

def consolidate_shrinkage_data(shrinkage_records):
    """Consolidate shrinkage/wastage data."""
    consolidated = {
        "totalRecords": 0,
        "totalAmount": 0,
        "reasons": {},
        "items": {}
    }
    
    for record in shrinkage_records:
        consolidated["totalRecords"] += 1
        consolidated["totalAmount"] += record.get("totalAmount", 0) or 0
        
        for item in record.get("items", []):
            sku = item.get("skuCode", "Unknown")
            if sku not in consolidated["items"]:
                consolidated["items"][sku] = {
                    "name": item.get("itemName", ""),
                    "quantity": 0,
                    "totalAmount": 0,
                    "unit": item.get("measuringUnit", "")
                }
            consolidated["items"][sku]["quantity"] += item.get("quantity", 0) or 0
            consolidated["items"][sku]["totalAmount"] += item.get("totalAmount", 0) or 0
    
    return consolidated

def consolidate_adjustment_data(adjustment_records):
    """Consolidate adjustment data."""
    consolidated = {
        "totalRecords": 0,
        "totalAmount": 0,
        "adjustmentTypes": {},
        "items": {}
    }
    
    for record in adjustment_records:
        consolidated["totalRecords"] += 1
        consolidated["totalAmount"] += record.get("totalAmount", 0) or 0
        
        for item in record.get("items", []):
            sku = item.get("skuCode", "Unknown")
            if sku not in consolidated["items"]:
                consolidated["items"][sku] = {
                    "name": item.get("itemName", ""),
                    "quantity": 0,
                    "totalAmount": 0,
                    "unit": item.get("measuringUnit", "")
                }
            consolidated["items"][sku]["quantity"] += item.get("quantity", 0) or 0
            consolidated["items"][sku]["totalAmount"] += item.get("totalAmount", 0) or 0
    
    return consolidated

def consolidate_item_activity(activity_records):
    """Consolidate item activity/consumption data."""
    consolidated = {
        "totalItems": 0,
        "items": {}
    }
    
    for record in activity_records:
        sku = record.get("skuCode", "Unknown")
        if sku not in consolidated["items"]:
            consolidated["items"][sku] = {
                "name": record.get("itemName", ""),
                "openingStock": 0,
                "closingStock": 0,
                "consumption": 0,
                "received": 0,
                "transferred": 0,
                "shrinkage": 0,
                "unit": record.get("measuringUnit", "")
            }
            consolidated["totalItems"] += 1
        
        consolidated["items"][sku]["openingStock"] += record.get("openingStock", 0) or 0
        consolidated["items"][sku]["closingStock"] += record.get("closingStock", 0) or 0
        consolidated["items"][sku]["consumption"] += record.get("consumption", 0) or 0
        consolidated["items"][sku]["received"] += record.get("received", 0) or 0
        consolidated["items"][sku]["transferred"] += record.get("transferred", 0) or 0
        consolidated["items"][sku]["shrinkage"] += record.get("shrinkage", 0) or 0
    
    return consolidated

# --- Main Lambda Handler ---

def lambda_handler(event, context):
    """
    Lambda function to fetch inventory data from Rista API using parallel requests.
    Expects apiKey, secretKey, branchId, startDate, endDate, and optionally dataTypes in the request body.
    dataTypes can include: grn, transfer, shrinkage, adjustment, activity, stock
    """
    print(f"Received event: {json.dumps(event)}")
    
    # CORS headers
    cors_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
    }
    
    # Handle OPTIONS preflight request
    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({"message": "OK"})
        }
    
    try:
        # Parse request body
        body = event.get("body", "{}")
        if isinstance(body, str):
            body = json.loads(body)
        
        api_key = body.get("apiKey")
        secret_key = body.get("secretKey")
        branch_id = body.get("branchId")
        start_date = body.get("startDate")
        end_date = body.get("endDate")
        # Types of data to fetch: grn, transfer, shrinkage, adjustment, activity, stock
        data_types = body.get("dataTypes", ["grn", "transfer", "shrinkage", "adjustment", "activity"])
        sku_codes = body.get("skuCodes")  # Optional: specific SKUs for stock query
        
        if not all([api_key, secret_key, branch_id, start_date, end_date]):
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({
                    "error": "Missing required parameters",
                    "required": ["apiKey", "secretKey", "branchId", "startDate", "endDate"],
                    "optional": ["dataTypes", "skuCodes"]
                })
            }
        
        # Get dates in range
        dates = get_dates_in_range(start_date, end_date)
        if not dates:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "Invalid date range or format. Use YYYY-MM-DD."})
            }
        
        print(f"Fetching inventory data for {len(dates)} days, data types: {data_types}")
        
        # Fetch all data types in parallel
        raw_data = fetch_all_data_types_parallel(data_types, dates, branch_id, api_key, secret_key, sku_codes)
        
        result = {
            "branchId": branch_id,
            "startDate": start_date,
            "endDate": end_date,
            "data": {}
        }
        
        # Process each data type
        if "grn" in data_types and "grn" in raw_data:
            grn_records = raw_data["grn"]
            result["data"]["grn"] = {
                "rawCount": len(grn_records),
                "consolidated": consolidate_grn_data(grn_records)
            }
        
        if "transfer" in data_types and "transfer" in raw_data:
            transfer_records = raw_data["transfer"]
            result["data"]["transfer"] = {
                "rawCount": len(transfer_records),
                "consolidated": consolidate_transfer_data(transfer_records)
            }
        
        if "shrinkage" in data_types and "shrinkage" in raw_data:
            shrinkage_records = raw_data["shrinkage"]
            result["data"]["shrinkage"] = {
                "rawCount": len(shrinkage_records),
                "consolidated": consolidate_shrinkage_data(shrinkage_records)
            }
        
        if "adjustment" in data_types and "adjustment" in raw_data:
            adjustment_records = raw_data["adjustment"]
            result["data"]["adjustment"] = {
                "rawCount": len(adjustment_records),
                "consolidated": consolidate_adjustment_data(adjustment_records)
            }
        
        if "activity" in data_types and "activity" in raw_data:
            activity_records = raw_data["activity"]
            result["data"]["activity"] = {
                "rawCount": len(activity_records),
                "consolidated": consolidate_item_activity(activity_records)
            }
        
        if "stock" in data_types and "stock" in raw_data:
            result["data"]["currentStock"] = raw_data["stock"]
        
        # Calculate summary totals
        summary = {
            "totalGrnAmount": result["data"].get("grn", {}).get("consolidated", {}).get("totalAmount", 0),
            "totalTransferAmount": result["data"].get("transfer", {}).get("consolidated", {}).get("totalAmount", 0),
            "totalShrinkageAmount": result["data"].get("shrinkage", {}).get("consolidated", {}).get("totalAmount", 0),
            "totalAdjustmentAmount": result["data"].get("adjustment", {}).get("consolidated", {}).get("totalAmount", 0),
        }
        result["summary"] = summary
        
        print(f"Successfully fetched inventory data: {json.dumps(summary)}")
        
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps(result, default=str)
        }
        
    except json.JSONDecodeError as e:
        return {
            "statusCode": 400,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Invalid JSON in request body: {str(e)}"})
        }
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"})
        }
