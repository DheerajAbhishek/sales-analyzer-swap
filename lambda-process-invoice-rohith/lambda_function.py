# --- PART 1/4 ---
import json
import boto3
import os
from datetime import datetime, timedelta, timezone
import uuid
import re
from collections import defaultdict
import base64
import io
import pandas as pd
textract = boto3.client("textract")


# --- AWS + Config ---
s3 = boto3.client("s3")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "costing-module")
IST = timezone(timedelta(hours=5, minutes=30))
PATTERN_KEY = "master-data/category_patterns.json"



def parse_excel_bytes_to_items(xlsx_bytes):
    """
    Reads Excel using pandas.
    Supports flexible headers.
    """
    import pandas as pd
    import io

    df = pd.read_excel(io.BytesIO(xlsx_bytes))

    # Normalize column names (lowercase + strip)
    df.columns = [str(c).strip().lower() for c in df.columns]

    def pick(colnames):
        for c in colnames:
            if c.lower() in df.columns:
                return df[c.lower()]
        return None

    prod_no = pick(["product no.", "product no", "product_no", "id"])
    desc    = pick(["description", "desc", "item", "name"])
    qty     = pick(["qty", "quantity", "quantity ordered", "quantity delivered"])
    price   = pick(["price/unit", "price per unit", "price", "unit price"])
    gst     = pick(["gst", "gst %", "gst amt %", "gst amt"])
    total   = pick(["total price(in rs.)", "total", "total price", "amount"])

    items = []
    for i in range(len(df)):
        item = {
            "Product No.": str(prod_no.iloc[i]).strip() if prod_no is not None else "",
            "Description": str(desc.iloc[i]).strip() if desc is not None else "",
            "Qty": str(qty.iloc[i]).strip() if qty is not None else "",
            "Price/Unit": float(price.iloc[i]) if price is not None else 0.0,
            "Gst Amt %": str(gst.iloc[i]).strip() if gst is not None else "0%",
            "Total Price(in Rs.)": float(total.iloc[i]) if total is not None else 0.0
        }

        # Skip empty rows
        if item["Description"] or item["Product No."]:
            items.append(item)

    return items

def ocr_extract_text_from_bytes(file_bytes):
    """
    Extract text from PDF/Image using Textract.
    Works for:
    - PNG/JPG
    - PDF (first 300 pages)
    """

    try:
        response = textract.detect_document_text(
            Document={"Bytes": file_bytes}
        )
    except Exception as e:
        print("❌ Textract OCR error:", e)
        return ""

    lines = []
    for block in response.get("Blocks", []):
        if block["BlockType"] == "LINE":
            lines.append(block["Text"])

    return "\n".join(lines)


def parse_ocr_to_items(text):
    """
    Very flexible OCR parser that extracts table rows.
    Matches patterns like:
    <product>  <qty>  <price>  <gst>  <total>
    """

    lines = text.split("\n")
    items = []

    for line in lines:
        # clean line
        l = line.strip()

        # skip empty lines
        if len(l) < 5:
            continue

        parts = l.split()
        if len(parts) < 3:
            continue

        # simple rule: last number = total, second last = gst or qty, etc.
        # invoice OCR text is unstructured; this heuristic works surprisingly well
        numbers = [p for p in parts if re.match(r"^\d+(\.\d+)?$", p)]

        if len(numbers) < 2:
            continue

        total = numbers[-1]
        maybe_price = numbers[-2]

        desc = " ".join([p for p in parts if p not in numbers])

        items.append({
            "Product No.": "",
            "Description": desc,
            "Qty": "1",
            "Price/Unit": maybe_price,
            "Gst Amt %": "0%",
            "Total Price(in Rs.)": total
        })

    return items


# --- Helper: Convert email to safe S3 format ---
def format_email_for_s3(email: str) -> str:
    if not email:
        return "unknown_user"
    return email.replace("@", "_at_").replace(".", "_dot_")


# --- Helper: Find invoice path dynamically ---
def find_invoice_s3_path(invoice_id):
    """Search across all users and branches to locate an invoice by ID."""
    prefix = "users/"
    resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix)
    while True:
        for obj in resp.get("Contents", []):
            key = obj["Key"]
            if f"invoice_{invoice_id}.json" in key and "/processed_invoices/" in key:
                print(f"✅ Found matching invoice: {key}")
                return key
        if resp.get("IsTruncated"):
            resp = s3.list_objects_v2(
                Bucket=BUCKET_NAME,
                Prefix=prefix,
                ContinuationToken=resp["NextContinuationToken"]
            )
        else:
            break
    print(f"⚠️ Invoice {invoice_id} not found in any folder.")
    return None


