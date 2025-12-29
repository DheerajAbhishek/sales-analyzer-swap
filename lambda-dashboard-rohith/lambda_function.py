import json
import boto3
import os
from datetime import datetime

# --- AWS setup ---
s3 = boto3.client("s3")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "costing-module")

# --- Helper: Format email for S3 path ---
def format_email_for_s3(email: str) -> str:
    if not email:
        return "unknown_user"
    return email.replace("@", "_at_").replace(".", "_dot_")

# --- Utilities ---
def parse_numeric(val):
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        val = val.replace("%", "").strip()
        try:
            return float(val)
        except ValueError:
            return 0.0
    return 0.0

def parse_qty(val):
    if not val:
        return 0.0
    num = ''.join(ch for ch in val if ch.isdigit() or ch == '.')
    try:
        return float(num)
    except ValueError:
        return 0.0

# --- Merge categorized data ---
def merge_categorized_data(all_invoices):
    merged = {}
    uncategorized_all = []

    for invoice in all_invoices:
        categorized = invoice.get("categorized", {})
        for category, subcats in categorized.items():
            for subcat, items in subcats.items():
                merged.setdefault(category, {}).setdefault(subcat, {
                    "total_items": 0,
                    "total_qty": 0.0,
                    "total_value": 0.0,
                    "avg_gst_percent": 0.0,
                    "items": []
                })
                sub_summary = merged[category][subcat]
                gst_values = []
                for item in items:
                    sub_summary["items"].append(item)
                    sub_summary["total_items"] += 1
                    sub_summary["total_qty"] += parse_qty(item.get("Qty"))
                    sub_summary["total_value"] += parse_numeric(item.get("Total Price(in Rs.)"))
                    gst_values.append(parse_numeric(item.get("Gst Amt %")))
                if gst_values:
                    sub_summary["avg_gst_percent"] = round(sum(gst_values) / len(gst_values), 2)

        uncategorized_all.extend(invoice.get("uncategorized", []))

    category_totals = {
        cat: {
            "total_value": round(sum(sub["total_value"] for sub in subs.values()), 2),
            "total_qty": round(sum(sub["total_qty"] for sub in subs.values()), 2)
        }
        for cat, subs in merged.items()
    }
    uncategorized_total = sum(parse_numeric(i.get("Total Price(in Rs.)")) for i in uncategorized_all)
    grand_total = sum(v["total_value"] for v in category_totals.values()) + uncategorized_total
    return merged, category_totals, uncategorized_all, round(grand_total, 2)

