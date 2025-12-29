import json
import boto3
import os
import uuid
import re
from datetime import datetime, timedelta, timezone
from collections import defaultdict

s3 = boto3.client("s3")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "costing-module")
IST = timezone(timedelta(hours=5, minutes=30))

PATTERN_KEY = "master-data/category_patterns.json"


# ------------------------------
# Utility Functions
# ------------------------------

def format_email_for_s3(email: str) -> str:
    return email.replace("@", "_at_").replace(".", "_dot_")


def load_patterns():
    """Load category_patterns.json from S3."""
    obj = s3.get_object(Bucket=BUCKET_NAME, Key=PATTERN_KEY)
    data = json.loads(obj["Body"].read().decode("utf-8"))
    return data["category_patterns"] if "category_patterns" in data else data


def categorize_item(description, patterns):
    """Same categorization rules as process-invoice Lambda."""
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
        (r"(?i)\bbutter\b", ("Dairy", "Butter")),
        (r"(?i)\bcheese\b", ("Dairy", "Cheese")),
        (r"(?i)\bmilk\b|\bamul\b|\bnandini\b", ("Dairy", "Milk")),
        (r"(?i)\bcurd\b|\bdahi\b|\byogurt\b", ("Dairy", "Curd_Yogurt")),
        (r"(?i)\bghee\b", ("Dairy", "Ghee")),
        (r"(?i)\bpaneer\b", ("Dairy", "Paneer")),
        (r"(?i)\bmasala\b|\bpowder\b|\bspice\b", ("Dry Store", "Spices")),
        (r"(?i)\begg\b", ("Poultry", "Eggs")),
        (r"(?i)\bchicken\b", ("Poultry", "Chicken")),
        (r"(?i)\btomato\b", ("Vegetables", "Tomato")),
        (r"(?i)\bonion\b", ("Vegetables", "Onion")),
        (r"(?i)\bpotato\b", ("Vegetables", "Potato")),
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


def process_items(items):
    patterns = load_patterns()
    categorized = defaultdict(lambda: defaultdict(list))
    uncategorized = []

    for item in items:
        if "__force_category__" in item:
            cat, subcat = item["__force_category__"]
        else:
            cat, subcat = categorize_item(item.get("Description", ""), patterns)

        if cat:
            categorized[cat][subcat].append(item)
        else:
            uncategorized.append(item)

    return categorized, uncategorized


# ------------------------------
# Lambda Handler
# ------------------------------

def lambda_handler(event, context):
    try:
        body = event.get("body", event)
        if isinstance(body, str):
            body = json.loads(body)

        user_email = body["user_email"]
        branch_name = body["branch_name"].replace(" ", "_").lower()
        items = body["items"]

        target_date = body.get("target_date", datetime.now(IST).strftime("%Y-%m-%d"))
        vendor = body.get("vendor_name", "Manual Entry")
        
        # ✅ UPDATED: Use order_number from request, fallback to auto-generated ID
        invoice_id = body.get("order_number") or f"MANUAL-{uuid.uuid4().hex[:8].upper()}"

        safe_email = format_email_for_s3(user_email)

        categorized, uncategorized = process_items(items)

        # ----------------------------------------------------
        # NEW S3 KEY STRUCTURE WITH VENDOR FOLDER
        # ----------------------------------------------------
        s3_key = (
            f"users/{safe_email}/{branch_name}/{vendor}/processed_invoices/"
            f"{target_date}/manual_{invoice_id}.json"
        )

        result = {
            "target_date": target_date,
            "invoice_id": invoice_id,
            "vendor_name": vendor,
            "branch_name": branch_name,
            "categorized": categorized,
            "uncategorized": uncategorized,
            "created_at": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
        }

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=json.dumps(result, indent=2),
            ContentType="application/json"
        )

        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({
                "message": "Manual entry saved",
                "processed_s3_key": s3_key,
                "invoice_id": invoice_id,
                "data": result
            })
        }

    except Exception as e:
        print("❌ Manual entry error:", str(e))
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)})
        }