# --- PART 2/4 ---
# --- Load category patterns from S3 ---
def load_patterns():
    obj = s3.get_object(Bucket=BUCKET_NAME, Key=PATTERN_KEY)
    data = json.loads(obj["Body"].read().decode("utf-8"))
    if isinstance(data, dict) and "category_patterns" in data:
        return data["category_patterns"]
    return data


# --- Categorize items using regex rules ---
def categorize_item(description, patterns):
    desc = description.lower()
    matches = []

    priority_map = {
        "Dry Store": 100,
        "Dairy": 90,
        "Poultry": 80,
        "Vegetables": 70,
        "Fruits": 70,
        "Packaging": 50,
        "Housekeeping": 40,
        "Misc": 10,
        "Unknown": 0
    }

    SMART_RULES = [
        (r"(?i)\bbutter\b|\bamul butter\b", ("Dairy", "Butter")),
        (r"(?i)\bcheese\b", ("Dairy", "Cheese")),
        (r"(?i)\bmilk\b|\bnandini\b|\bamul\b", ("Dairy", "Milk")),
        (r"(?i)\bcurd\b|\bdahi\b|\byogurt\b", ("Dairy", "Curd_Yogurt")),
        (r"(?i)\bghee\b", ("Dairy", "Ghee")),
        (r"(?i)\bpaneer\b", ("Dairy", "Paneer")),
        (r"(?i)\bmasala\b|\bpowder\b|\bspice\b", ("Dry Store", "Spices")),
        (r"(?i)\begg\b", ("Poultry", "Eggs")),
        (r"(?i)\bchicken\b", ("Poultry", "Chicken")),
        (r"(?i)\btomato\b", ("Vegetables", "Tomato")),
        (r"(?i)\bonion\b", ("Vegetables", "Onion")),
        (r"(?i)\bpotato\b", ("Vegetables", "Potato")),
        (r"(?i)\bapple\b", ("Fruits", "Apple")),
        (r"(?i)\bbanana\b", ("Fruits", "Banana")),
    ]

    for rule, (cat, subcat) in SMART_RULES:
        if re.search(rule, desc):
            return cat, subcat

    for category, subcats in patterns.items():
        for subcat, regex in subcats.items():
            if re.search(regex, desc):
                matches.append((priority_map.get(category, 0), category, subcat))

    if not matches:
        return None, None

    matches.sort(reverse=True)
    return matches[0][1], matches[0][2]


# --- Log uncategorized items ---
def log_uncategorized_items(user_email, branch_name, new_uncat):
    try:
        safe_email = format_email_for_s3(user_email)
        log_key = f"users/{safe_email}/{branch_name}/uncategorized/uncategorized_items.json"

        existing_data = []
        try:
            obj = s3.get_object(Bucket=BUCKET_NAME, Key=log_key)
            existing_data = json.loads(obj["Body"].read().decode("utf-8"))
        except s3.exceptions.NoSuchKey:
            existing_data = []

        existing_descs = {item["Description"].lower() for item in existing_data}
        for item in new_uncat:
            if item["Description"].lower() not in existing_descs:
                existing_data.append({
                    "Description": item.get("Description", ""),
                    "Product No.": item.get("Product No.", ""),
                    "Date_Logged": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
                })

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=log_key,
            Body=json.dumps(existing_data, indent=2),
            ContentType="application/json"
        )
    except Exception as e:
        print(f"⚠️ Failed to log uncategorized items: {e}")


# --- Process invoice items ---
def process_invoice_items(items):
    patterns = load_patterns()
    categorized = defaultdict(lambda: defaultdict(list))
    uncategorized = []

    for item in items:
        desc = item.get("Description", "")
        # Respect forced category
        if "__force_category__" in item:
            cat, subcat = item["__force_category__"]
        else:
            cat, subcat = categorize_item(desc, patterns)
        if cat:
            categorized[cat][subcat].append(item)
        else:
            uncategorized.append(item)

    return {"categorized": categorized, "uncategorized": uncategorized}