# --- Lambda Handler ---
def lambda_handler(event, context):
    try:
        params = event.get("queryStringParameters", {}) or {}
        user_email = params.get("user_email", "unknown_user@unknown.com")
        safe_email = format_email_for_s3(user_email)

        start_date = params.get("start")
        end_date = params.get("end")
        target_date = params.get("target_date")
        branch = params.get("branch", "All")
        vendor = params.get("vendor", "All")
        mode = params.get("mode", "dashboard")

        print(f"👤 User: {user_email}")
        print(f"🏢 Branch: {branch}")
        print(f"📅 Date range: {start_date} → {end_date or target_date}")

        # ======================================================
        # 📌 MODE 1: Fetch VENDORS — USE FOLDER NAME ONLY
        # ======================================================
        if mode == "vendors":
            try:
                prefix = f"users/{safe_email}/"

                if branch and branch != "All":
                    prefix = f"users/{safe_email}/{branch}/"

                print("🔍 Vendor scan prefix:", prefix)

                resp = s3.list_objects_v2(
                    Bucket=BUCKET_NAME,
                    Prefix=prefix,
                    Delimiter="/"
                )

                vendors = set()

                # The folders directly under /branch/ are vendor folders
                for p in resp.get("CommonPrefixes", []):
                    folder = p["Prefix"].split("/")
                    if len(folder) >= 4:
                        vendor_folder = folder[3]  # users/email/branch/VENDOR/
                        vendors.add(vendor_folder)

                return {
                    "statusCode": 200,
                    "headers": {"Access-Control-Allow-Origin": "*"},
                    "body": json.dumps({
                        "vendors": sorted(vendors),
                        "debug": {
                            "prefix_used": prefix,
                            "folders_detected": list(vendors)
                        }
                    })
                }

            except Exception as e:
                print("❌ Vendor handler crashed:", str(e))
                return {
                    "statusCode": 500,
                    "body": json.dumps({"error": str(e)})
                }





        # ======================================================
        # 📌 MODE 2: ITEMS
        # ======================================================
        if mode == "items":
            try:
                prefix = f"users/{safe_email}/"
                all_items = set()
                resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix)
                objects = resp.get("Contents", [])
                while resp.get("IsTruncated"):
                    resp = s3.list_objects_v2(
                        Bucket=BUCKET_NAME,
                        Prefix=prefix,
                        ContinuationToken=resp["NextContinuationToken"]
                    )
                    objects += resp.get("Contents", [])

                for obj in objects:
                    key = obj["Key"]
                    if "/processed_invoices/" not in key or not key.endswith(".json"):
                        continue
                    if "delivery_" in key:
                        continue

                    try:
                        raw = s3.get_object(Bucket=BUCKET_NAME, Key=key)
                        data = json.loads(raw["Body"].read())

                        for cat, sub in data.get("categorized", {}).items():
                            for subcat, items in sub.items():
                                for item in items:
                                    d = item.get("Description", "").strip()
                                    if d:
                                        all_items.add(d)

                        for item in data.get("uncategorized", []):
                            d = item.get("Description", "").strip()
                            if d:
                                all_items.add(d)

                    except:
                        pass

                return {
                    "statusCode": 200,
                    "headers": {"Access-Control-Allow-Origin": "*"},
                    "body": json.dumps({"items": sorted(all_items)})
                }

            except Exception as e:
                return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

        # ======================================================
        # 📌 MODE 3: BRANCHES
        # ======================================================
        if mode == "branches":
            try:
                resp = s3.list_objects_v2(
                    Bucket=BUCKET_NAME,
                    Prefix=f"users/{safe_email}/",
                    Delimiter="/"
                )
                branches = [
                    p["Prefix"].split("/")[2]
                    for p in resp.get("CommonPrefixes", [])
                    if p["Prefix"].startswith(f"users/{safe_email}/")
                ]
                return {
                    "statusCode": 200,
                    "headers": {"Access-Control-Allow-Origin": "*"},
                    "body": json.dumps({"branches": sorted(branches, key=str.lower)})
                }
            except Exception as e:
                return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

        # =====================================================================
        # 📌 DEFAULT MODE: FULL DASHBOARD
        # =====================================================================
        if mode != "dashboard":
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": f"Invalid mode '{mode}'"})
            }

        if not (target_date or (start_date and end_date)):
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "Provide either target_date or (start,end)"})
            }

        all_data = []
        delivery_data = []

        # Parse date range once
        start_dt = datetime.strptime(start_date, "%Y-%m-%d") if start_date else None
        end_dt = datetime.strptime(end_date, "%Y-%m-%d") if end_date else None

        # branch detection
        if branch == "All":
            try:
                resp = s3.list_objects_v2(
                    Bucket=BUCKET_NAME,
                    Prefix=f"users/{safe_email}/",
                    Delimiter="/"
                )
                branches_to_fetch = [
                    p["Prefix"].split("/")[2]
                    for p in resp.get("CommonPrefixes", [])
                ]
                branches_to_fetch = sorted(branches_to_fetch, key=str.lower)
            except:
                branches_to_fetch = []
        else:
            branches_to_fetch = [branch]

        # Helper to list all S3 objects with pagination
        def list_all_objects(prefix):
            objects = []
            paginator = s3.get_paginator('list_objects_v2')
            for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=prefix):
                objects.extend(page.get("Contents", []))
            return objects

        # Helper to check if date is in range
        def is_date_in_range(date_str):
            if target_date:
                return date_str == target_date
            if start_dt and end_dt:
                try:
                    file_date = datetime.strptime(date_str, "%Y-%m-%d")
                    return start_dt <= file_date <= end_dt
                except:
                    return False
            return True

        # Fetch invoices for all branches
        for br in branches_to_fetch:
            branch_prefix = f"users/{safe_email}/{br}/"

            # List all objects once (with pagination) and process both regular and delivery files
            all_objects = list_all_objects(branch_prefix)
            
            # Separate keys into regular and delivery, filtering by date early
            regular_keys = []
            delivery_keys = []
            
            for obj in all_objects:
                key = obj["Key"]

                if "/processed_invoices/" not in key or not key.endswith(".json"):
                    continue

                parts = key.split("/")
                if len(parts) < 7:
                    continue

                date_str = parts[5]
                
                # Early date filtering before fetching file content
                if not is_date_in_range(date_str):
                    continue

                if "delivery_" in key:
                    delivery_keys.append((key, br))
                else:
                    regular_keys.append(key)

            # Fetch regular invoice files
            for key in regular_keys:
                try:
                    raw = s3.get_object(Bucket=BUCKET_NAME, Key=key)
                    data = json.loads(raw["Body"].read())
                    inv_vendor = data.get("vendor_name", "Unknown")
                    if vendor != "All" and inv_vendor != vendor:
                        continue
                    all_data.append(data)
                except Exception as e:
                    print(f"⚠️ Error fetching {key}: {str(e)}")

            # Fetch delivery files
            for dkey, br_name in delivery_keys:
                try:
                    raw = s3.get_object(Bucket=BUCKET_NAME, Key=dkey)
                    data = json.loads(raw["Body"].read())
                    data["branch"] = br_name
                    data["s3_key"] = dkey
                    delivery_data.append(data)
                except Exception as e:
                    print(f"⚠️ Error fetching delivery {dkey}: {str(e)}")

        merged, category_totals, uncategorized_all, grand_total = merge_categorized_data(all_data)
        delivery_total = round(sum(d.get("total_difference", 0.0) for d in delivery_data), 2)
        net_total = round(grand_total - delivery_total, 2)

        result = {
            "user_email": user_email,
            "branch": branch,
            "count": len(all_data),
            "categorized": merged,
            "category_totals": category_totals,
            "uncategorized": uncategorized_all,
            "grand_total": grand_total,
            "delivery_total": delivery_total,
            "net_total": net_total,
            "delivery_details": delivery_data
        }

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            "body": json.dumps(result, indent=2)
        }

    except Exception as e:
        print("❌ Error in dashboard fetch lambda:", str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)})
        }
