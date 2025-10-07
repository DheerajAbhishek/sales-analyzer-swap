import json
import os
import boto3
from datetime import datetime, timedelta
import logging

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")
BUCKET = os.environ.get("BUCKET_NAME")

def _calculate_final_metrics(data):
    """Calculates NBV, Net Sale, and percentages from a consolidated data dictionary."""
    gross_sale = data.get('grossSale', 0.0)
    discounts = abs(data.get('discounts', 0.0))   # ensure positive
    gst_on_order = data.get('gstOnOrder', 0.0)
    commission_and_taxes = data.get('commissionAndTaxes', 0.0)
    ads = data.get('ads', 0.0)
    payout = data.get('payout', 0.0)

    nbv = gross_sale - discounts
    # Use netSale directly if present (for takeaway & swiggy/zomato daily JSONs)
    net_sale = payout - ads if (payout or ads) else data.get('netSale', 0.0)

    commission_percent = (commission_and_taxes / nbv * 100) if nbv > 0 else 0.0
    discount_percent = (discounts / gross_sale * 100) if gross_sale > 0 else 0.0
    ads_percent = (ads / gross_sale * 100) if gross_sale > 0 else 0.0

    return {
        "noOfOrders": data.get('processedOrdersCount', 0),
        "grossSale": round(gross_sale, 2),
        "gstOnOrder": round(gst_on_order, 2),
        "discounts": round(discounts, 2),
        "packings": round(data.get('packings', 0.0), 2),
        "ads": round(ads, 2),
        "commissionAndTaxes": round(commission_and_taxes, 2),
        "netSale": round(net_sale, 2),
        "nbv": round(nbv, 2),
        "commissionPercent": round(commission_percent, 2),
        "discountPercent": round(discount_percent, 2),
        "adsPercent": round(ads_percent, 2)
    }

def merge_discount_breakdowns(reports):
    """Merge discount breakdowns across reports. Works for both Swiggy and Zomato structures."""
    seen_hashes = set()
    consolidated = {}

    for report in reports:
        file_hashes = report.get("processedFileHashes", [])
        file_hash = file_hashes[0] if file_hashes else None

        if not file_hash or file_hash in seen_hashes:
            continue
        seen_hashes.add(file_hash)

        breakdown = report.get("discountBreakdown", {})
        for offer, values in breakdown.items():
            if offer == "TOTAL":
                continue

            # --- Zomato case ---
            if "totalDiscountPromo" in values:
                if offer not in consolidated:
                    consolidated[offer] = {
                        "orders": 0,
                        "totalDiscountPromo": 0.0,
                        "extractedValue": values.get("extractedValue")
                    }
                consolidated[offer]["orders"] += values.get("orders", 0)
                consolidated[offer]["totalDiscountPromo"] += values.get("totalDiscountPromo", 0.0)

            # --- Swiggy case ---
            elif "discount" in values:
                if offer not in consolidated:
                    consolidated[offer] = {"orders": 0, "discount": 0.0}
                consolidated[offer]["orders"] += values.get("orders", 0)
                consolidated[offer]["discount"] += values.get("discount", 0.0)

    # --- Recompute x + % for Zomato offers ---
    for offer, vals in consolidated.items():
        if "totalDiscountPromo" in vals:
            orders = vals["orders"]
            total_disc = vals["totalDiscountPromo"]
            x = total_disc / orders if orders > 0 else 0.0
            extracted_val = vals.get("extractedValue")

            swap_share = None
            if extracted_val and extracted_val > 0:
                swap_share = round((x / extracted_val) * 100, 2)

            vals["x"] = round(x, 2)
            vals["Swap_share_percentage"] = swap_share

    # --- Add TOTAL ---
    if any("totalDiscountPromo" in v for v in consolidated.values()):  # Zomato style
        total_orders = sum(v["orders"] for v in consolidated.values())
        total_discount = sum(v["totalDiscountPromo"] for v in consolidated.values())
        consolidated["TOTAL"] = {
            "orders": total_orders,
            "totalDiscountPromo": round(total_discount, 2)
        }
    else:  # Swiggy style
        total_orders = sum(v["orders"] for v in consolidated.values())
        total_discount = sum(v["discount"] for v in consolidated.values())
        consolidated["TOTAL"] = {
            "orders": total_orders,
            "discount": round(total_discount, 2)
        }

    # --- Ordering: offers first, Undefined/Unknown next, TOTAL last ---
    ordered = {}
    for key in sorted([k for k in consolidated if k not in ["Undefined", "Unknown", "TOTAL"]]):
        ordered[key] = consolidated[key]
    if "Undefined" in consolidated:
        ordered["Undefined"] = consolidated["Undefined"]
    if "Unknown" in consolidated:
        ordered["Unknown"] = consolidated["Unknown"]
    ordered["TOTAL"] = consolidated["TOTAL"]

    return ordered

