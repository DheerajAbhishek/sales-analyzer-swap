"""
Lambda Function: Daily Food Costing Calculator
Endpoint: POST /api/daily-food-costing/calculate

Purpose:
- Fetches yesterday's closing inventory (becomes today's opening)
- Fetches today's purchases (from costing module)
- Fetches today's sales from RISTA API (specific channels only)
- Calculates Daily COGS and Food Cost %
- Saves today's closing inventory to DynamoDB

Formula:
- Daily COGS = Opening Inventory + Purchases - Closing Inventory
- Food Cost % = (Daily COGS / Net Sales) × 100
"""

import json
import boto3
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import time
import jwt
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

# Environment variables
INVENTORY_TABLE = os.environ.get('INVENTORY_TABLE', 'daily-food-costing-inventory')
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'costing-module-rohith')
RISTA_API_KEY = os.environ.get('VITE_RISTA_API_KEY', '')
RISTA_SECRET_KEY = os.environ.get('VITE_RISTA_SECRET_KEY', '')

IST = timezone(timedelta(hours=5, minutes=30))

# Allowed sales channels for food costing
ALLOWED_CHANNELS = ['Swiggy', 'Zomato', 'Takeaway - Swap', 'Corporate Orders']


def format_email_for_s3(email: str) -> str:
    """Format email for S3 path"""
    if not email:
        return "unknown_user"
    return email.replace("@", "_at_").replace(".", "_dot_")


def sanitize_name(name: str) -> str:
    """Sanitize branch/vendor name for S3 folder"""
    return name.lower().replace(" ", "_").strip()


