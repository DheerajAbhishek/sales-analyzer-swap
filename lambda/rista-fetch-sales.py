import json
import time
import re
from datetime import datetime, timedelta
import jwt
import requests

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

def fetch_sales_page(day, branch_id, api_key, secret_key, last_key=None):
    """Fetches a single page of sales data for a given day."""
    payload = {
        "iss": api_key,
        "iat": int(time.time()),
        "jti": f"req_{int(time.time() * 1000)}_{day}_{last_key or 'initial'}"
    }
    token = jwt.encode(payload, secret_key, algorithm="HS256")
    
    url = f"https://api.ristaapps.com/v1/sales/page?branch={branch_id}&day={day}"
    if last_key:
        url += f"&lastKey={last_key}"
        
    headers = {
        "x-api-token": token,
        "x-api-key": api_key,
        "Content-Type": "application/json"
    }
    
    response = requests.get(url, headers=headers, timeout=20)
    response.raise_for_status()
    return response.json()

def fetch_sales_for_day(day, branch_id, api_key, secret_key):
    """Fetches all pages of sales data for a given day."""
    all_orders = []
    last_key = None
    has_more = True

    while has_more:
        try:
            response_data = fetch_sales_page(day, branch_id, api_key, secret_key, last_key)
            if response_data and isinstance(response_data.get('data'), list):
                all_orders.extend(response_data['data'])
            
            if response_data and response_data.get('lastKey'):
                last_key = response_data['lastKey']
                has_more = True
            else:
                has_more = False
        except requests.exceptions.RequestException as e:
            print(f"Error fetching page for day {day} with lastKey {last_key}: {e}")
            has_more = False
    return all_orders

# --- Main Lambda Handler ---

def lambda_handler(event, context):
    """
    Lambda function to fetch sales data from Rista API.
    Expects apiKey, secretKey, branchId, startDate, endDate, channelName in the request body.
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
        channel_name = body.get("channelName")
        
        if not all([api_key, secret_key, branch_id, start_date, end_date, channel_name]):
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({
                    "error": "Missing required parameters",
                    "required": ["apiKey", "secretKey", "branchId", "startDate", "endDate", "channelName"]
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
        
        # Fetch sales data for all dates
        daily_results = [fetch_sales_for_day(day, branch_id, api_key, secret_key) for day in dates]
        
        # Consolidate results
        consolidated = {
            "noOfOrders": 0,
            "grossSale": 0,
            "gstOnOrder": 0,
            "discounts": 0,
            "packings": 0,
            "netSale": 0,
        }
        restaurant_name = ""

        for orders_for_one_day in daily_results:
            if orders_for_one_day and isinstance(orders_for_one_day, list):
                for order in orders_for_one_day:
                    # Filter by channel name and exclude voided orders
                    if order.get("channel") != channel_name or order.get("status") == "Voided":
                        continue

                    if not restaurant_name and order.get("branchName"):
                        restaurant_name = order.get("branchName")

                    tax_amount = order.get("taxAmount", 0) or 0
                    charge_amount = order.get("chargeAmount", 0) or 0
                    gross_amount = order.get("grossAmount", 0) or 0
                    total_discount_amount = order.get("totalDiscountAmount", 0) or 0

                    consolidated["noOfOrders"] += 1
                    consolidated["grossSale"] += gross_amount + charge_amount
                    consolidated["gstOnOrder"] += tax_amount
                    consolidated["discounts"] += abs(total_discount_amount)
                    consolidated["packings"] += charge_amount
                    consolidated["netSale"] += (gross_amount + charge_amount) - tax_amount - abs(total_discount_amount)
        
        nbv = consolidated["grossSale"] - consolidated["discounts"]
        discount_percent = (consolidated["discounts"] / consolidated["grossSale"] * 100) if consolidated["grossSale"] > 0 else 0

        response_body = {
            "restaurantId": restaurant_name,
            "startDate": start_date,
            "endDate": end_date,
            "body": {
                "consolidatedInsights": {
                    "noOfOrders": consolidated["noOfOrders"],
                    "grossSale": round(consolidated["grossSale"], 2),
                    "gstOnOrder": round(consolidated["gstOnOrder"], 2),
                    "discounts": round(consolidated["discounts"], 2),
                    "packings": round(consolidated["packings"], 2),
                    "ads": 0,
                    "commissionAndTaxes": 0,
                    "netSale": round(consolidated["netSale"], 2),
                    "nbv": round(nbv, 2),
                    "commissionPercent": 0,
                    "discountPercent": round(discount_percent, 2),
                    "adsPercent": 0
                },
                "discountBreakdown": {}
            }
        }

        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps(response_body)
        }

    except json.JSONDecodeError as e:
        return {
            "statusCode": 400,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Invalid JSON: {str(e)}"})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"})
        }