# --- PART 3/4 ---
# --- Main Lambda Handler ---
def lambda_handler(event, context):
    try:
        print("🟡 RAW EVENT:", json.dumps(event, indent=2)[:500])
        raw_delivery_key = None
        body = event.get("body", event)
        if isinstance(body, str):
            body = json.loads(body)
        if isinstance(body, list) and len(body) > 0:
            body = body[0]

        # --- Excel Upload ---
        file_type = body.get("file_type")

        # -------- PDF / OCR ----------
        if file_type in ["pdf", "image"]:
            file_b64 = body.get("file_content")
            if not file_b64:
                return {"statusCode": 400, "body": json.dumps({"error": "Missing file_content"})}

            file_bytes = base64.b64decode(file_b64)
            print("📄 Running Textract OCR...")
            text = ocr_extract_text_from_bytes(file_bytes)

            if not text.strip():
                return {"statusCode": 400, "body": json.dumps({"error": "OCR failed or empty text"})}

            print("📄 OCR extraction successful")

            items = parse_ocr_to_items(text)

            # Continue like Excel flow
            user_email = body.get("user_email", "unknown@x.com")
            branch_name = body.get("branch_name", "unknown_branch")
            vendor_name = body.get("vendor_name", "Unknown Vendor")
            target_date = body.get("target_date")

            # ✅ UPDATED: Use order_number from request, fallback to auto-generated ID
            invoice_id = body.get("order_number") or f"OCR-{uuid.uuid4().hex[:6].upper()}"
            safe_email = format_email_for_s3(user_email)

            processed = process_invoice_items(items)

            processed_key = (
                f"users/{safe_email}/{branch_name}/{vendor_name}/processed_invoices/{target_date}/ocr_{invoice_id}.json"    
            )

            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=processed_key,
                Body=json.dumps({
                    "invoice_id": invoice_id,
                    "vendor_name": vendor_name,
                    "branch_name": branch_name,
                    "target_date": target_date,
                    "categorized": processed["categorized"],
                    "uncategorized": processed["uncategorized"],
                    "raw_text": text,
                    "created_at": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
                }, indent=2),
                ContentType="application/json"
            )

            return {
                "statusCode": 200,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({
                    "message": "OCR invoice processed successfully",
                    "processed_s3_key": processed_key,
                    "invoice_id": invoice_id,
                    "uncategorized_count": len(processed["uncategorized"]),
                })
            }

        # -------- Excel --------
        if file_type == "excel":
            file_b64 = body.get("file_content")
            if not file_b64:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "Missing Excel file_content (base64)"})
                }

            try:
                xlsx_bytes = base64.b64decode(file_b64)
                items = parse_excel_bytes_to_items(xlsx_bytes)
            except Exception as e:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": f"Invalid Excel file: {str(e)}"})
                }

            user_email = body.get("user_email", "unknown_user@unknown.com")
            branch_name = body.get("branch_name", "unknown_branch").replace(" ", "_").lower()
            target_date = body.get("target_date", datetime.now(IST).strftime("%Y-%m-%d"))
            vendor_name = body.get("vendor_name", "Excel Upload")

            safe_email = format_email_for_s3(user_email)
            # ✅ UPDATED: Use order_number from request, fallback to auto-generated ID
            invoice_id = body.get("order_number") or f"EXCEL-{uuid.uuid4().hex[:8].upper()}"

            processed = process_invoice_items(items)

            if processed["uncategorized"]:
                log_uncategorized_items(user_email, branch_name, processed["uncategorized"])

            processed_prefix = f"users/{safe_email}/{branch_name}/{vendor_name}/processed_invoices/{target_date}"
            processed_key = f"{processed_prefix}/excel_{invoice_id}.json"

            output_data = {
                "target_date": target_date,
                "invoice_id": invoice_id,
                "vendor_name": vendor_name,
                "branch_name": branch_name,
                "categorized": processed["categorized"],
                "uncategorized": processed["uncategorized"],
                "created_at": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
            }

            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=processed_key,
                Body=json.dumps(output_data, indent=2),
                ContentType="application/json"
            )

            return {
                "statusCode": 200,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({
                    "message": "Excel processed successfully",
                    "processed_s3_key": processed_key,
                    "invoice_id": invoice_id,
                    "uncategorized_count": len(processed["uncategorized"]),
                    "data": output_data
                })
            }

        event_type = body.get("event_type", "invoice")
        # ✅ UPDATED: Use order_number from request, fallback to invoice_id or auto-generated
        invoice_id = body.get("order_number") or body.get("invoice_id") or f"INV-{uuid.uuid4().hex[:8].upper()}"



