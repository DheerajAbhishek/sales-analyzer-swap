import pandas as pd
import json

def excel_to_json(file_path):
    # 1. Load only columns C and D (Item Name and Price)
    # usecols="C:D" skips Column B entirely
    df = pd.read_excel(file_path, sheet_name='Price List', usecols="C:D")

    # 2. Rename columns for the JSON keys
    df.columns = ['Item Name', 'Price']

    # 3. Clean up the data
    # Drop rows where the Item Name or Price is missing (NaN)
    df = df.dropna(subset=['Item Name', 'Price'])

    # Ensure Item Name is a clean string and Price is a number
    df['Item Name'] = df['Item Name'].astype(str).str.strip()
    df['Price'] = pd.to_numeric(df['Price'], errors='coerce')

    # Drop any rows where the price wasn't a valid number
    df = df.dropna(subset=['Price'])

    # 4. Convert to JSON format
    json_data = df.to_dict(orient='records')

    # 5. Save the output
    with open('output.json', 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=4)
    
    print(f"Successfully created JSON with {len(json_data)} items.")

excel_to_json("C:\\Users\\Dheeraj\\Downloads\\Food Costing Revision-2025(We Work New Menu).xlsx")