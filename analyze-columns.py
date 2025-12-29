"""
Column Header Analyzer for Sales Data Files
This script reads Excel/CSV files and shows all columns with their matching patterns
"""

import pandas as pd
import re
import sys
from pathlib import Path


def read_file(file_path, skiprows=0, sheet_name=None):
    """Read Excel or CSV file"""
    file_ext = Path(file_path).suffix.lower()
    if file_ext == ".csv":
        return pd.read_csv(file_path, skiprows=skiprows)
    else:
        return pd.read_excel(file_path, engine="openpyxl", skiprows=skiprows, sheet_name=sheet_name)


def detect_format(columns):
    """Detect file format based on columns"""
    cols = [str(c) for c in columns]
    if any(re.search(r"Week No\.", col, re.IGNORECASE) for col in cols):
        return "zomato"
    if any(re.search(r"Item Total", col, re.IGNORECASE) for col in cols):
        return "swiggy"
    if any(re.search(r"Branch Name", col, re.IGNORECASE) for col in cols) and \
       any(re.search(r"Order Source", col, re.IGNORECASE) for col in cols):
        return "takeaway"
    return "unknown"


def get_patterns(file_format):
    """Get regex patterns for each format"""
    if file_format == "zomato":
        return {
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
        return {
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
        return {
            "branch_name": r"Branch Name",
            "order_source": r"Order Source",
            "order_id": r"Invoice Number",
            "order_date": r"Invoice Date",
            "gross_sale": r"Gross Amount",
            "discounts": r"Discounts",
            "gst_on_order": r"(Taxes(\s*\(.*\))?|GST.*)",
            "packings": r"Other Charge Amount",
            "net_sale": r"(Total.*|Net Sale)",
            "Other_Charge_Amount": r"Other Charge Amount",
        }
    return {}


def analyze_file(file_path):
    """Analyze file and show all columns with pattern matches"""
    print(f"\n{'='*80}")
    print(f"ANALYZING FILE: {file_path}")
    print(f"{'='*80}\n")

    # Try different configurations
    configs = [
        {"skiprows": 6, "sheet_name": "Order Level", "format": "zomato"},
        {"skiprows": 2, "sheet_name": "Order Level", "format": "swiggy"},
        {"skiprows": 1, "sheet_name": None, "format": "takeaway"},
    ]

    for config in configs:
        try:
            df = read_file(file_path, skiprows=config["skiprows"], sheet_name=config["sheet_name"])
            detected_format = detect_format(df.columns)
            
            if detected_format != "unknown":
                print(f"✅ DETECTED FORMAT: {detected_format.upper()}")
                if config["sheet_name"]:
                    print(f"   Sheet: {config['sheet_name']}, Skip Rows: {config['skiprows']}")
                else:
                    print(f"   Skip Rows: {config['skiprows']}")
                print(f"\n{'='*80}")
                
                # Get columns
                columns = [str(c).strip() for c in df.columns]
                patterns = get_patterns(detected_format)
                
                print(f"\nTOTAL COLUMNS FOUND: {len(columns)}\n")
                print(f"{'Column Name':<50} | {'Pattern Match':<25} | Status")
                print("-" * 80)
                
                matched_patterns = set()
                for col in columns:
                    matched = None
                    for key, pattern in patterns.items():
                        if re.search(pattern, col, re.I):
                            matched = key
                            matched_patterns.add(key)
                            break
                    
                    status = "✅ MATCHED" if matched else "⚠️  NO MATCH"
                    pattern_name = matched if matched else "-"
                    print(f"{col:<50} | {pattern_name:<25} | {status}")
                
                # Show unmatched patterns
                unmatched = set(patterns.keys()) - matched_patterns
                if unmatched:
                    print(f"\n{'='*80}")
                    print("⚠️  PATTERNS WITHOUT MATCHES:")
                    print(f"{'='*80}")
                    for key in unmatched:
                        print(f"   • {key}: {patterns[key]}")
                
                return detected_format
                
        except Exception as e:
            continue
    
    print("❌ Could not detect file format or read file")
    return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyze-columns.py <file_path>")
        print("\nExample:")
        print("  python analyze-columns.py zomato_sample.xlsx")
        sys.exit(1)
    
    file_path = sys.argv[1]
    if not Path(file_path).exists():
        print(f"❌ File not found: {file_path}")
        sys.exit(1)
    
    analyze_file(file_path)
    print(f"\n{'='*80}\n")
