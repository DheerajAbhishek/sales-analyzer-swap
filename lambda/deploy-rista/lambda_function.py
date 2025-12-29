import json
import os
import time
import re
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

import jwt

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
    
    req = Request(url, headers=headers, method='GET')
    with urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode('utf-8'))

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
        except (HTTPError, URLError) as e:
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
        # Parse request - support both GET query params and POST body
        query_params = event.get("queryStringParameters") or {}
        body = event.get("body")
        if body and isinstance(body, str):
            body = json.loads(body)
        else:
            body = {}
        
        # Get API credentials from environment variables (set in Lambda config)
        api_key = os.environ.get("VITE_RISTA_API_KEY")
        secret_key = os.environ.get("VITE_RISTA_SECRET_KEY")
        
        # Get other params from query string or body
        branch_id = query_params.get("branchId") or body.get("branchId")
        start_date = query_params.get("startDate") or body.get("startDate")
        end_date = query_params.get("endDate") or body.get("endDate")
        channel_param = query_params.get("channel") or body.get("channelName") or "takeaway"
        group_by = query_params.get("groupBy") or body.get("groupBy") or "total"
        
        # Map channel name to actual Rista API channel names
        channel_mapping = {
            "takeaway": "Takeaway - Swap",
            "swiggy": "Swiggy",
            "zomato": "Zomato",
            "corporate": "Corporate Orders"
        }
        channel_name = channel_mapping.get(channel_param.lower(), channel_param)
        
        if not all([api_key, secret_key, branch_id, start_date, end_date]):
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({
                    "error": "Missing required parameters",
                    "required": ["branchId", "startDate", "endDate"],
                    "note": "API credentials should be in Lambda environment variables"
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
        
        # Track which dates have data
        dates_with_data = set()
        
        # Consolidate results with daily breakdown
        consolidated = {
            "noOfOrders": 0,
            "grossSale": 0,
            "gstOnOrder": 0,
            "discounts": 0,
            "packings": 0,
            "netSale": 0,
            "ads": 0,
            "commissionAndTaxes": 0,
            "payout": 0
        }
        restaurant_name = ""
        daily_insights = {}
        
        # Debug: track what channels we see
        channels_seen = set()
        total_orders_fetched = 0

        for orders_for_one_day in daily_results:
            if orders_for_one_day and isinstance(orders_for_one_day, list):
                total_orders_fetched += len(orders_for_one_day)
                for order in orders_for_one_day:
                    # Track channels for debugging
                    order_channel = order.get("channel", "unknown")
                    channels_seen.add(order_channel)
                    
                    # Filter by channel name and only include closed orders
                    # For takeaway, match "Takeaway", "takeaway", "TAKEAWAY" etc.
                    if order_channel.lower() != channel_name.lower() or order.get("status") != "Closed":
                        continue

                    if not restaurant_name and order.get("branchName"):
                        restaurant_name = order.get("branchName")

                    tax_amount = order.get("taxAmount", 0) or 0
                    charge_amount = order.get("chargeAmount", 0) or 0
                    gross_amount = order.get("grossAmount", 0) or 0
                    total_discount_amount = order.get("totalDiscountAmount", 0) or 0
                    order_day = order.get("invoiceDay", "")

                    # Initialize daily data if needed
                    if order_day and order_day not in daily_insights:
                        daily_insights[order_day] = {
                            "noOfOrders": 0,
                            "grossSale": 0,
                            "grossSaleAfterGST": 0,
                            "gstOnOrder": 0,
                            "discounts": 0,
                            "packings": 0,
                            "netSale": 0,
                            "ads": 0,
                            "commissionAndTaxes": 0,
                            "payout": 0,
                            "netOrder": 0,
                            "totalDeductions": 0,
                            "netAdditions": 0,
                            "netPay": 0
                        }

                    # Calculate values for this order
                    gross_for_order = gross_amount + charge_amount
                    net_sale_for_order = gross_for_order - tax_amount - abs(total_discount_amount)
                    
                    # Net Order = Subtotal + Packaging - Discounts + GST
                    net_order_for_order = gross_amount + charge_amount - abs(total_discount_amount) + tax_amount

                    # Update consolidated totals
                    consolidated["noOfOrders"] += 1
                    consolidated["grossSale"] += gross_for_order
                    consolidated["gstOnOrder"] += tax_amount
                    consolidated["discounts"] += abs(total_discount_amount)
                    consolidated["packings"] += charge_amount
                    consolidated["netSale"] += net_sale_for_order
                    consolidated["payout"] += net_sale_for_order  # For takeaway, payout = netSale (no commissions)

                    # Update daily totals
                    if order_day:
                        dates_with_data.add(order_day)  # Track that this date has data
                        daily_insights[order_day]["noOfOrders"] += 1
                        daily_insights[order_day]["grossSale"] += gross_for_order
                        daily_insights[order_day]["grossSaleAfterGST"] += gross_for_order  # No separate GST for takeaway
                        daily_insights[order_day]["gstOnOrder"] += tax_amount
                        daily_insights[order_day]["discounts"] += abs(total_discount_amount)
                        daily_insights[order_day]["packings"] += charge_amount
                        daily_insights[order_day]["netSale"] += net_sale_for_order
                        daily_insights[order_day]["payout"] += net_sale_for_order
                        daily_insights[order_day]["netOrder"] += net_order_for_order
        
        # Calculate percentages
        nbv = consolidated["grossSale"] - consolidated["discounts"]
        discount_percent = (consolidated["discounts"] / consolidated["grossSale"] * 100) if consolidated["grossSale"] > 0 else 0
        
        # Round daily insights
        for day in daily_insights:
            for key in ["grossSale", "gstOnOrder", "discounts", "packings", "netSale", "ads", "commissionAndTaxes", "payout"]:
                daily_insights[day][key] = round(daily_insights[day][key], 2)
            
            # Add NBV and percentages to daily
            daily_nbv = daily_insights[day]["grossSale"] - daily_insights[day]["discounts"]
            daily_insights[day]["nbv"] = round(daily_nbv, 2)
            daily_insights[day]["commissionPercent"] = 0
            daily_insights[day]["discountPercent"] = round(
                (daily_insights[day]["discounts"] / daily_insights[day]["grossSale"] * 100) 
                if daily_insights[day]["grossSale"] > 0 else 0, 2
            )
            daily_insights[day]["adsPercent"] = 0
        
        # Calculate missing dates
        all_dates_set = set(dates)
        missing_dates = sorted(list(all_dates_set - dates_with_data))
        data_coverage = f"{len(dates_with_data)}/{len(dates)}"

        # Calculate percentages and additional metrics
        gross_sale_total = consolidated["grossSale"]
        discount_percent = (consolidated["discounts"] / gross_sale_total * 100) if gross_sale_total > 0 else 0
        nbv = gross_sale_total - consolidated["discounts"]
        
        # Calculate Net Order for consolidated (Gross - Discounts + GST)
        net_order_total = gross_sale_total - consolidated["discounts"] + consolidated["gstOnOrder"]
        
        # For takeaway: no commissions/deductions, so totalDeductions = 0
        total_deductions = 0
        net_additions = 0
        
        # Net Pay = Net Order - Deductions + Net Additions - Ads
        net_pay_total = net_order_total - total_deductions + net_additions - consolidated["ads"]
        
        commission_percent = (consolidated["commissionAndTaxes"] / gross_sale_total * 100) if gross_sale_total > 0 else 0
        ads_percent = (consolidated["ads"] / gross_sale_total * 100) if gross_sale_total > 0 else 0
        
        # Round daily insights and add calculated fields
        for day in daily_insights:
            for key in ["grossSale", "grossSaleAfterGST", "gstOnOrder", "discounts", "packings", "netSale", "ads", "commissionAndTaxes", "payout", "netOrder", "totalDeductions", "netAdditions", "netPay"]:
                daily_insights[day][key] = round(daily_insights[day][key], 2)
            
            # Calculate Net Pay for daily
            daily_insights[day]["netPay"] = daily_insights[day]["netOrder"] - daily_insights[day]["totalDeductions"] + daily_insights[day]["netAdditions"]
            
            # Add NBV and percentages to daily
            daily_nbv = daily_insights[day]["grossSale"] - daily_insights[day]["discounts"]
            daily_insights[day]["nbv"] = round(daily_nbv, 2)
            daily_insights[day]["commissionPercent"] = 0
            daily_insights[day]["discountPercent"] = round(
                (daily_insights[day]["discounts"] / daily_insights[day]["grossSale"] * 100) 
                if daily_insights[day]["grossSale"] > 0 else 0, 2
            )
            daily_insights[day]["adsPercent"] = 0
        
        # --- NEW GROUPING LOGIC for week/month ---
        if group_by in ['month', 'week']:
            grouped_data = {}
            for day_str, day_data in daily_insights.items():
                try:
                    day_date = datetime.strptime(day_str, '%Y-%m-%d')
                    
                    if group_by == 'month':
                        period_key = day_date.strftime('%Y-%m')  # e.g., "2025-12"
                    else:  # week
                        week_start = day_date - timedelta(days=day_date.weekday())
                        period_key = week_start.strftime('%Y-%m-%d')  # e.g., "2025-12-16"
                    
                    if period_key not in grouped_data:
                        grouped_data[period_key] = {
                            "noOfOrders": 0, "grossSale": 0, "grossSaleAfterGST": 0, "gstOnOrder": 0,
                            "discounts": 0, "packings": 0, "netSale": 0, "ads": 0,
                            "commissionAndTaxes": 0, "payout": 0, "netOrder": 0,
                            "totalDeductions": 0, "netAdditions": 0, "netPay": 0
                        }
                    
                    # Sum up metrics for this period
                    for key in grouped_data[period_key].keys():
                        grouped_data[period_key][key] += day_data.get(key, 0)
                except ValueError:
                    continue  # Skip invalid dates
            
            # Build timeSeriesData array
            time_series_data = []
            for period_key in sorted(grouped_data.keys()):
                period_metrics = grouped_data[period_key]
                
                # Calculate breakdowns for this period
                period_net_order = period_metrics["grossSale"] - period_metrics["discounts"] + period_metrics["gstOnOrder"]
                period_total_deductions = 0  # Takeaway has no deductions
                period_net_additions = 0
                period_net_pay = period_net_order - period_total_deductions + period_net_additions
                
                time_series_data.append({
                    "period": period_key,
                    channel_param: {  # Use original channel parameter (e.g., "takeaway"), not display name
                        "noOfOrders": round(period_metrics["noOfOrders"], 2),
                        "grossSale": round(period_metrics["grossSale"], 2),
                        "grossSaleWithGST": round(period_metrics["grossSale"] + period_metrics["gstOnOrder"], 2),
                        "grossSaleAfterGST": round(period_metrics["grossSaleAfterGST"], 2),
                        "gstOnOrder": round(period_metrics["gstOnOrder"], 2),
                        "discounts": round(period_metrics["discounts"], 2),
                        "packings": round(period_metrics["packings"], 2),
                        "ads": round(period_metrics["ads"], 2),
                        "commissionAndTaxes": round(period_metrics["commissionAndTaxes"], 2),
                        "payout": round(period_metrics["payout"], 2),
                        "netSale": round(period_metrics["netSale"], 2),
                        "netOrder": round(period_net_order, 2),
                        "totalDeductions": round(period_total_deductions, 2),
                        "netAdditions": round(period_net_additions, 2),
                        "netPay": round(period_net_pay, 2),
                        "netOrderBreakdown": {
                            "subtotal": round(period_metrics["grossSale"] - period_metrics["packings"], 2),
                            "packaging": round(period_metrics["packings"], 2),
                            "discountsPromo": round(period_metrics["discounts"], 2),
                            "discountsBogo": 0,
                            "gst": round(period_metrics["gstOnOrder"], 2),
                            "total": round(period_net_order, 2)
                        },
                        "deductionsBreakdown": {
                            "commission": {
                                "baseServiceFee": 0, "paymentMechanismFee": 0,
                                "longDistanceFee": 0, "serviceFeeDiscount": 0, "total": 0
                            },
                            "taxes": {"taxOnService": 0, "tds": 0, "gst": 0, "total": 0},
                            "otherDeductions": 0, "totalDeductions": 0
                        }
                    }
                })
            
            # Return timeSeriesData format
            response_body = {
                "restaurantId": restaurant_name,
                "startDate": start_date,
                "endDate": end_date,
                "body": {
                    "timeSeriesData": time_series_data,
                    "discountBreakdown": {}
                },
                "missingDates": missing_dates,
                "dataCoverage": data_coverage
            }
        else:
            # Original total summary format
            response_body = {
            "restaurantId": restaurant_name,
            "startDate": start_date,
            "endDate": end_date,
            "body": {
                "consolidatedInsights": {
                    "noOfOrders": consolidated["noOfOrders"],
                    "grossSale": round(consolidated["grossSale"], 2),
                    "grossSaleWithGST": round(consolidated["grossSale"] + consolidated["gstOnOrder"], 2),
                    "grossSaleAfterGST": round(consolidated["grossSale"], 2),  # For takeaway, same as grossSale
                    "gstOnOrder": round(consolidated["gstOnOrder"], 2),
                    "discounts": round(consolidated["discounts"], 2),
                    "packings": round(consolidated["packings"], 2),
                    "ads": round(consolidated["ads"], 2),
                    "commissionAndTaxes": round(consolidated["commissionAndTaxes"], 2),
                    "payout": round(consolidated["payout"], 2),
                    "netSale": round(consolidated["netSale"], 2),
                    "nbv": round(nbv, 2),
                    "netOrder": round(net_order_total, 2),
                    "totalDeductions": round(total_deductions, 2),
                    "netAdditions": round(net_additions, 2),
                    "netPay": round(net_pay_total, 2),
                    "commissionPercent": round(commission_percent, 2),
                    "discountPercent": round(discount_percent, 2),
                    "adsPercent": round(ads_percent, 2),
                    "netOrderBreakdown": {
                        "subtotal": round(consolidated["grossSale"] - consolidated["packings"], 2),
                        "packaging": round(consolidated["packings"], 2),
                        "discountsPromo": round(consolidated["discounts"], 2),
                        "discountsBogo": 0,
                        "gst": round(consolidated["gstOnOrder"], 2),
                        "total": round(net_order_total, 2)
                    },
                    "deductionsBreakdown": {
                        "commission": {
                            "baseServiceFee": 0,
                            "paymentMechanismFee": 0,
                            "longDistanceFee": 0,
                            "serviceFeeDiscount": 0,
                            "total": 0
                        },
                        "taxes": {
                            "taxOnService": 0,
                            "tds": 0,
                            "gst": 0,
                            "total": 0
                        },
                        "otherDeductions": 0,
                        "totalDeductions": 0
                    }
                },
                "dailyInsights": daily_insights,
                "discountBreakdown": {},
                "_debug": {
                    "totalOrdersFetched": total_orders_fetched,
                    "channelsSeen": list(channels_seen),
                    "filteringFor": channel_name,
                    "datesQueried": dates
                }
            },
            "missingDates": missing_dates,
            "dataCoverage": data_coverage
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
