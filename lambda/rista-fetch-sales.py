import json
import time
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
    Returns data in the same format as consolidated-insights API.
    Expects apiKey, secretKey, branchIds (array), channels (array), startDate, endDate in the request body.
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
        branch_ids = body.get("branchIds", [])  # Array of branch codes
        channels = body.get("channels", [])      # Array of channel names
        start_date = body.get("startDate")
        end_date = body.get("endDate")
        
        # Validate required parameters
        if not api_key or not secret_key:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "Missing apiKey or secretKey"})
            }
        
        if not branch_ids or not isinstance(branch_ids, list) or len(branch_ids) == 0:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "branchIds must be a non-empty array"})
            }
            
        if not channels or not isinstance(channels, list) or len(channels) == 0:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "channels must be a non-empty array"})
            }
        
        if not start_date or not end_date:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "startDate and endDate are required"})
            }
        
        # Get dates in range
        dates = get_dates_in_range(start_date, end_date)
        if not dates:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "Invalid date range or format. Use YYYY-MM-DD."})
            }
        
        # Convert channels list to set for faster lookup
        channel_set = set(channels)
        
        # Consolidated metrics (same format as consolidated-insights API)
        consolidated = {
            "noOfOrders": 0,
            "grossSale": 0,
            "gstOnOrder": 0,
            "discounts": 0,
            "packings": 0,
            "ads": 0,  # Rista doesn't have ads, set to 0
            "commissionAndTaxes": 0,  # Rista doesn't have commission, set to 0
            "netSale": 0,
            "nbv": 0,
        }
        
        # Discount breakdown tracking
        discount_breakdown = {}
        
        # Fetch sales data for each branch
        for branch_id in branch_ids:
            # Fetch sales for all dates for this branch
            for day in dates:
                try:
                    orders = fetch_sales_for_day(day, branch_id, api_key, secret_key)
                    
                    for order in orders:
                        order_channel = order.get("channel")
                        
                        # Skip if not in selected channels or voided
                        if order_channel not in channel_set or order.get("status") == "Voided":
                            continue
                        
                        # Get metrics with defaults
                        tax_amount = order.get("taxAmount", 0) or 0
                        charge_amount = order.get("chargeAmount", 0) or 0
                        gross_amount = order.get("grossAmount", 0) or 0
                        total_discount_amount = abs(order.get("totalDiscountAmount", 0) or 0)
                        
                        # Calculate derived values
                        gross_sale = gross_amount + charge_amount
                        net_sale = gross_sale - tax_amount - total_discount_amount
                        
                        # Accumulate consolidated metrics
                        consolidated["noOfOrders"] += 1
                        consolidated["grossSale"] += gross_sale
                        consolidated["gstOnOrder"] += tax_amount
                        consolidated["discounts"] += total_discount_amount
                        consolidated["packings"] += charge_amount
                        consolidated["netSale"] += net_sale
                        consolidated["nbv"] += gross_sale - total_discount_amount  # NBV = Gross - Discounts
                        
                        # Track discount breakdown
                        if total_discount_amount > 0:
                            # Try to get discount reason/type from order
                            discount_reason = order.get("discountReason") or order.get("discountType") or "Other"
                            if discount_reason not in discount_breakdown:
                                discount_breakdown[discount_reason] = {
                                    "orders": 0,
                                    "discount": 0
                                }
                            discount_breakdown[discount_reason]["orders"] += 1
                            discount_breakdown[discount_reason]["discount"] += total_discount_amount
                        else:
                            # No discount
                            if "No Discount" not in discount_breakdown:
                                discount_breakdown["No Discount"] = {
                                    "orders": 0,
                                    "discount": 0
                                }
                            discount_breakdown["No Discount"]["orders"] += 1
                        
                except Exception as e:
                    print(f"Error fetching sales for branch {branch_id} on {day}: {str(e)}")
                    continue
        
        # Round all numeric values in consolidated
        for key in consolidated:
            if isinstance(consolidated[key], float):
                consolidated[key] = round(consolidated[key], 2)
        
        # Calculate percentages
        if consolidated["grossSale"] > 0:
            consolidated["discountPercent"] = round((consolidated["discounts"] / consolidated["grossSale"]) * 100, 2)
            consolidated["adsPercent"] = 0  # No ads for Rista
            consolidated["commissionPercent"] = 0  # No commission for Rista
        else:
            consolidated["discountPercent"] = 0
            consolidated["adsPercent"] = 0
            consolidated["commissionPercent"] = 0
        
        # Round discount breakdown values and add TOTAL
        total_discount_orders = 0
        total_discount_amount = 0
        for key in discount_breakdown:
            if isinstance(discount_breakdown[key]["discount"], float):
                discount_breakdown[key]["discount"] = round(discount_breakdown[key]["discount"], 2)
            total_discount_orders += discount_breakdown[key]["orders"]
            total_discount_amount += discount_breakdown[key]["discount"]
        
        discount_breakdown["TOTAL"] = {
            "orders": total_discount_orders,
            "discount": round(total_discount_amount, 2)
        }
        
        # Create restaurant ID from branch IDs
        restaurant_id = f"rista_{'-'.join(branch_ids)}"

        # Response in same format as consolidated-insights API
        response_body = {
            "restaurantId": restaurant_id,
            "startDate": start_date,
            "endDate": end_date,
            "consolidatedInsights": consolidated,
            "discountBreakdown": discount_breakdown,
            "platform": "rista",
            "channels": channels,
            "branchIds": branch_ids
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
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"})
        }
