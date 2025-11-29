import json
import os
import boto3
import pandas as pd
import logging
import re
import hashlib
from botocore.exceptions import ClientError

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
BUCKET = os.environ.get("BUCKET_NAME")
JOBS_TABLE_NAME = os.environ.get("JOBS_TABLE_NAME")


def get_file_hash(file_path):
    """Calculates the MD5 hash of a file."""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


def detect_format(columns):
    """Inspects column names to determine the format."""
    # Normalize to strings
    cols = [str(c) for c in columns]
    if any(re.search(r"Week No\.", col, re.IGNORECASE) for col in cols):
        return "zomato"
    if any(re.search(r"Item Total", col, re.IGNORECASE) for col in cols):
        return "swiggy"
    if any(re.search(r"Branch Name", col, re.IGNORECASE) for col in cols) and \
       any(re.search(r"Order Source", col, re.IGNORECASE) for col in cols):
        return "takeaway"
    return "unknown"


def safe_num(val):
    """Safely convert messy Excel/CSV values to float."""
    try:
        s = str(val)
        if s.strip() in ["", "-", "–", "—", "nan", "None", "NaN", "NULL"]:
            return 0.0
        s = s.replace(",", "").replace("₹", "").replace("Rs.", "").strip()
        return float(s)
    except Exception:
        return 0.0


def read_file(tmp_path, file_ext, skiprows=0, sheet_name=None):
    """Helper: read Excel or CSV with correct engine and options."""
    if file_ext == ".csv":
        # CSV has no sheets; skiprows applies to header junk lines
        return pd.read_csv(tmp_path, skiprows=skiprows)
    else:
        return pd.read_excel(tmp_path, engine="openpyxl",
                             skiprows=skiprows, sheet_name=sheet_name)


