import json
import os
import boto3
from datetime import datetime, timedelta
import logging

# -------------------------------------------------
# Logging setup
# -------------------------------------------------
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# -------------------------------------------------
# AWS setup
# -------------------------------------------------
s3 = boto3.client("s3")
BUCKET = os.environ.get("BUCKET_NAME")

# -------------------------------------------------
# Helper: build standard CORS response
# -------------------------------------------------
def _cors_response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
            "Access-Control-Allow-Headers": "Content-Type,Authorization"
        },
        "body": json.dumps(body)
    }

# -------------------------------------------------
# Core business logic helpers
# -------------------------------------------------
def _calculate_final_metrics(data):
    try:
        gross_sale = float(data.get('grossSale', 0.0))
        discounts = abs(float(data.get('discounts', 0.0)))
        gst_on_order = float(data.get('gstOnOrder', 0.0))
        commission_and_taxes = float(data.get('commissionAndTaxes', 0.0))
        ads = float(data.get('ads', 0.0))
        payout = float(data.get('payout', 0.0))

        nbv = gross_sale - discounts
        net_sale = payout - ads if (payout or ads) else float(data.get('netSale', 0.0))

        commission_percent = (commission_and_taxes / nbv * 100) if nbv > 0 else 0.0
        discount_percent = (discounts / gross_sale * 100) if gross_sale > 0 else 0.0
        ads_percent = (ads / gross_sale * 100) if gross_sale > 0 else 0.0

        return {
            "noOfOrders": int(data.get('processedOrdersCount', 0)),
            "grossSale": round(gross_sale, 2),
            "gstOnOrder": round(gst_on_order, 2),
            "discounts": round(discounts, 2),
            "packings": round(float(data.get('packings', 0.0)), 2),
            "ads": round(ads, 2),
            "commissionAndTaxes": round(commission_and_taxes, 2),
            "netSale": round(net_sale, 2),
            "nbv": round(nbv, 2),
            "commissionPercent": round(commission_percent, 2),
            "discountPercent": round(discount_percent, 2),
            "adsPercent": round(ads_percent, 2)
        }
    except (TypeError, ValueError) as e:
        logger.error(f"Error in _calculate_final_metrics: {e}, data: {data}")
        # Return default values
        return {
            "noOfOrders": 0,
            "grossSale": 0.0,
            "gstOnOrder": 0.0,
            "discounts": 0.0,
            "packings": 0.0,
            "ads": 0.0,
            "commissionAndTaxes": 0.0,
            "netSale": 0.0,
            "nbv": 0.0,
            "commissionPercent": 0.0,
            "discountPercent": 0.0,
            "adsPercent": 0.0
        }