def decimal_default(obj):
    """JSON serializer for Decimal types"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def get_inventory_table():
    """Get or create DynamoDB table for daily inventory tracking"""
    table = dynamodb.Table(INVENTORY_TABLE)
    try:
        table.table_status
        return table
    except Exception:
        # Create table if doesn't exist
        table = dynamodb.create_table(
            TableName=INVENTORY_TABLE,
            KeySchema=[
                {'AttributeName': 'branch_email', 'KeyType': 'HASH'},  # Partition key: branch_userEmail
                {'AttributeName': 'date', 'KeyType': 'RANGE'}  # Sort key: YYYY-MM-DD
            ],
            AttributeDefinitions=[
                {'AttributeName': 'branch_email', 'AttributeType': 'S'},
                {'AttributeName': 'date', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        table.wait_until_exists()
        return table


def fetch_yesterday_closing_inventory(table, branch_email, date_str):
    """
    Fetch yesterday's closing inventory value from DynamoDB.
    This becomes today's opening inventory.
    """
    try:
        # Calculate yesterday's date
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        yesterday = date_obj - timedelta(days=1)
        yesterday_str = yesterday.strftime('%Y-%m-%d')
        
        response = table.get_item(
            Key={
                'branch_email': branch_email,
                'date': yesterday_str
            }
        )
        
        if 'Item' in response:
            closing_value = float(response['Item'].get('closingInventoryValue', 0))
            print(f"✅ Found yesterday's closing inventory: ₹{closing_value}")
            return closing_value
        else:
            print(f"⚠️ No closing inventory found for {yesterday_str}")
            return 0.0
            
    except Exception as e:
        print(f"❌ Error fetching yesterday's inventory: {str(e)}")
        return 0.0


def fetch_purchases_for_date(user_email, branch, date_str):
    """
    Fetch total purchase value for a specific date from S3 (costing module).
    Sums all invoice values for the given branch and date.
    """
    try:
        safe_email = format_email_for_s3(user_email)
        safe_branch = sanitize_name(branch)
        
        # S3 path: users/{email}/{branch}/{vendor}/processed_invoices/invoice_{date}_{timestamp}.json
        prefix = f"users/{safe_email}/{safe_branch}/"
        
        print(f"🔍 Searching purchases in: {prefix}")
        
        total_purchases = 0.0
        invoice_count = 0
        
        # List all objects under the branch prefix
        paginator = s3.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=BUCKET_NAME, Prefix=prefix)
        
        for page in pages:
            for obj in page.get('Contents', []):
                key = obj['Key']
                
                # Only process invoice files matching the date
                if '/processed_invoices/' not in key or not key.endswith('.json'):
                    continue
                if 'delivery_' in key:  # Skip delivery records
                    continue
                if f"invoice_{date_str}" not in key:
                    continue
                
                try:
                    # Fetch and parse invoice
                    s3_object = s3.get_object(Bucket=BUCKET_NAME, Key=key)
                    invoice_data = json.loads(s3_object['Body'].read().decode('utf-8'))
                    
                    # Get total from invoice metadata
                    grand_total = invoice_data.get('metadata', {}).get('grand_total', 0)
                    if isinstance(grand_total, (int, float, Decimal)):
                        total_purchases += float(grand_total)
                        invoice_count += 1
                        print(f"  📄 Invoice: {key.split('/')[-1]} = ₹{grand_total}")
                    
                except Exception as e:
                    print(f"  ⚠️ Error processing invoice {key}: {str(e)}")
                    continue
        
        print(f"✅ Total purchases from {invoice_count} invoices: ₹{total_purchases}")
        return total_purchases
        
    except Exception as e:
        print(f"❌ Error fetching purchases: {str(e)}")
        return 0.0


def fetch_sales_page(day, branch_id, api_key, secret_key, last_key=None):
    """Fetch a single page of sales data from RISTA API"""
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


def fetch_sales_for_date(branch_id, date_str, api_key, secret_key):
    """
    Fetch total sales for specific date from RISTA API.
    Only includes allowed channels: SWIGGY, ZOMATO, TAKEAWAY, CORPORATE_ORDERS
    Returns net sales (excluding GST, commissions, etc.)
    """
    try:
        all_orders = []
        last_key = None
        has_more = True
        
        print(f"🔍 Fetching sales for {branch_id} on {date_str}")
        
        # Fetch all pages
        while has_more:
            try:
                response_data = fetch_sales_page(date_str, branch_id, api_key, secret_key, last_key)
                if response_data and isinstance(response_data.get('data'), list):
                    all_orders.extend(response_data['data'])
                
                if response_data and response_data.get('lastKey'):
                    last_key = response_data['lastKey']
                else:
                    has_more = False
            except Exception as e:
                print(f"⚠️ Error fetching page: {str(e)}")
                has_more = False
        
        print(f"  📊 Total orders fetched: {len(all_orders)}")
        
        # Calculate totals for allowed channels only
        total_gross_sale = 0.0
        total_gst = 0.0
        orders_count = 0
        
        for order in all_orders:
            channel = order.get('channel', '')
            status = order.get('status', '')
            
            # Skip voided orders
            if status == 'Voided':
                continue
            
            # Only include allowed channels
            if channel not in ALLOWED_CHANNELS:
                continue
            
            orders_count += 1
            
            # Get order values
            bill_amount = float(order.get('billAmount', 0))
            taxes = order.get('taxes', {})
            gst_on_order = float(taxes.get('gstOnOrder', 0))
            
            total_gross_sale += bill_amount
            total_gst += gst_on_order
        
        # Net sales = Gross sale (which is already without GST in RISTA)
        net_sales = total_gross_sale
        
        print(f"✅ Sales Summary:")
        print(f"  Orders: {orders_count}")
        print(f"  Gross Sale: ₹{total_gross_sale:.2f}")
        print(f"  GST: ₹{total_gst:.2f}")
        print(f"  Net Sales: ₹{net_sales:.2f}")
        
        return {
            'orders_count': orders_count,
            'gross_sale': round(total_gross_sale, 2),
            'gst': round(total_gst, 2),
            'net_sales': round(net_sales, 2)
        }
        
    except Exception as e:
        print(f"❌ Error fetching sales: {str(e)}")
        return {
            'orders_count': 0,
            'gross_sale': 0.0,
            'gst': 0.0,
            'net_sales': 0.0
        }


def save_closing_inventory(table, branch_email, date_str, closing_value, user_email, metadata):
    """Save closing inventory value to DynamoDB"""
    try:
        item = {
            'branch_email': branch_email,
            'date': date_str,
            'closingInventoryValue': Decimal(str(closing_value)),
            'user_email': user_email,
            'timestamp': datetime.now(IST).isoformat(),
            'metadata': metadata  # Store calculation details
        }
        
        table.put_item(Item=item)
        print(f"✅ Saved closing inventory: ₹{closing_value} for {date_str}")
        return True
        
    except Exception as e:
        print(f"❌ Error saving inventory: {str(e)}")
        return False


def lambda_handler(event, context):
    """
    Main Lambda handler for Daily Food Costing calculation
    
    POST /api/daily-food-costing/calculate
    Body: {
        "userEmail": "user@example.com",
        "branch": "Main Kitchen",
        "branchId": "MK",  # RISTA branch ID
        "date": "2025-12-28",
        "closingInventory": 50000.00
    }
    """
    try:
        # CORS headers
        cors_headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'POST,OPTIONS,GET'
        }
        
        # Handle OPTIONS preflight
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({'message': 'OK'})
            }
        
        # Parse request body
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body)
        
        user_email = body.get('userEmail', '').strip()
        branch = body.get('branch', '').strip()
        branch_id = body.get('branchId', '').strip()
        date_str = body.get('date', '').strip()
        closing_inventory = float(body.get('closingInventory', 0))
        
        print(f"📥 Daily Food Costing Request:")
        print(f"  User: {user_email}")
        print(f"  Branch: {branch} ({branch_id})")
        print(f"  Date: {date_str}")
        print(f"  Closing Inventory: ₹{closing_inventory}")
        
        # Validate inputs
        if not all([user_email, branch, branch_id, date_str]):
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({
                    'error': 'Missing required fields',
                    'required': ['userEmail', 'branch', 'branchId', 'date', 'closingInventory']
                })
            }
        
        # Validate date format
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Invalid date format. Use YYYY-MM-DD'})
            }
        
        # Get DynamoDB table
        table = get_inventory_table()
        
        # Create branch_email composite key
        branch_email = f"{sanitize_name(branch)}_{format_email_for_s3(user_email)}"
        
        # Step 1: Fetch opening inventory (yesterday's closing)
        opening_inventory = fetch_yesterday_closing_inventory(table, branch_email, date_str)
        
        # Step 2: Fetch today's purchases
        purchases = fetch_purchases_for_date(user_email, branch, date_str)
        
        # Step 3: Fetch today's sales from RISTA
        sales_data = fetch_sales_for_date(branch_id, date_str, RISTA_API_KEY, RISTA_SECRET_KEY)
        net_sales = sales_data['net_sales']
        
        # Step 4: Calculate Daily COGS
        daily_cogs = opening_inventory + purchases - closing_inventory
        
        # Step 5: Calculate Food Cost %
        food_cost_percentage = (daily_cogs / net_sales * 100) if net_sales > 0 else 0
        
        # Step 6: Save closing inventory with metadata
        metadata = {
            'opening_inventory': round(opening_inventory, 2),
            'purchases': round(purchases, 2),
            'closing_inventory': round(closing_inventory, 2),
            'daily_cogs': round(daily_cogs, 2),
            'net_sales': round(net_sales, 2),
            'food_cost_percentage': round(food_cost_percentage, 2),
            'orders_count': sales_data['orders_count']
        }
        
        save_closing_inventory(table, branch_email, date_str, closing_inventory, user_email, metadata)
        
        # Return results
        result = {
            'success': True,
            'date': date_str,
            'branch': branch,
            'calculations': {
                'openingInventory': round(opening_inventory, 2),
                'purchases': round(purchases, 2),
                'closingInventory': round(closing_inventory, 2),
                'dailyCogs': round(daily_cogs, 2),
                'netSales': round(net_sales, 2),
                'foodCostPercentage': round(food_cost_percentage, 2)
            },
            'salesDetails': {
                'ordersCount': sales_data['orders_count'],
                'grossSale': sales_data['gross_sale'],
                'gst': sales_data['gst']
            },
            'status': {
                'isWithinTarget': food_cost_percentage <= 25,
                'message': 'Good' if food_cost_percentage <= 25 else 'Above Target'
            }
        }
        
        print(f"\n🎯 Calculation Complete:")
        print(f"  Opening: ₹{opening_inventory}")
        print(f"  Purchases: ₹{purchases}")
        print(f"  Closing: ₹{closing_inventory}")
        print(f"  COGS: ₹{daily_cogs}")
        print(f"  Sales: ₹{net_sales}")
        print(f"  Food Cost %: {food_cost_percentage:.2f}%")
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps(result, default=decimal_default)
        }
        
    except Exception as e:
        print(f"❌ Lambda Error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({
                'error': 'Internal server error',
                'details': str(e)
            })
        }