def lambda_handler(event, context):
    job_id = event.get("requestContext", {}).get("jobId")

    def _sanitize_email_for_key(email: str) -> str:
        if not email:
            return "unknown"
        e = email.strip().lower()
        e = e.replace("@", "_at_")
        e = e.replace(".", "_dot_")
        import re

        e = re.sub(r"[^a-z0-9_\-]", "_", e)
        return e

    try:
        # ---------------- File Processing ----------------
        params = event.get("queryStringParameters") or {}
        filename_from_event = params.get("filename")
        # businessEmail may be passed as a query param or in request body
        business_email = params.get("businessEmail") or params.get("business_email")
        if not business_email:
            # try to get from body if available
            try:
                body = json.loads(event.get("body") or "{}")
                business_email = body.get("businessEmail") or body.get("business_email")
            except Exception:
                business_email = None

        user_folder = _sanitize_email_for_key(business_email) if business_email else None

        if not filename_from_event:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing 'filename' query parameter"}),
            }

        tmp_path = f"/tmp/{os.path.basename(filename_from_event)}"
        s3.download_file(BUCKET, filename_from_event, tmp_path)
        file_hash = get_file_hash(tmp_path)

        file_ext = os.path.splitext(filename_from_event)[1].lower()
        logger.info(f"✅ File downloaded: {filename_from_event}, format: {file_ext}")
        logger.info(
            f"Processing file '{filename_from_event}' with hash: {file_hash} and extension {file_ext}"
        )

        df, file_format = None, "unknown"

        # Try Zomato (Order Level, skip first 6 rows)
        try:
            temp_df = read_file(tmp_path, file_ext, skiprows=6, sheet_name="Order Level")
            if detect_format(temp_df.columns) == "zomato":
                df, file_format = temp_df, "zomato"
        except Exception:
            pass

        # Try Swiggy (Order Level, skip first 2 rows)
        if df is None:
            try:
                temp_df = read_file(tmp_path, file_ext, skiprows=2, sheet_name="Order Level")
                if detect_format(temp_df.columns) == "swiggy":
                    df, file_format = temp_df, "swiggy"
            except Exception:
                pass

        # Try Takeaway (single sheet/file, skip first 1 row as per your files)
        if df is None:
            try:
                temp_df = read_file(tmp_path, file_ext, skiprows=1)
                if detect_format(temp_df.columns) == "takeaway":
                    df, file_format = temp_df, "takeaway"
            except Exception:
                pass

        if df is None:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Could not determine file format."}),
            }

        # --- Ads Extraction ---
        total_ads = 0.0
        logger.info(f"Starting Ads Extraction for format: {file_format}")

        if file_format == "zomato" and file_ext != ".csv":
            # Zomato ads only exist in Excel multi-sheet reports
            try:
                ads_df = pd.read_excel(
                    tmp_path,
                    engine="openpyxl",
                    sheet_name="Addition Deductions Details",
                    header=None,
                )
                header_row_index = -1
                for i, row in ads_df.iterrows():
                    if any("Investments in growth services" in str(cell) for cell in row):
                        header_row_index = i + 1
                        break

                if header_row_index != -1 and header_row_index < len(ads_df):
                    new_header = ads_df.iloc[header_row_index]
                    sub_df = ads_df[header_row_index + 1:].copy()
                    sub_df.columns = [str(c).strip() for c in new_header]

                    particulars_col = "Type"
                    total_col = "Total amount"

                    if particulars_col in sub_df.columns and total_col in sub_df.columns:
                        sub_df["_norm_particulars"] = (
                            sub_df[particulars_col].astype(str).str.strip().str.lower()
                        )
                        target_row_text = "total ads & miscellaneous services"
                        target_row = sub_df[sub_df["_norm_particulars"] == target_row_text]

                        if not target_row.empty:
                            raw_value = target_row.iloc[0][total_col]
                            extracted_ads = safe_num(raw_value)
                            total_ads = abs(extracted_ads)
            except Exception as e:
                logger.warning(f"Could not process Ads: {e}")

        elif file_format == "swiggy" and file_ext != ".csv":
            # Swiggy ads row, when present, is in Payout Breakup sheet in Excel
            try:
                payout_df = pd.read_excel(
                    tmp_path, engine="openpyxl", sheet_name="Payout Breakup", header=2
                )
                payout_df.columns = payout_df.columns.str.strip().str.replace("\n", " ", regex=False)
                particular_col = next((c for c in payout_df.columns if "Particular" in c), None)

                if particular_col:
                    payout_df["_norm"] = payout_df[particular_col].astype(str).str.lower().str.strip()
                    ads_row = payout_df[payout_df["_norm"].str.contains(r"other charges.*refunds?", na=False, regex=True)]
                    if not ads_row.empty:
                        total_col_name = next(
                            (col for col in ads_row.columns if re.search(r"total", str(col), re.I)), None
                        )
                        if total_col_name:
                            raw_total = ads_row[total_col_name].iloc[0]
                            total_ads = abs(safe_num(raw_total))
            except Exception as e:
                logger.warning(f"Could not extract Swiggy Ads: {e}")

        # For takeaway, we keep ads at 0.0 (no ads in POS CSV/sheet)
        if pd.isna(total_ads):
            total_ads = 0.0

        # --- Column mappings ---
        df.columns = df.columns.astype(str).str.strip()

        if file_format == "zomato":
            patterns = {
                "res_id": r"Res\. ID",
                "order_id": r"Order ID",
                "order_date": r"Order Date",
                "subtotal": r"Subtotal.*\(items total\)",
                "packaging_charge": r"Packaging charge",
                "payout": r"Order level Payout.*",
                "discount_promo": r"Restaurant discount.*Promo.*",
                "discount_other": r"Restaurant discount.*BOGO.*others",
                "gst_on_order": r"Total GST collected from customers",
                "service_and_payment_fee": r"Service fee & payment mechanism fee",
                "tax_on_service": r"Taxes on service.*",
                "tds_amount": r"TDS 194O amount.*",
            }
        elif file_format == "swiggy":
            patterns = {
                "order_id": r"Order\s*(ID|No\.?|Number)",
                "order_date": r"Order Date",
                "item_total": r"Item Total",
                "packaging_charges": r"Packaging Charges",
                "gst_collected": r"GST Collected",
                "discount_share": r"Restaurant Discount Share",
                "total_swiggy_fees": r"Total Swiggy Fees",
                "tcs": r"^TCS$",
                "tds": r"^TDS$",
                "payout": r"Net Payout for Order.*after taxes.*",
            }
        elif file_format == "takeaway":
            # Finalized regexes per your direction
            patterns = {
                "branch_name": r"Branch Name",
                "order_source": r"Order Source",
                "order_id": r"Invoice Number",
                "order_date": r"Invoice Date",
                "gross_sale": r"Gross Amount",
                "discounts": r"Discounts",
                "gst_on_order": r"(Taxes(\s*\(.*\))?|GST.*)",  # matches "Taxes" or "Taxes(...)" or "GST..."
                "packings": r"Other Charge Amount",            # exact
                "net_sale": r"(Total.*|Net Sale)",            # "Total", "Total (net sale)", or "Net Sale"
                "Other_Charge_Amount": r"Other Charge Amount",        
            }

        found_cols = {
            key: next((c for c in df.columns if re.search(p, c, re.I)), None)
            for key, p in patterns.items()
        }

        # --- Restaurant/Branch ID ---
        restaurant_id, id_found = None, False
        if file_format == "zomato":
            res_id_col = found_cols.get("res_id")
            if res_id_col and not df[res_id_col].dropna().empty:
                restaurant_id, id_found = str(int(df[res_id_col].dropna().iloc[0])), True
        elif file_format == "swiggy" and file_ext != ".csv":
            try:
                summary_df = pd.read_excel(
                    tmp_path, engine="openpyxl", sheet_name="Summary", header=None, nrows=15
                )
                for row in summary_df.itertuples(index=False):
                    for cell in row:
                        if isinstance(cell, str) and "Rest. ID" in cell:
                            match = re.search(r"Rest\. ID\s*-\s*(\d+)", cell)
                            if match:
                                restaurant_id, id_found = match.group(1), True
                                break
                    if id_found:
                        break
            except Exception as e:
                logger.warning(f"Could not find Swiggy restaurant ID: {e}")
        elif file_format == "takeaway":
            bn = found_cols.get("branch_name")
            restaurant_id = str(df[bn].iloc[0]) if bn and not df[bn].dropna().empty else "takeaway_branch"
            id_found = True

        if not id_found:
            restaurant_id = os.path.splitext(os.path.basename(filename_from_event))[0]

        # --- Per-day aggregation ---
        date_col = found_cols["order_date"]
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        df.dropna(subset=[date_col], inplace=True)
        df[date_col] = df[date_col].dt.date

        corporate_df = None
        if file_format == "takeaway" and "Channel" in df.columns:
            df["_channel_norm"] = df["Channel"].astype(str).str.strip()
            corporate_df = df[df["_channel_norm"] == "Corporate Orders"].copy()
            df = df[df["_channel_norm"] == "Takeaway - Swap"].copy()

        num_days = len(df[date_col].unique())
        daily_ad_cost = total_ads / num_days if num_days > 0 else 0.0

        # Numeric conversion (skip non-numeric/string columns)
        for key, col_name in found_cols.items():
            if key not in ["order_date", "res_id", "branch_name", "order_source", "order_id"] and col_name:
                df.loc[:, col_name] = pd.to_numeric(df[col_name], errors="coerce").fillna(0)

        # ---------------- Aggregation Totals ----------------
        total_orders = 0
        total_gross_sale = 0.0
        total_gst = 0.0
        total_discounts = 0.0
        total_packings = 0.0
        total_comm_taxes = 0.0
        total_payout = 0.0
        total_ads_accum = 0.0
        total_nbv = 0.0
        total_net_sale = 0.0
        
        # Collect all new orders for discount breakdown calculation
        all_new_orders = []

        # Define grouping strategy based on format
        if file_format == "takeaway":
            # Group by Branch Name AND Date
            bn_col = found_cols["branch_name"]
            df[bn_col] = df[bn_col].astype(str).str.strip()
            grouped_data = df.groupby([bn_col, date_col])
        else:
            # Group by Date only (Zomato/Swiggy) - scalar key
            grouped_data = df.groupby(date_col)

        for group_key, day_df in grouped_data:
            # Resolve date and restaurant_id
            if file_format == "takeaway":
                current_branch_name, report_date = group_key
                # Sanitize branch name for S3 safety
                safe_branch = re.sub(r"[^a-zA-Z0-9_\-]", "_", str(current_branch_name))
                current_restaurant_id = safe_branch
            else:
                report_date = group_key
                current_restaurant_id = restaurant_id

            if user_folder:
                insights_key = f"users/{user_folder}/daily-insights/{current_restaurant_id}/{report_date.strftime('%Y-%m-%d')}.json"
            else:
                insights_key = f"daily-insights/{current_restaurant_id}/{report_date.strftime('%Y-%m-%d')}.json"
            
            existing_insight = {}
            try:
                s3_object = s3.get_object(Bucket=BUCKET, Key=insights_key)
                existing_insight = json.loads(s3_object["Body"].read().decode("utf-8"))
            except ClientError as e:
                # When object is not found S3 raises a ClientError with NoSuchKey
                err_code = e.response.get("Error", {}).get("Code")
                if err_code == 'NoSuchKey':
                    # No existing insight — this is expected for new keys
                    existing_insight = {}
                else:
                    # Log and continue with empty existing_insight to avoid failing the whole job
                    logger.warning(f"Unexpected error fetching {insights_key} from S3: {e}")
                    existing_insight = {}

            processed_hashes = existing_insight.get("processedFileHashes", [])
            if file_hash in processed_hashes:
                logger.info(f"📝 File already processed for {report_date}, skipping")
                continue

            # Log if different platform data exists (shouldn't happen normally)
            if existing_insight.get("platform") and existing_insight.get("platform") != file_format:
                logger.warning(f"Different platform data found in {current_restaurant_id} folder: existing={existing_insight.get('platform')}, new={file_format}")

            # Get existing processed order IDs to prevent duplicates
            processed_order_ids = set(existing_insight.get("processedOrderIds", []))
            
            # Get order ID column
            order_id_col = found_cols.get("order_id")
            if not order_id_col:
                logger.warning(f"No order ID column found for {file_format}, falling back to file hash only")
                # If no order ID column, treat each row as unique by using row index
                day_df["_temp_order_id"] = [f"{file_hash}_{i}" for i in range(len(day_df))]
                order_id_col = "_temp_order_id"
            
            # Filter out already processed orders
            day_df["_order_id_str"] = day_df[order_id_col].astype(str).str.strip()
            new_orders_df = day_df[~day_df["_order_id_str"].isin(processed_order_ids)]
            
            if len(new_orders_df) == 0:
                logger.info(f"📝 All {len(day_df)} orders for {report_date} already processed, skipping")
                continue
            
            skipped_count = len(day_df) - len(new_orders_df)
            if skipped_count > 0:
                logger.info(f"📝 Skipping {skipped_count} duplicate orders, processing {len(new_orders_df)} new orders for {report_date}")
            
            # Use only new orders for calculations
            day_df = new_orders_df
            
            # Collect new orders for discount breakdown (will calculate after loop)
            all_new_orders.append(day_df)

            # Calculate new values
            gross_sale = gst = discounts = packings = comm_taxes = payout = net_sale = nbv = 0.0
            
            # Calculate discount breakdown for THIS specific date's new orders only
            date_discount_breakdown = {}
            
            if file_format == "zomato":
                gross_sale = day_df[found_cols["subtotal"]].sum() + day_df[found_cols["packaging_charge"]].sum()
                gst = day_df[found_cols["gst_on_order"]].sum()
                discounts = abs(
                    day_df[found_cols["discount_promo"]].sum() + day_df[found_cols["discount_other"]].sum()
                )
                packings = day_df[found_cols["packaging_charge"]].sum()
                comm_taxes = (
                    day_df[found_cols["service_and_payment_fee"]].sum()
                    + day_df[found_cols["tax_on_service"]].sum()
                    + day_df[found_cols["tds_amount"]].sum()
                )
                payout = day_df[found_cols["payout"]].sum()
                net_sale = payout - daily_ad_cost  # per-day net for z/s
                
                # --- Per-day Discount Breakdown for Zomato (from NEW orders only) ---
                if file_ext != ".csv" and len(day_df) > 0:
                    try:
                        promo_col = found_cols.get("discount_promo")
                        other_discount_col = found_cols.get("discount_other")
                        offer_col = next((c for c in day_df.columns if "discount construct" in c.lower()), None)
                        
                        if offer_col and promo_col and other_discount_col:
                            disc_df = day_df.copy()
                            disc_df[offer_col] = disc_df[offer_col].fillna("Undefined").astype(str).str.strip()
                            
                            # Other Discounts
                            total_other_discounts = disc_df[other_discount_col].sum()
                            if total_other_discounts > 0:
                                orders_with_other_discount = len(disc_df[disc_df[other_discount_col] > 0])
                                date_discount_breakdown["Other Discounts (BOGO, Freebies, etc.)"] = {
                                    "orders": orders_with_other_discount,
                                    "totalDiscount": round(float(total_other_discounts), 2)
                                }
                            
                            # Promo discounts
                            disc_df["_clean_offer"] = disc_df[offer_col].str.replace(r"\s*\(.*?\)", "", regex=True).str.strip()
                            grouped = disc_df.groupby("_clean_offer")
                            
                            for offer, group in grouped:
                                if offer == "Undefined":
                                    continue
                                
                                total_discount = group[promo_col].sum()
                                order_count = len(group)
                                
                                if total_discount > 0:
                                    x = total_discount / order_count if order_count > 0 else 0.0
                                    match = re.search(r"₹\s*(\d+)", offer)
                                    extracted_val = float(match.group(1)) if match else None
                                    ratio = None
                                    if extracted_val and extracted_val > 0:
                                        ratio = round((x / extracted_val) * 100, 2)
                                    
                                    date_discount_breakdown[offer] = {
                                        "orders": order_count,
                                        "totalDiscount": round(float(total_discount), 2),
                                        "avgDiscountPerOrder": round(x, 2),
                                        "offerValue": extracted_val,
                                        "valueRealizationPercentage": ratio
                                    }
                            
                            # TOTAL
                            if date_discount_breakdown:
                                all_orders = sum(v["orders"] for v in date_discount_breakdown.values())
                                all_discount = sum(v["totalDiscount"] for v in date_discount_breakdown.values())
                                date_discount_breakdown["TOTAL"] = {
                                    "orders": int(all_orders),
                                    "totalDiscount": round(all_discount, 2),
                                }
                    except Exception as e:
                        logger.warning(f"Could not calculate Zomato discount breakdown for {report_date}: {e}")

            elif file_format == "swiggy":
                gross_sale = day_df[found_cols["item_total"]].sum() + day_df[found_cols["packaging_charges"]].sum()
                gst = day_df[found_cols["gst_collected"]].sum()
                discounts = abs(day_df[found_cols["discount_share"]].sum())
                packings = day_df[found_cols["packaging_charges"]].sum()
                comm_taxes = (
                    day_df[found_cols["total_swiggy_fees"]].sum()
                    + day_df[found_cols["tcs"]].sum()
                    + day_df[found_cols["tds"]].sum()
                )
                payout = day_df[found_cols["payout"]].sum()
                net_sale = payout - daily_ad_cost  # per-day net for z/s
                
                # --- Discount Breakdown for Swiggy (from ENTIRE FILE, not per-day) ---
                if file_ext != ".csv" and len(day_df) > 0:
                    try:
                        disc_summary_df = pd.read_excel(
                            tmp_path, engine="openpyxl", sheet_name="Discount Summary", skiprows=1
                        )
                        disc_summary_df.columns = disc_summary_df.columns.str.strip().str.replace("\n", " ", regex=False)
                        
                        share_col = next((c for c in disc_summary_df.columns if "Restaurant Share (%)" in c), None)
                        orders_col = next((c for c in disc_summary_df.columns if "Total Orders" in c), None)
                        discount_col = next((c for c in disc_summary_df.columns if "Total Discount Given" in c), None)
                        
                        if share_col and orders_col and discount_col:
                            disc_summary_df[share_col] = disc_summary_df[share_col].fillna("Undefined").astype(str).str.strip()
                            disc_summary_df.loc[disc_summary_df[share_col] == "", share_col] = "Undefined"
                            
                            grouped = disc_summary_df.groupby(disc_summary_df[share_col])
                            
                            for share, group in grouped:
                                total_orders = group[orders_col].apply(safe_num).sum()
                                total_discount = group[discount_col].apply(safe_num).sum()
                                date_discount_breakdown[share] = {
                                    "orders": int(total_orders),
                                    "discount": round(float(total_discount), 2),
                                }
                            
                            # Order the breakdown: numeric keys first, then Undefined, then TOTAL
                            ordered_breakdown = {}
                            for key in sorted([k for k in date_discount_breakdown if k not in ["Undefined"] and not k.upper().startswith("TOTAL")],
                                              key=lambda x: float(re.sub(r'[^0-9.]', '', x)) if re.sub(r'[^0-9.]', '', x) else 0):
                                ordered_breakdown[key] = date_discount_breakdown[key]
                            
                            if "Undefined" in date_discount_breakdown:
                                ordered_breakdown["Undefined"] = date_discount_breakdown["Undefined"]
                            
                            # TOTAL always last
                            total_orders_sum = sum(v["orders"] for k, v in date_discount_breakdown.items() if k not in ["TOTAL"])
                            total_discount_sum = sum(v["discount"] for k, v in date_discount_breakdown.items() if k not in ["TOTAL"])
                            ordered_breakdown["TOTAL"] = {
                                "orders": int(total_orders_sum),
                                "discount": round(float(total_discount_sum), 2),
                            }
                            
                            date_discount_breakdown = ordered_breakdown
                            logger.info(f"Swiggy discount breakdown calculated from entire file for {report_date}")
                    except Exception as e:
                        logger.warning(f"Could not calculate Swiggy discount breakdown for {report_date}: {e}")

            elif file_format == "takeaway":
                gross_col = found_cols.get("gross_sale")
                gst_col = found_cols.get("gst_on_order")
                disc_col = found_cols.get("discounts")
                pack_col = found_cols.get("packings")
                net_col = found_cols.get("net_sale")
                other_charge_col = found_cols.get("Other_Charge_Amount")

                gross_sale = (
                (day_df[gross_col].sum() if gross_col else 0.0)
                +(abs(day_df[other_charge_col].sum()) if other_charge_col else 0.0)
                -(day_df[gst_col].sum() if gst_col else 0.0)
                )
                gst = day_df[gst_col].sum() if gst_col else 0.0
                discounts = abs(day_df[disc_col].sum()) if disc_col else 0.0
                packings = day_df[pack_col].sum() if pack_col else 0.0
                net_sale = day_df[net_col].sum() if net_col else 0.0
                nbv = gst - discounts  # as requested

            # update totals
            total_orders += len(day_df)
            total_gross_sale += gross_sale
            total_gst += gst
            total_discounts += discounts
            total_packings += packings
            total_comm_taxes += comm_taxes
            total_payout += payout
            total_ads_accum += daily_ad_cost
            total_nbv += nbv
            total_net_sale += net_sale

            # Get the new order IDs from this batch
            new_order_ids = day_df["_order_id_str"].tolist()
            updated_order_ids = list(set(list(processed_order_ids) + new_order_ids))
            
            # Always accumulate data from new orders only (duplicates already filtered)
            final_insight = {
                "platform": file_format,
                "restaurantId": current_restaurant_id,
                "reportDate": report_date.isoformat(),
                "processedOrdersCount": existing_insight.get("processedOrdersCount", 0) + len(day_df),
                "grossSale": round(existing_insight.get("grossSale", 0) + float(gross_sale), 2),
                "gstOnOrder": round(existing_insight.get("gstOnOrder", 0) + float(gst), 2),
                "discounts": round(existing_insight.get("discounts", 0) + float(discounts), 2),
                "packings": round(existing_insight.get("packings", 0) + float(packings), 2),
                "commissionAndTaxes": round(
                    existing_insight.get("commissionAndTaxes", 0) + float(comm_taxes), 2
                ),
                "payout": round(existing_insight.get("payout", 0) + float(payout), 2),
                "ads": round(existing_insight.get("ads", 0) + float(daily_ad_cost), 2),
                "netSale": round(existing_insight.get("netSale", 0) + float(net_sale), 2),
                "nbv": round(existing_insight.get("nbv", 0) + float(nbv), 2),
                "processedFileHashes": list(set(processed_hashes + [file_hash])),
                "processedOrderIds": updated_order_ids,
            }

            if date_discount_breakdown:
                final_insight["discountBreakdown"] = date_discount_breakdown

            logger.info(f"🪣 Writing daily insight to S3: {insights_key}")
            s3.put_object(
                Bucket=BUCKET,
                Key=insights_key,
                Body=json.dumps(final_insight, default=str),
                ContentType="application/json",
            )
        
        if corporate_df is not None and not corporate_df.empty:
            bn_col = found_cols["branch_name"]
            corporate_df[bn_col] = corporate_df[bn_col].astype(str).str.strip()
            corporate_grouped = corporate_df.groupby([bn_col, date_col])
            for group_key, day_df in corporate_grouped:
                current_branch_name, report_date = group_key
                # Sanitize branch name and add _CO suffix for S3 safety
                safe_branch = re.sub(r"[^a-zA-Z0-9_\-]", "_", str(current_branch_name)) + "_CO"
                current_restaurant_id = safe_branch

                if user_folder:
                    insights_key = f"users/{user_folder}/daily-insights/{current_restaurant_id}/{report_date.strftime('%Y-%m-%d')}.json"
                else:
                    insights_key = f"daily-insights/{current_restaurant_id}/{report_date.strftime('%Y-%m-%d')}.json"

                existing_insight = {}
                try:
                    s3_object = s3.get_object(Bucket=BUCKET, Key=insights_key)
                    existing_insight = json.loads(s3_object["Body"].read().decode("utf-8"))
                except ClientError as e:
                    if e.response.get("Error", {}).get("Code") == 'NoSuchKey':
                        existing_insight = {}
                    else:
                        logger.warning(f"Unexpected error fetching {insights_key} from S3: {e}")
                        existing_insight = {}

                processed_hashes = existing_insight.get("processedFileHashes", [])
                if file_hash in processed_hashes:
                    logger.info(f"📝 File already processed for Corporate Orders at {current_branch_name} on {report_date}, skipping")
                    continue
                
                processed_order_ids = set(existing_insight.get("processedOrderIds", []))
                order_id_col = found_cols.get("order_id")
                if not order_id_col:
                    day_df["_temp_order_id"] = [f"{file_hash}_corp_{i}" for i in range(len(day_df))]
                    order_id_col = "_temp_order_id"

                day_df["_order_id_str"] = day_df[order_id_col].astype(str).str.strip()
                new_orders_df = day_df[~day_df["_order_id_str"].isin(processed_order_ids)]

                if len(new_orders_df) == 0:
                    continue
                
                day_df = new_orders_df
                all_new_orders.append(day_df)

                # --- Calculation for corporate orders ---
                gross_col = found_cols.get("gross_sale")
                gst_col = found_cols.get("gst_on_order")
                disc_col = found_cols.get("discounts")
                pack_col = found_cols.get("packings")
                net_col = found_cols.get("net_sale")
                other_charge_col = found_cols.get("Other_Charge_Amount")

                gross_sale = ((day_df[gross_col].sum() if gross_col else 0.0) + (abs(day_df[other_charge_col].sum()) if other_charge_col else 0.0) - (day_df[gst_col].sum() if gst_col else 0.0))
                gst = day_df[gst_col].sum() if gst_col else 0.0
                discounts = abs(day_df[disc_col].sum()) if disc_col else 0.0
                packings = day_df[pack_col].sum() if pack_col else 0.0
                net_sale = day_df[net_col].sum() if net_col else 0.0
                nbv = gst - discounts

                # --- Update and Save insight ---
                new_order_ids = day_df["_order_id_str"].tolist()
                updated_order_ids = list(set(list(processed_order_ids) + new_order_ids))
                final_insight = {
                    "platform": "takeaway-corporate",
                    "restaurantId": current_restaurant_id,
                    "reportDate": report_date.isoformat(),
                    "processedOrdersCount": existing_insight.get("processedOrdersCount", 0) + len(day_df),
                    "grossSale": round(existing_insight.get("grossSale", 0) + float(gross_sale), 2),
                    "gstOnOrder": round(existing_insight.get("gstOnOrder", 0) + float(gst), 2),
                    "discounts": round(existing_insight.get("discounts", 0) + float(discounts), 2),
                    "packings": round(existing_insight.get("packings", 0) + float(packings), 2),
                    "commissionAndTaxes": 0, "payout": 0, "ads": 0,
                    "netSale": round(existing_insight.get("netSale", 0) + float(net_sale), 2),
                    "nbv": round(existing_insight.get("nbv", 0) + float(nbv), 2),
                    "processedFileHashes": list(set(processed_hashes + [file_hash])),
                    "processedOrderIds": updated_order_ids,
                }
                logger.info(f"🪣 Writing Corporate Order insight to S3: {insights_key}")
                s3.put_object(Bucket=BUCKET, Key=insights_key, Body=json.dumps(final_insight, default=str), ContentType="application/json")


        # ---------------- Calculate Aggregate Discount Breakdown for Response ----------------
        aggregate_discount_breakdown = {}
        if len(all_new_orders) > 0:
            combined_new_orders = pd.concat(all_new_orders, ignore_index=True)
            
            if file_format == "swiggy" and file_ext != ".csv":
                # For Swiggy, discount breakdown is already calculated from entire file and saved per-day
                # No need to recalculate aggregate since it's the same for all days from the same file
                logger.info("Swiggy aggregate discount breakdown skipped (already calculated from entire file per-day)")
            
            elif file_format == "zomato" and file_ext != ".csv":
                try:
                    promo_col = found_cols.get("discount_promo")
                    other_discount_col = found_cols.get("discount_other")
                    offer_col = next((c for c in combined_new_orders.columns if "discount construct" in c.lower()), None)
                    
                    if offer_col and promo_col and other_discount_col:
                        disc_df = combined_new_orders.copy()
                        disc_df[offer_col] = disc_df[offer_col].fillna("Undefined").astype(str).str.strip()
                        
                        # Other Discounts
                        total_other_discounts = disc_df[other_discount_col].sum()
                        if total_other_discounts > 0:
                            orders_with_other_discount = len(disc_df[disc_df[other_discount_col] > 0])
                            aggregate_discount_breakdown["Other Discounts (BOGO, Freebies, etc.)"] = {
                                "orders": orders_with_other_discount,
                                "totalDiscount": round(float(total_other_discounts), 2)
                            }
                        
                        # Promo discounts
                        disc_df["_clean_offer"] = disc_df[offer_col].str.replace(r"\s*\(.*?\)", "", regex=True).str.strip()
                        grouped = disc_df.groupby("_clean_offer")
                        
                        for offer, group in grouped:
                            if offer == "Undefined":
                                continue
                            
                            total_discount = group[promo_col].sum()
                            order_count = len(group)
                            
                            if total_discount > 0:
                                x = total_discount / order_count if order_count > 0 else 0.0
                                match = re.search(r"₹\s*(\d+)", offer)
                                extracted_val = float(match.group(1)) if match else None
                                ratio = None
                                if extracted_val and extracted_val > 0:
                                    ratio = round((x / extracted_val) * 100, 2)
                                
                                aggregate_discount_breakdown[offer] = {
                                    "orders": order_count,
                                    "totalDiscount": round(float(total_discount), 2),
                                    "avgDiscountPerOrder": round(x, 2),
                                    "offerValue": extracted_val,
                                    "valueRealizationPercentage": ratio
                                }
                        
                        # TOTAL
                        if aggregate_discount_breakdown:
                            all_orders = sum(v["orders"] for v in aggregate_discount_breakdown.values())
                            all_discount = sum(v["totalDiscount"] for v in aggregate_discount_breakdown.values())
                            aggregate_discount_breakdown["TOTAL"] = {
                                "orders": int(all_orders),
                                "totalDiscount": round(all_discount, 2),
                            }
                except Exception as e:
                    logger.warning(f"Could not calculate aggregate discount breakdown: {e}")

        # ---------------- DynamoDB Job Tracking ----------------
        if job_id:
            jobs_table = dynamodb.Table(JOBS_TABLE_NAME)
            logger.info(f"🧾 Updating DynamoDB job record for jobId={job_id}")
            response = jobs_table.update_item(
                Key={"jobId": job_id},
                UpdateExpression="SET processedCount = processedCount + :val",
                ExpressionAttributeValues={":val": 1},
                ReturnValues="UPDATED_NEW",
            )

            processed_count = response["Attributes"]["processedCount"]
            job_item = jobs_table.get_item(Key={"jobId": job_id}).get("Item", {})
            total_files = job_item.get("totalFiles", -1)

            if processed_count >= total_files:
                jobs_table.update_item(
                    Key={"jobId": job_id},
                    UpdateExpression="SET #s = :status",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={":status": "COMPLETED"},
                )
                logger.info(f"Job {job_id} completed.")

        # ---------------- Success Response with Summary ----------------
        start_date = min(df[date_col]).isoformat()
        end_date = max(df[date_col]).isoformat()

        success_response = {
            "message": f"{file_format} report for {restaurant_id} from {start_date} to {end_date}.",
            "dateRange": {"startDate": start_date, "endDate": end_date},
            "summary": {
                "totalOrders": total_orders,
                "grossSale": round(total_gross_sale, 2),
                "gstOnOrder": round(total_gst, 2),
                "discounts": round(total_discounts, 2),
                "packings": round(total_packings, 2),
                "commissionAndTaxes": round(total_comm_taxes, 2),
                "payout": round(total_payout, 2),
                "ads": round(total_ads_accum, 2),
                "netSale": round(total_net_sale, 2),  # aggregated per-day net
                "nbv": round(total_nbv, 2),
            },
            "discountBreakdown": aggregate_discount_breakdown,

        }

        logger.info("✅ Lambda completed successfully")
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps(success_response),
        }

    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}", exc_info=True)
        if job_id:
            jobs_table = dynamodb.Table(JOBS_TABLE_NAME)
            jobs_table.update_item(
                Key={"jobId": job_id},
                UpdateExpression="SET #s = :status, errorDetails = :error",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":status": "FAILED", ":error": str(e)},
            )
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"error": "An internal server error occurred."}),
        }