def merge_discount_breakdowns(reports):
    """Merge discount breakdowns across reports. Works for both Swiggy and Zomato structures."""
    try:
        logger.info(f"Merging discount breakdowns from {len(reports)} reports")
        seen_hashes = set()
        consolidated = {}

        for i, report in enumerate(reports):
            if i % 50 == 0:  # Log progress for large datasets
                logger.info(f"Processing discount breakdown {i+1}/{len(reports)}")
                
            file_hashes = report.get("processedFileHashes", [])
            file_hash = file_hashes[0] if file_hashes else None

            if not file_hash or file_hash in seen_hashes:
                continue
            seen_hashes.add(file_hash)

            breakdown = report.get("discountBreakdown", {})
            if not breakdown:  # Skip if no discount breakdown
                continue
                
            for offer, values in breakdown.items():
                if offer == "TOTAL":
                    continue

                # --- Zomato case ---
                if "totalDiscountPromo" in values or "totalDiscount" in values:
                    key_name = "totalDiscountPromo" if "totalDiscountPromo" in values else "totalDiscount"
                    if offer not in consolidated:
                        consolidated[offer] = {
                            "orders": 0,
                            "totalDiscount": 0.0,
                            "offerValue": values.get("extractedValue") or values.get("offerValue")
                        }
                    consolidated[offer]["orders"] += int(values.get("orders", 0))
                    consolidated[offer]["totalDiscount"] += float(values.get(key_name, 0.0))

                # --- Swiggy case ---
                elif "discount" in values:
                    if offer not in consolidated:
                        consolidated[offer] = {"orders": 0, "discount": 0.0}
                    consolidated[offer]["orders"] += int(values.get("orders", 0))
                    consolidated[offer]["discount"] += float(values.get("discount", 0.0))

        logger.info(f"Consolidated {len(consolidated)} discount offers")
        
        # --- Recompute for Zomato offers ---
        for offer, vals in consolidated.items():
            if "totalDiscount" in vals:  # Zomato normalized schema
                orders = vals["orders"]
                total_disc = vals["totalDiscount"]
                avg = total_disc / orders if orders > 0 else 0.0
                offer_val = vals.get("offerValue")

                realization = None
                if offer_val and offer_val > 0:
                    realization = round((avg / offer_val) * 100, 2)

                vals["avgDiscountPerOrder"] = round(avg, 2)
                vals["valueRealizationPercentage"] = realization

        # --- Add TOTAL ---
        if any("totalDiscount" in v for v in consolidated.values()):  # Zomato style
            total_orders = sum(v["orders"] for v in consolidated.values())
            total_discount = sum(v["totalDiscount"] for v in consolidated.values())
            consolidated["TOTAL"] = {
                "orders": int(total_orders),
                "totalDiscount": round(total_discount, 2)
            }
        elif consolidated:  # Swiggy style (only if we have data)
            total_orders = sum(v["orders"] for v in consolidated.values())
            total_discount = sum(v["discount"] for v in consolidated.values())
            consolidated["TOTAL"] = {
                "orders": int(total_orders),
                "discount": round(total_discount, 2)
            }

        # --- Ordering: offers first, Undefined/Unknown next, TOTAL last ---
        ordered = {}
        regular_offers = [k for k in consolidated if k not in ["Undefined", "Unknown", "TOTAL"]]
        for key in sorted(regular_offers):
            ordered[key] = consolidated[key]
        if "Undefined" in consolidated:
            ordered["Undefined"] = consolidated["Undefined"]
        if "Unknown" in consolidated:
            ordered["Unknown"] = consolidated["Unknown"]
        if "TOTAL" in consolidated:
            ordered["TOTAL"] = consolidated["TOTAL"]

        logger.info(f"Returning {len(ordered)} consolidated discount offers")
        return ordered
    
    except Exception as e:
        logger.error(f"Error in merge_discount_breakdowns: {e}", exc_info=True)
        return {}