# --- PART 4/4 ---
        # -------- DELIVERY CONFIRMATION --------
        if event_type == "delivery_confirmation":

            invoice_key = find_invoice_s3_path(invoice_id)
            if not invoice_key:
                return {
                    "statusCode": 404,
                    "body": json.dumps({"error": f"Invoice {invoice_id} not found in any folder"})
                }

            obj = s3.get_object(Bucket=BUCKET_NAME, Key=invoice_key)
            invoice_data = json.loads(obj["Body"].read())
            vendor_name = invoice_data.get("vendor_name", "Unknown Vendor")
            branch_name = invoice_data.get("branch_name", "unknown_branch")
            target_date = invoice_data.get("target_date", datetime.now(IST).strftime("%Y-%m-%d"))

            # Extract user email from S3 path
            parts = invoice_key.split("/")
            if len(parts) > 1:
                user_email_s3 = parts[1]
                user_email = user_email_s3.replace("_at_", "@").replace("_dot_", ".")
            else:
                user_email = "unknown_user@unknown.com"
            safe_email = format_email_for_s3(user_email)

            raw_delivery_key = f"users/{safe_email}/{branch_name}/{vendor_name}/raw_invoices/{target_date}/delivery_{invoice_id}.json"

            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=raw_delivery_key,
                Body=json.dumps(body, indent=2),
                ContentType="application/json"
            )

            print(f"📦 Raw delivery stored at: {raw_delivery_key}")

            invoice_items = {
                str(i["Product No."]).strip(): i
                for cat in invoice_data.get("categorized", {}).values()
                for sub in cat.values()
                for i in sub
            }

            deliveries = []
            total_diff = 0.0

            for delivered in body.get("items", []):
                prod_no = str(delivered.get("Product No.") or "").strip()
                qty_ordered = float(delivered.get("Quantity Ordered", 0))
                qty_delivered = float(delivered.get("Quantity Delivered", 0))

                if qty_ordered > qty_delivered and prod_no in invoice_items:
                    item = invoice_items[prod_no]
                    price_per_unit = float(item.get("Price/Unit", 0))
                    diff = (qty_ordered - qty_delivered) * price_per_unit

                    deliveries.append({
                        "Product No.": prod_no,
                        "Description": item.get("Description"),
                        "Qty Ordered": qty_ordered,
                        "Qty Delivered": qty_delivered,
                        "Value Difference": round(diff, 2)
                    })

            total_diff = round(sum(x["Value Difference"] for x in deliveries), 2)

            delivery_key = invoice_key.replace(f"invoice_{invoice_id}.json", f"delivery_{invoice_id}.json")

            delivery_summary = {
                "invoice_id": invoice_id,
                "branch_name": branch_name,
                "vendor_name": vendor_name,
                "target_date": target_date,
                "deliveries": deliveries,
                "total_difference": total_diff,
                "created_at": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
            }

            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=delivery_key,
                Body=json.dumps(delivery_summary, indent=2),
                ContentType="application/json"
            )
            print(f"💰 Delivery summary stored at: {delivery_key}")

            return {
                "statusCode": 200,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({
                    "message": "Delivery confirmation processed",
                    "delivery_total": total_diff,
                    "delivery_items": len(deliveries),
                    "delivery_s3_key": delivery_key,
                    "output": delivery_summary
                })
            }

        # -------- STANDARD INVOICE --------
        user_email = body.get("user_email", "unknown_user@unknown.com")
        branch_name = body.get("branch_name", "unknown_branch").replace(" ", "_").lower()
        target_date = body.get("target_date", datetime.now(IST).strftime("%Y-%m-%d"))
        vendor_name = body.get("vendor_name", "Unknown Vendor")
        items = body.get("items", [])
        safe_email = format_email_for_s3(user_email)

        # Delivery charges
        delivery_charge = body.get("delivery_charges")
        if delivery_charge:
            items.append({
                "Product No.": "DELIVERY",
                "Description": delivery_charge.get("Description", "Delivery Charges"),
                "Qty": "1Count",
                "Price/Unit": delivery_charge.get("Price/Unit", 0),
                "Gst Amt %": delivery_charge.get("Gst Amt %", "0%"),
                "Total Price(in Rs.)": delivery_charge.get("Total Price(in Rs.)", 0),
                "__force_category__": ("Misc", "Delivery")
            })

        base_prefix = f"users/{safe_email}/{branch_name}/{vendor_name}"
        raw_prefix = f"{base_prefix}/raw_invoices/{target_date}"
        processed_prefix = f"{base_prefix}/processed_invoices/{target_date}"

        raw_key = f"{raw_prefix}/invoice_{invoice_id}.json"

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=raw_key,
            Body=json.dumps(body, indent=2),
            ContentType="application/json"
        )

        processed = process_invoice_items(items)
        if processed["uncategorized"]:
            log_uncategorized_items(user_email, branch_name, processed["uncategorized"])

        processed_key = f"{processed_prefix}/invoice_{invoice_id}.json"

        output_data = {
            "target_date": target_date,
            "invoice_id": invoice_id,
            "vendor_name": vendor_name,
            "branch_name": branch_name,
            "categorized": processed["categorized"],
            "uncategorized": processed["uncategorized"],
            "created_at": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
        }

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=processed_key,
            Body=json.dumps(output_data, indent=2),
            ContentType="application/json"
        )

        print(f"✅ Processed invoice stored at: {processed_key}")

        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({
                "message": "Invoice processed successfully",
                "raw_s3_key": raw_key,
                "processed_s3_key": processed_key,
                "invoice_id": invoice_id,
                "raw_delivery_key": raw_delivery_key,
                "uncategorized_count": len(processed["uncategorized"]),
                "data": output_data
            })
        }

    except Exception as e:
        print("❌ Error:", str(e))
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)})
        }