def lambda_handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        restaurant_id = params.get("restaurantId")
        start_date_str = params.get("startDate")
        end_date_str = params.get("endDate")
        group_by = params.get("groupBy") # 'month' or 'week'

        if not all([restaurant_id, start_date_str, end_date_str]):
            return { "statusCode": 400, "body": json.dumps({"error": "Missing required parameters"}) }

        user_start_date = datetime.fromisoformat(start_date_str).date()
        user_end_date = datetime.fromisoformat(end_date_str).date()

        prefix = f"daily-insights/{restaurant_id}/"
        paginator = s3.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=BUCKET, Prefix=prefix)
        insight_files = [obj['Key'] for page in pages for obj in page.get('Contents', []) if obj['Key'].endswith('.json')]

        if not insight_files:
            return { "statusCode": 200, "body": json.dumps({"message": "No data found for this restaurant."}) }

        all_daily_reports = []
        for key in insight_files:
            try:
                s3_object = s3.get_object(Bucket=BUCKET, Key=key)
                day_data = json.loads(s3_object['Body'].read().decode('utf-8'))
                day_data['reportDateObj'] = datetime.fromisoformat(day_data['reportDate']).date()
                all_daily_reports.append(day_data)
            except Exception as e:
                logger.warning(f"Skipping file {key} due to a read/parse error: {e}")
                continue

        reports_in_range = [r for r in all_daily_reports if user_start_date <= r['reportDateObj'] <= user_end_date]

        if not reports_in_range:
            return { "statusCode": 200, "body": json.dumps({"message": "No data found for the selected date range."}) }

        sum_keys = [
            "processedOrdersCount", "grossSale", "gstOnOrder",
            "discounts", "packings", "commissionAndTaxes",
            "payout", "ads", "netSale"
        ]
        
        # --- NEW GROUPING LOGIC ---
        if group_by in ['month', 'week']:
            grouped_data = {}
            for report in reports_in_range:
                period_key = ""
                report_date = report['reportDateObj']
                
                if group_by == 'month':
                    period_key = report_date.strftime('%Y-%m') # e.g., "2025-07"
                elif group_by == 'week':
                    week_start = report_date - timedelta(days=report_date.weekday())
                    period_key = week_start.strftime('%Y-%m-%d') # e.g., "2025-07-01"

                platform = report.get('platform', 'unknown')
                
                if period_key not in grouped_data:
                    grouped_data[period_key] = {}
                if platform not in grouped_data[period_key]:
                    grouped_data[period_key][platform] = {key: 0 for key in sum_keys}
                
                for key in sum_keys:
                    grouped_data[period_key][platform][key] += report.get(key, 0)
            
            time_series_data = []
            for period, platforms in sorted(grouped_data.items()):
                period_data = {"period": period}
                for platform, data in platforms.items():
                    period_data[platform] = _calculate_final_metrics(data)
                time_series_data.append(period_data)
            
            discount_breakdown = merge_discount_breakdowns(reports_in_range)
            final_response_body = {"timeSeriesData": time_series_data, "discountBreakdown": discount_breakdown}

        # --- ORIGINAL CONSOLIDATION LOGIC (if not grouping) ---
        else:
            consolidated = {key: 0 for key in sum_keys}
            for report in reports_in_range:
                for key in sum_keys:
                    consolidated[key] += report.get(key, 0)
            
            final_insights = _calculate_final_metrics(consolidated)
            discount_breakdown = merge_discount_breakdowns(reports_in_range)
            final_response_body = {"consolidatedInsights": final_insights, "discountBreakdown": discount_breakdown}

        final_response = {
            "restaurantId": restaurant_id,
            "startDate": start_date_str,
            "endDate": end_date_str,
            "body": final_response_body
        }

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps(final_response)
        }

    except Exception as e:
        logger.error(f"An unhandled exception occurred: {str(e)}", exc_info=True)
        return { "statusCode": 500, "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, "body": json.dumps({"error": "An internal server error occurred."}) }