# -------------------------------------------------
# Lambda Handler
# -------------------------------------------------
def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")

    # ✅ Handle preflight (CORS)
    if event.get("httpMethod") == "OPTIONS":
        return _cors_response(200, {"message": "CORS preflight success"})

    try:
        params = event.get("queryStringParameters") or {}
        restaurant_id = params.get("restaurantId")
        start_date_str = params.get("startDate")
        end_date_str = params.get("endDate")
        group_by = params.get("groupBy")
        business_email = params.get("businessEmail") or params.get("business_email")

        if not business_email:
            try:
                body = json.loads(event.get("body") or "{}")
                business_email = body.get("businessEmail") or body.get("business_email")
            except Exception:
                business_email = None

        def _sanitize_email_for_key(email: str) -> str:
            if not email:
                return "unknown"
            e = email.strip().lower().replace("@", "_at_").replace(".", "_dot_")
            import re
            return re.sub(r"[^a-z0-9_\-]", "_", e)

        user_folder = _sanitize_email_for_key(business_email) if business_email else None

        if not all([restaurant_id, start_date_str, end_date_str]):
            return _cors_response(400, {"error": "Missing required parameters"})

        user_start_date = datetime.fromisoformat(start_date_str).date()
        user_end_date = datetime.fromisoformat(end_date_str).date()

        prefix = f"users/{user_folder}/daily-insights/{restaurant_id}/" if user_folder else f"daily-insights/{restaurant_id}/"
        logger.info(f"Searching for files with prefix: {prefix}")

        # More efficient: only load files that are potentially in our date range
        paginator = s3.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=BUCKET, Prefix=prefix)
        
        reports_in_range = []
        total_files_found = 0
        files_processed = 0
        
        # Process files directly during pagination to avoid loading all files
        for page in pages:
            if "Contents" in page:
                total_files_found += len(page["Contents"])
                
                for obj in page["Contents"]:
                    if not obj["Key"].endswith(".json"):
                        continue
                    
                    # Extract date from filename to filter early
                    filename = obj["Key"].split("/")[-1]  # Get just the filename
                    if filename.endswith(".json"):
                        try:
                            # Filename format should be YYYY-MM-DD.json
                            date_str = filename.replace(".json", "")
                            file_date = datetime.fromisoformat(date_str).date()
                            
                            # Only process files within our date range
                            if user_start_date <= file_date <= user_end_date:
                                files_processed += 1
                                if files_processed % 10 == 0:
                                    logger.info(f"Processing relevant file {files_processed} (Date: {date_str})")
                                
                                s3_object = s3.get_object(Bucket=BUCKET, Key=obj["Key"])
                                day_data = json.loads(s3_object["Body"].read().decode("utf-8"))
                                day_data["reportDateObj"] = file_date
                                reports_in_range.append(day_data)
                                
                        except Exception as e:
                            logger.warning(f"Skipping file {obj['Key']} due to date parse or read error: {e}")
                            continue
        
        logger.info(f"Total files in S3: {total_files_found}, Processed files in date range: {files_processed}")

        if not reports_in_range:
            return _cors_response(200, {"message": "No data found for the selected date range."})

        sum_keys = ["processedOrdersCount", "grossSale", "gstOnOrder", "discounts", "packings", "commissionAndTaxes", "payout", "ads", "netSale"]

        if group_by in ["month", "week"]:
            logger.info(f"Processing time series data grouped by {group_by}")
            grouped_data = {}
            for report in reports_in_range:
                report_date = report["reportDateObj"]
                if group_by == "month":
                    period_key = report_date.strftime("%Y-%m")
                else:
                    week_start = report_date - timedelta(days=report_date.weekday())
                    period_key = week_start.strftime("%Y-%m-%d")

                platform = report.get("platform", "unknown")
                grouped_data.setdefault(period_key, {}).setdefault(platform, {k: 0 for k in sum_keys})
                for k in sum_keys:
                    # Ensure we're adding numeric values
                    value = report.get(k, 0)
                    try:
                        grouped_data[period_key][platform][k] += float(value) if value is not None else 0.0
                    except (TypeError, ValueError):
                        logger.warning(f"Invalid value for {k}: {value} in report {report.get('reportDate', 'unknown')}")
                        grouped_data[period_key][platform][k] += 0.0

            logger.info("Calculating metrics for time series data")
            time_series_data = []
            for period, platforms in sorted(grouped_data.items()):
                period_data = {"period": period}
                for platform, data in platforms.items():
                    period_data[platform] = _calculate_final_metrics(data)
                time_series_data.append(period_data)

            logger.info("Merging discount breakdowns for time series")
            discount_breakdown = merge_discount_breakdowns(reports_in_range)
            final_response_body = {"timeSeriesData": time_series_data, "discountBreakdown": discount_breakdown}

        else:
            logger.info("Processing consolidated data")
            consolidated = {k: 0 for k in sum_keys}
            for report in reports_in_range:
                for k in sum_keys:
                    # Ensure we're adding numeric values
                    value = report.get(k, 0)
                    try:
                        consolidated[k] += float(value) if value is not None else 0.0
                    except (TypeError, ValueError):
                        logger.warning(f"Invalid value for {k}: {value} in report {report.get('reportDate', 'unknown')}")
                        consolidated[k] += 0.0
            
            logger.info("Calculating final metrics")
            final_insights = _calculate_final_metrics(consolidated)
            logger.info("Merging discount breakdowns")
            discount_breakdown = merge_discount_breakdowns(reports_in_range)
            final_response_body = {"consolidatedInsights": final_insights, "discountBreakdown": discount_breakdown}

        # --- FINAL RESPONSE CONSTRUCTION ---
        logger.info("Constructing final response")
        # Make sure frontend gets a flat JSON without nested 'body'
        final_response_body["restaurantId"] = restaurant_id
        final_response_body["startDate"] = start_date_str
        final_response_body["endDate"] = end_date_str

        # Always include discountBreakdown and insights/timeSeries at top level
        if group_by in ["month", "week"]:
            result = {
                "restaurantId": restaurant_id,
                "startDate": start_date_str,
                "endDate": end_date_str,
                "timeSeriesData": final_response_body.get("timeSeriesData", []),
                "discountBreakdown": final_response_body.get("discountBreakdown", {})
            }
        else:
            result = {
                "restaurantId": restaurant_id,
                "startDate": start_date_str,
                "endDate": end_date_str,
                "consolidatedInsights": final_response_body.get("consolidatedInsights", {}),
                "discountBreakdown": final_response_body.get("discountBreakdown", {})
            }

        logger.info("Successfully processed request, returning response")
        # ✅ Return clean response directly (no nested body)
        return _cors_response(200, result)

    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}", exc_info=True)
        return _cors_response(500, {"error": "Internal server error"})
