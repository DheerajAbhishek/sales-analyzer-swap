import json
import boto3
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

# AWS clients
dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME', 'invoice-items-rohith')
IST = timezone(timedelta(hours=5, minutes=30))

# Default categories with subcategories
CATEGORIES = {
    "Dairy": ["Paneer", "Milk", "Curd_Yogurt", "Butter", "Cheese", "Tofu", "Ghee"],
    "Poultry": ["Eggs", "Chicken"],
    "Vegetables": ["Capsicum", "Tomato", "Coriander", "Lettuce", "Mushroom", "Garlic", "Ginger", "Onion", "Potato", "Broccoli", "Chilli", "Carrot", "Beans", "Cucumber", "Pumpkin", "Beetroot", "Okra", "Leafy Vegs", "Others"],
    "Fruits": ["Banana", "Papaya", "Watermelon", "Pineapple", "Pomegranate", "Mango", "Apple", "Kiwi", "Melon", "Guava", "Lemon"],
    "Dry Store": ["Rice", "Flour", "Pulses", "Millets", "Oats", "Spices", "Seasoning", "Dry Fruits", "Nuts_Seeds", "Sauces_Dressings", "Jams_Spreads", "Pastes", "Essentials", "Soya", "Beverages", "Bakery", "Seafood", "Oils", "Frozen"],
    "Packaging": ["Containers", "Cutlery", "Bags", "Tapes_Foils", "Paper_Wrapping"],
    "Housekeeping": ["Cleaners", "Tools", "Waste_Disposal", "Personal_Protection", "Paper_Products"],
    "Misc": ["Delivery", "Service", "Other"]
}


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
                {'AttributeName': 'item_name', 'KeyType': 'HASH'}  # Partition key
            ],
            AttributeDefinitions=[
                {'AttributeName': 'item_name', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        table.wait_until_exists()
        
        # Seed initial items from static data
        seed_initial_items(table)
        return table


def seed_initial_items(table):
    """Seed initial items from invoiceItems.json structure"""
    initial_items = [
        {"name": "Paneer", "category": "Dairy", "subcategory": "Paneer", "defaultUom": "kg"},
        {"name": "Milk", "category": "Dairy", "subcategory": "Milk", "defaultUom": "liter"},
        {"name": "Curd", "category": "Dairy", "subcategory": "Curd_Yogurt", "defaultUom": "kg"},
        {"name": "Butter", "category": "Dairy", "subcategory": "Butter", "defaultUom": "kg"},
        {"name": "Cheese", "category": "Dairy", "subcategory": "Cheese", "defaultUom": "kg"},
        {"name": "Ghee", "category": "Dairy", "subcategory": "Ghee", "defaultUom": "liter"},
        {"name": "Tofu", "category": "Dairy", "subcategory": "Tofu", "defaultUom": "kg"},
        {"name": "Eggs", "category": "Poultry", "subcategory": "Eggs", "defaultUom": "pcs"},
        {"name": "Chicken", "category": "Poultry", "subcategory": "Chicken", "defaultUom": "kg"},
        {"name": "Chicken Breast", "category": "Poultry", "subcategory": "Chicken", "defaultUom": "kg"},
        {"name": "Tomato", "category": "Vegetables", "subcategory": "Tomato", "defaultUom": "kg"},
        {"name": "Onion", "category": "Vegetables", "subcategory": "Onion", "defaultUom": "kg"},
        {"name": "Potato", "category": "Vegetables", "subcategory": "Potato", "defaultUom": "kg"},
        {"name": "Capsicum", "category": "Vegetables", "subcategory": "Capsicum", "defaultUom": "kg"},
        {"name": "Green Capsicum", "category": "Vegetables", "subcategory": "Capsicum", "defaultUom": "kg"},
        {"name": "Red Capsicum", "category": "Vegetables", "subcategory": "Capsicum", "defaultUom": "kg"},
        {"name": "Yellow Capsicum", "category": "Vegetables", "subcategory": "Capsicum", "defaultUom": "kg"},
        {"name": "Coriander", "category": "Vegetables", "subcategory": "Coriander", "defaultUom": "kg"},
        {"name": "Lettuce", "category": "Vegetables", "subcategory": "Lettuce", "defaultUom": "kg"},
        {"name": "Mushroom", "category": "Vegetables", "subcategory": "Mushroom", "defaultUom": "kg"},
        {"name": "Garlic", "category": "Vegetables", "subcategory": "Garlic", "defaultUom": "kg"},
        {"name": "Ginger", "category": "Vegetables", "subcategory": "Ginger", "defaultUom": "kg"},
        {"name": "Broccoli", "category": "Vegetables", "subcategory": "Broccoli", "defaultUom": "kg"},
        {"name": "Carrot", "category": "Vegetables", "subcategory": "Carrot", "defaultUom": "kg"},
        {"name": "Beans", "category": "Vegetables", "subcategory": "Beans", "defaultUom": "kg"},
        {"name": "Cucumber", "category": "Vegetables", "subcategory": "Cucumber", "defaultUom": "kg"},
        {"name": "Spinach", "category": "Vegetables", "subcategory": "Leafy Vegs", "defaultUom": "kg"},
        {"name": "Mint", "category": "Vegetables", "subcategory": "Leafy Vegs", "defaultUom": "kg"},
        {"name": "Banana", "category": "Fruits", "subcategory": "Banana", "defaultUom": "kg"},
        {"name": "Apple", "category": "Fruits", "subcategory": "Apple", "defaultUom": "kg"},
        {"name": "Mango", "category": "Fruits", "subcategory": "Mango", "defaultUom": "kg"},
        {"name": "Papaya", "category": "Fruits", "subcategory": "Papaya", "defaultUom": "kg"},
        {"name": "Watermelon", "category": "Fruits", "subcategory": "Watermelon", "defaultUom": "kg"},
        {"name": "Pineapple", "category": "Fruits", "subcategory": "Pineapple", "defaultUom": "kg"},
        {"name": "Lemon", "category": "Fruits", "subcategory": "Lemon", "defaultUom": "kg"},
        {"name": "Basmati Rice", "category": "Dry Store", "subcategory": "Rice", "defaultUom": "kg"},
        {"name": "Wheat Flour", "category": "Dry Store", "subcategory": "Flour", "defaultUom": "kg"},
        {"name": "Maida", "category": "Dry Store", "subcategory": "Flour", "defaultUom": "kg"},
        {"name": "Besan", "category": "Dry Store", "subcategory": "Flour", "defaultUom": "kg"},
        {"name": "Chana Dal", "category": "Dry Store", "subcategory": "Pulses", "defaultUom": "kg"},
        {"name": "Moong Dal", "category": "Dry Store", "subcategory": "Pulses", "defaultUom": "kg"},
        {"name": "Rajma", "category": "Dry Store", "subcategory": "Pulses", "defaultUom": "kg"},
        {"name": "Salt", "category": "Dry Store", "subcategory": "Essentials", "defaultUom": "kg"},
        {"name": "Sugar", "category": "Dry Store", "subcategory": "Essentials", "defaultUom": "kg"},
        {"name": "Sunflower Oil", "category": "Dry Store", "subcategory": "Oils", "defaultUom": "liter"},
        {"name": "Olive Oil", "category": "Dry Store", "subcategory": "Oils", "defaultUom": "liter"},
        {"name": "Garam Masala", "category": "Dry Store", "subcategory": "Spices", "defaultUom": "kg"},
        {"name": "Turmeric Powder", "category": "Dry Store", "subcategory": "Spices", "defaultUom": "kg"},
        {"name": "Red Chilli Powder", "category": "Dry Store", "subcategory": "Spices", "defaultUom": "kg"},
        {"name": "Cumin Seeds", "category": "Dry Store", "subcategory": "Spices", "defaultUom": "kg"},
        {"name": "Tomato Ketchup", "category": "Dry Store", "subcategory": "Sauces_Dressings", "defaultUom": "kg"},
        {"name": "Mayonnaise", "category": "Dry Store", "subcategory": "Sauces_Dressings", "defaultUom": "kg"},
        {"name": "Soya Sauce", "category": "Dry Store", "subcategory": "Sauces_Dressings", "defaultUom": "liter"},
        {"name": "Bread", "category": "Dry Store", "subcategory": "Bakery", "defaultUom": "pcs"},
        {"name": "Pav", "category": "Dry Store", "subcategory": "Bakery", "defaultUom": "pcs"},
        {"name": "Tortilla", "category": "Dry Store", "subcategory": "Bakery", "defaultUom": "pcs"},
        {"name": "French Fries", "category": "Dry Store", "subcategory": "Frozen", "defaultUom": "kg"},
        {"name": "Frozen Peas", "category": "Dry Store", "subcategory": "Frozen", "defaultUom": "kg"},
        {"name": "Container 500ml", "category": "Packaging", "subcategory": "Containers", "defaultUom": "pcs"},
        {"name": "Container 250ml", "category": "Packaging", "subcategory": "Containers", "defaultUom": "pcs"},
        {"name": "Paper Bag", "category": "Packaging", "subcategory": "Bags", "defaultUom": "pcs"},
        {"name": "Tissue Roll", "category": "Packaging", "subcategory": "Paper_Wrapping", "defaultUom": "pcs"},
        {"name": "Aluminium Foil", "category": "Packaging", "subcategory": "Tapes_Foils", "defaultUom": "pcs"},
        {"name": "Dishwash Liquid", "category": "Housekeeping", "subcategory": "Cleaners", "defaultUom": "liter"},
        {"name": "Floor Cleaner", "category": "Housekeeping", "subcategory": "Cleaners", "defaultUom": "liter"},
        {"name": "Garbage Bags", "category": "Housekeeping", "subcategory": "Waste_Disposal", "defaultUom": "pcs"},
        {"name": "Hand Gloves", "category": "Housekeeping", "subcategory": "Personal_Protection", "defaultUom": "pcs"},
        {"name": "Delivery Charges", "category": "Misc", "subcategory": "Delivery", "defaultUom": "pcs"},
    ]
    
    with table.batch_writer() as batch:
        for item in initial_items:
            batch.put_item(Item={
                'item_name': item['name'].lower(),
                'display_name': item['name'],
                'category': item['category'],
                'subcategory': item.get('subcategory', 'Others'),
                'defaultUom': item['defaultUom'],
                'created_at': datetime.now(IST).isoformat(),
                'source': 'seed'
            })


def lambda_handler(event, context):
    """
    Handle invoice items CRUD operations
    
    GET ?mode=items - Get all items
    GET ?mode=categories - Get category structure
    POST - Add new item
    PUT - Update existing item
    DELETE ?item_name=xxx - Delete an item
    """
    try:
        # Handle different HTTP methods - support both API Gateway and Function URL formats
        http_method = (
            event.get('httpMethod') or 
            event.get('requestContext', {}).get('http', {}).get('method') or 
            'GET'
        )
        
        # Parse query parameters - support both formats
        query_params = event.get('queryStringParameters') or {}
        mode = query_params.get('mode', 'items')
        
        print(f"📥 Request: {http_method} - mode={mode} - params={query_params}")
        
        table = get_table()
        
        # GET - Fetch items or categories
        if http_method == 'GET':
            if mode == 'categories':
                return {
                    'statusCode': 200,
                    'headers': {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    },
                    'body': json.dumps({
                        'categories': CATEGORIES
                    })
                }
            
            # Fetch all items
            response = table.scan()
            items = response.get('Items', [])
            
            # Handle pagination if needed
            while 'LastEvaluatedKey' in response:
                response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
                items.extend(response.get('Items', []))
            
            # Format items for frontend
            formatted_items = []
            for item in items:
                formatted_items.append({
                    'name': item.get('display_name', item.get('item_name', '')),
                    'category': item.get('category', 'Unknown'),
                    'subcategory': item.get('subcategory', 'Others'),
                    'defaultUom': item.get('defaultUom', 'pcs')
                })
            
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({
                    'items': formatted_items,
                    'count': len(formatted_items)
                }, default=decimal_default)
            }
        
        # POST - Add new item
        if http_method == 'POST':
            body = event.get('body', '{}')
            if isinstance(body, str):
                body = json.loads(body)
            
            item_name = body.get('name', '').strip()
            category = body.get('category', 'Misc')
            subcategory = body.get('subcategory', 'Other')
            default_uom = body.get('defaultUom', 'pcs')
            
            if not item_name:
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'Item name is required'})
                }
            
            # Check if item already exists
            existing = table.get_item(Key={'item_name': item_name.lower()})
            if 'Item' in existing:
                return {
                    'statusCode': 409,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({
                        'error': 'Item already exists',
                        'existing_item': {
                            'name': existing['Item'].get('display_name'),
                            'category': existing['Item'].get('category')
                        }
                    }, default=decimal_default)
                }
            
            # Add new item
            new_item = {
                'item_name': item_name.lower(),
                'display_name': item_name,
                'category': category,
                'subcategory': subcategory,
                'defaultUom': default_uom,
                'created_at': datetime.now(IST).isoformat(),
                'source': 'user'
            }
            
            table.put_item(Item=new_item)
            
            return {
                'statusCode': 201,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'message': 'Item added successfully',
                    'item': {
                        'name': item_name,
                        'category': category,
                        'subcategory': subcategory,
                        'defaultUom': default_uom
                    }
                })
            }
        
        # PUT - Update existing item
        if http_method == 'PUT':
            body = event.get('body', '{}')
            if isinstance(body, str):
                body = json.loads(body)
            
            item_name = body.get('name', '').strip()
            if not item_name:
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'Item name is required'})
                }
            
            # Check if item exists
            existing = table.get_item(Key={'item_name': item_name.lower()})
            if 'Item' not in existing:
                return {
                    'statusCode': 404,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'Item not found'})
                }
            
            # Build update expression
            update_parts = []
            expression_values = {}
            expression_names = {}
            
            if 'category' in body:
                update_parts.append('#cat = :cat')
                expression_values[':cat'] = body['category']
                expression_names['#cat'] = 'category'
            
            if 'subcategory' in body:
                update_parts.append('subcategory = :subcat')
                expression_values[':subcat'] = body['subcategory']
            
            if 'defaultUom' in body:
                update_parts.append('defaultUom = :uom')
                expression_values[':uom'] = body['defaultUom']
            
            if not update_parts:
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'No fields to update'})
                }
            
            update_parts.append('updated_at = :updated')
            expression_values[':updated'] = datetime.now(IST).isoformat()
            
            update_expression = 'SET ' + ', '.join(update_parts)
            
            update_params = {
                'Key': {'item_name': item_name.lower()},
                'UpdateExpression': update_expression,
                'ExpressionAttributeValues': expression_values,
                'ReturnValues': 'ALL_NEW'
            }
            if expression_names:
                update_params['ExpressionAttributeNames'] = expression_names
            
            result = table.update_item(**update_params)
            
            updated_item = result.get('Attributes', {})
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'message': 'Item updated successfully',
                    'item': {
                        'name': updated_item.get('display_name', item_name),
                        'category': updated_item.get('category'),
                        'subcategory': updated_item.get('subcategory'),
                        'defaultUom': updated_item.get('defaultUom')
                    }
                }, default=decimal_default)
            }
        
        # DELETE - Remove an item
        if http_method == 'DELETE':
            item_name = query_params.get('item_name', '').strip()
            if not item_name:
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'item_name query parameter is required'})
                }
            
            # Check if item exists
            existing = table.get_item(Key={'item_name': item_name.lower()})
            if 'Item' not in existing:
                return {
                    'statusCode': 404,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'Item not found'})
                }
            
            # Delete the item
            table.delete_item(Key={'item_name': item_name.lower()})
            
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'message': 'Item deleted successfully',
                    'deleted_item': item_name
                })
            }
        
        # OPTIONS - CORS preflight
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
