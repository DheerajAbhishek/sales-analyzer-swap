import os
import json
import time
from datetime import datetime, timedelta
import jwt
import requests
import re

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
        # Handle invalid date format
        return []
    return dates

def fetch_sales_page(day, branch_id, api_key, secret_key, api_url, last_key=None):
    """Fetches a single page of sales data for a given day."""
    payload = {
        "iss": api_key,
        "iat": int(time.time()),
        "jti": f"req_{int(time.time() * 1000)}_{day}_{last_key or 'initial'}"
    }
    token = jwt.encode(payload, secret_key, algorithm="HS256")
    
    base_url = re.sub(r'/$', '', api_url)
    endpoint_path = f"/sales/page?branch={branch_id}&day={day}"
    if last_key:
        endpoint_path += f"&lastKey={last_key}"
        
    full_url = f"{base_url}{endpoint_path}"
    headers = {
        "x-api-token": token,
        "x-api-key": api_key,
        "Content-Type": "application/json"
    }
    
    response = requests.get(full_url, headers=headers, timeout=20)
    response.raise_for_status()
    return response.json()

def fetch_sales_for_day(day, branch_id, api_key, secret_key, api_url):
    """Fetches all pages of sales data for a given day."""
    all_orders = []
    last_key = None
    has_more = True

    while has_more:
        try:
            response_data = fetch_sales_page(day, branch_id, api_key, secret_key, api_url, last_key)
            if response_data and isinstance(response_data.get('data'), list):
                all_orders.extend(response_data['data'])
            
            if response_data and response_data.get('lastKey'):
                last_key = response_data['lastKey']
                has_more = True
            else:
                has_more = False
        except requests.exceptions.RequestException as e:
            print(f"Error fetching page for day {day} with lastKey {last_key}: {e}")
            has_more = False # Stop paginating on error
            # Optionally re-raise to fail the whole lambda
            # raise e 
    return all_orders

# --- Main Lambda Handler ---

def lambda_handler(event, context):
    print(f"Received event: {json.dumps(event)}")
    api_key = os.environ.get("VITE_RISTA_API_KEY")
    secret_key = os.environ.get("VITE_RISTA_SECRET_KEY")
    api_url = os.environ.get("VITE_RISTA_API_URL")

    if not all([api_key, secret_key, api_url]):
        return {"statusCode": 500, "body": json.dumps({"message": "Missing required environment variables"})}

    params = event.get("queryStringParameters", {})
    branch_id = params.get("branchId")
    start_date = params.get("startDate")
    end_date = params.get("endDate")
    channel = params.get("channel")  # New channel parameter

    if not all([branch_id, start_date, end_date, channel]):
        return {"statusCode": 400, "body": json.dumps({"message": "Missing required query parameters: branchId, startDate, endDate, channel"})}

    # Map frontend channel value to the value in the Rista data
    channel_map = {
        "takeaway": "Takeaway - Swap",
        "corporate": "Corporate Orders"
    }
    rista_channel_name = channel_map.get(channel.lower())

    print(f"Received channel parameter: '{channel}'. Mapped to Rista channel name: '{rista_channel_name}'")

    if not rista_channel_name:
        return {"statusCode": 400, "body": json.dumps({"message": f"Invalid channel specified: {channel}"})}

    try:
        dates = get_dates_in_range(start_date, end_date)
        if not dates:
            return {"statusCode": 400, "body": json.dumps({"message": "Invalid date range or format. Use YYYY-MM-DD."})}

        daily_results = [fetch_sales_for_day(day, branch_id, api_key, secret_key, api_url) for day in dates]
        
        consolidated = {
            "noOfOrders": 0, "grossSale": 0, "gstOnOrder": 0,
            "discounts": 0, "packings": 0, "netSale": 0,
        }
        restaurant_id = ""

        for orders_for_one_day in daily_results:
            if orders_for_one_day and isinstance(orders_for_one_day, list):
                for order in orders_for_one_day:
                    # DYNAMICALLY filter by channel, and always exclude voided
                    if order.get("channel") != rista_channel_name or order.get("status") == "Voided":
                        continue

                    if not restaurant_id and order.get("branchName"):
                        restaurant_id = order.get("branchName")

                    tax_amount = order.get("taxAmount", 0) or 0
                    charge_amount = order.get("chargeAmount", 0) or 0
                    gross_amount = order.get("grossAmount", 0) or 0
                    total_discount_amount = order.get("totalDiscountAmount", 0) or 0
                    total_amount = order.get("totalAmount", 0) or 0

                    consolidated["noOfOrders"] += 1
                    consolidated["grossSale"] += gross_amount + abs(charge_amount) - tax_amount
                    consolidated["gstOnOrder"] += tax_amount
                    consolidated["discounts"] += abs(total_discount_amount)
                    consolidated["packings"] += charge_amount
                    consolidated["netSale"] += total_amount
        
        nbv = consolidated["grossSale"] - consolidated["discounts"]
        discount_percent = (consolidated["discounts"] / consolidated["grossSale"] * 100) if consolidated["grossSale"] > 0 else 0

        response_body = {
            "restaurantId": restaurant_id,
            "startDate": start_date,
            "endDate": endDate,
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
            "headers": { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            "body": json.dumps(response_body)
        }

    except Exception as e:
        print(f"An error occurred: {e}")
        return { "statusCode": 500, "body": json.dumps({"message": f"An internal server error occurred: {str(e)}"}) }