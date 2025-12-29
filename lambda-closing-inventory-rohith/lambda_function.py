import json
import boto3
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
TABLE_NAME = os.environ.get('TABLE_NAME', 'closing-inventory-rohith')
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'costing-module-rohith')
IST = timezone(timedelta(hours=5, minutes=30))


def format_email_for_s3(email: str) -> str:
    """Format email for S3 path (same as dashboard lambda)"""
    if not email:
        return "unknown_user"
    return email.replace("@", "_at_").replace(".", "_dot_")


def sanitize_name(name: str) -> str:
    """Sanitize branch/vendor name for S3 folder (lowercase, spaces to underscores)"""
    return name.lower().replace(" ", "_").strip()


def decimal_default(obj):
    """JSON serializer for Decimal types from DynamoDB"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def get_table():
    """Get DynamoDB table, create if not exists"""
    table = dynamodb.Table(TABLE_NAME)
    try:
        table.table_status
        return table
    except Exception:
        # Table doesn't exist, create it
        table = dynamodb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {'AttributeName': 'branch_vendor', 'KeyType': 'HASH'},  # Partition key
                {'AttributeName': 'date', 'KeyType': 'RANGE'}  # Sort key
            ],
            AttributeDefinitions=[
                {'AttributeName': 'branch_vendor', 'AttributeType': 'S'},
                {'AttributeName': 'date', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        table.wait_until_exists()
        return table


def lambda_handler(event, context):
    """
    Handle closing inventory CRUD operations
    
    GET ?branch=X&vendor=Y&date=Z - Get closing inventory for specific date
    GET ?branch=X&vendor=Y - Get all closing inventory for branch-vendor
    POST - Save/Update closing inventory
    DELETE ?branch=X&vendor=Y&date=Z - Delete closing inventory entry
    """
    try:
        # Handle different HTTP methods - support both API Gateway and Function URL formats
        http_method = (
            event.get('httpMethod') or 
            event.get('requestContext', {}).get('http', {}).get('method') or 
            'GET'
        )
        
        # Parse query parameters
        query_params = event.get('queryStringParameters') or {}
        
        print(f"📥 Closing Inventory Request: {http_method} - params={query_params}")
        
        table = get_table()
        
        # GET - Fetch closing inventory
        if http_method == 'GET':
            branch = query_params.get('branch', '').strip()
            vendor = query_params.get('vendor', '').strip()
            date = query_params.get('date', '').strip()
            
            if not branch or not vendor:
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'branch and vendor are required'})
                }
            
            branch_vendor = f"{branch.lower().replace(' ', '_')}_{vendor.lower().replace(' ', '_')}"
            
            if date:
                # Get specific date
                response = table.get_item(
                    Key={'branch_vendor': branch_vendor, 'date': date}
                )
                
                if 'Item' not in response:
                    return {
                        'statusCode': 404,
                        'headers': {'Access-Control-Allow-Origin': '*'},
                        'body': json.dumps({'message': 'No closing inventory found for this date'})
                    }
                
                return {
                    'statusCode': 200,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({
                        'data': response['Item']
                    }, default=decimal_default)
                }
            else:
                # Get all entries for branch-vendor
                response = table.query(
                    KeyConditionExpression='branch_vendor = :bv',
                    ExpressionAttributeValues={':bv': branch_vendor},
                    ScanIndexForward=False  # Most recent first
                )
                
                return {
                    'statusCode': 200,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({
                        'data': response.get('Items', []),
                        'count': len(response.get('Items', []))
                    }, default=decimal_default)
                }
        
        # POST - Save/Update closing inventory
        if http_method == 'POST':
            body = event.get('body', '{}')
            if isinstance(body, str):
                body = json.loads(body)
            
            branch = body.get('branch', '').strip()
            vendor = body.get('vendor', '').strip()
            date = body.get('date', '').strip()
            items = body.get('items', [])
            user_email = body.get('user_email', 'unknown')
            
            if not branch or not vendor or not date:
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'branch, vendor, and date are required'})
                }
            
            if not items or not isinstance(items, list):
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'items array is required'})
                }
            
            branch_vendor = f"{branch.lower().replace(' ', '_')}_{vendor.lower().replace(' ', '_')}"
            
            # Calculate total value
            total_value = sum(float(item.get('value', 0)) for item in items)
            
            # Convert items to use Decimal for DynamoDB compatibility
            items_for_dynamo = []
            for item in items:
                items_for_dynamo.append({
                    'item': item.get('item', ''),
                    'uom': item.get('uom', ''),
                    'quantity': Decimal(str(item.get('quantity', 0))),
                    'rate': Decimal(str(item.get('rate', 0))),
                    'value': Decimal(str(item.get('value', 0)))
                })
            
            # Prepare item
            inventory_item = {
                'branch_vendor': branch_vendor,
                'date': date,
                'branch': branch,
                'vendor': vendor,
                'items': items_for_dynamo,
                'total_value': Decimal(str(total_value)),
                'item_count': len(items),
                'user_email': user_email,
                'created_at': datetime.now(IST).isoformat(),
                'updated_at': datetime.now(IST).isoformat()
            }
            
            # Check if entry exists
            existing = table.get_item(
                Key={'branch_vendor': branch_vendor, 'date': date}
            )
            
            if 'Item' in existing:
                # Update existing entry
                inventory_item['created_at'] = existing['Item'].get('created_at', inventory_item['created_at'])
            
            table.put_item(Item=inventory_item)
            
            # Also create S3 folder structure so dashboard can discover branch/vendor
            # The dashboard API scans S3 folders for branches and vendors
            try:
                safe_email = format_email_for_s3(user_email)
                safe_branch = sanitize_name(branch)
                safe_vendor = sanitize_name(vendor)
                
                # Create marker file in S3 folder structure
                # Path: users/{email}/{branch}/{vendor}/.closing_inventory_marker
                marker_key = f"users/{safe_email}/{safe_branch}/{safe_vendor}/.closing_inventory_marker"
                
                s3.put_object(
                    Bucket=BUCKET_NAME,
                    Key=marker_key,
                    Body=json.dumps({
                        "type": "closing_inventory_marker",
                        "branch": branch,
                        "vendor": vendor,
                        "created_at": datetime.now(IST).isoformat()
                    }),
                    ContentType="application/json"
                )
                print(f"✅ Created S3 marker: {marker_key}")
            except Exception as s3_err:
                print(f"⚠️ Failed to create S3 marker (non-fatal): {str(s3_err)}")
            
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'message': 'Closing inventory saved successfully',
                    'data': inventory_item
                }, default=decimal_default)
            }
        
        # DELETE - Remove closing inventory entry
        if http_method == 'DELETE':
            branch = query_params.get('branch', '').strip()
            vendor = query_params.get('vendor', '').strip()
            date = query_params.get('date', '').strip()
            
            if not branch or not vendor or not date:
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'branch, vendor, and date are required'})
                }
            
            branch_vendor = f"{branch.lower().replace(' ', '_')}_{vendor.lower().replace(' ', '_')}"
            
            # Check if exists
            existing = table.get_item(
                Key={'branch_vendor': branch_vendor, 'date': date}
            )
            
            if 'Item' not in existing:
                return {
                    'statusCode': 404,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'Closing inventory entry not found'})
                }
            
            table.delete_item(
                Key={'branch_vendor': branch_vendor, 'date': date}
            )
            
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'message': 'Closing inventory deleted successfully'
                })
            }
        
        # OPTIONS - CORS preflight
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                },
                'body': ''
            }
        
        return {
            'statusCode': 405,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Method not allowed'})
        }
    
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e)})
        }
