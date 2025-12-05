import json
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

dynamodb = boto3.resource('dynamodb', region_name='ap-south-1')
table = dynamodb.Table('sales-dashboard-rista-mappings')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def lambda_handler(event, context):
    """
    Lambda function to manage Rista branch mappings in DynamoDB.
    GET: Retrieve all Rista mappings for a user
    POST: Save/update Rista mappings for a user
    
    Mapping structure:
    {
        "businessEmail": "user@example.com",
        "branchCode": "MK",  # Sort key - from Rista API
        "branchName": "Main Kitchen",
        "channels": ["Takeaway - Swap", "Zomato"],
        "mappedToRestaurantGroup": "restaurant_123",  # Optional - if mapped to existing group
        "isNewGroup": false,
        "createdAt": "2025-11-29T12:00:00Z"
    }
    """
    print(f"Received event: {json.dumps(event)}")
    
    # CORS headers
    cors_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,business-email",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET,DELETE"
    }
    
    # Handle OPTIONS preflight request
    http_method = event.get("httpMethod", "")
    if http_method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({"message": "OK"})
        }
    
    try:
        # Get business email from headers or query params
        headers = event.get("headers", {}) or {}
        query_params = event.get("queryStringParameters", {}) or {}
        
        # Case-insensitive header lookup
        business_email = None
        for key, value in headers.items():
            if key.lower() == "business-email":
                business_email = value
                break
        
        if not business_email:
            business_email = query_params.get("businessEmail")
        
        if not business_email:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "business-email header or businessEmail query param required"})
            }
        
        if http_method == "GET":
            # Retrieve all Rista mappings for this user
            response = table.query(
                KeyConditionExpression=Key('businessEmail').eq(business_email)
            )
            
            mappings = response.get('Items', [])
            
            return {
                "statusCode": 200,
                "headers": cors_headers,
                "body": json.dumps({
                    "success": True,
                    "mappings": mappings
                }, cls=DecimalEncoder)
            }
        
        elif http_method == "POST":
            # Save/update Rista mappings
            body = event.get("body", "{}")
            if isinstance(body, str):
                body = json.loads(body)
            
            mappings = body.get("mappings", [])
            
            if not mappings or not isinstance(mappings, list):
                return {
                    "statusCode": 400,
                    "headers": cors_headers,
                    "body": json.dumps({"error": "mappings array is required"})
                }
            
            # Save each mapping
            saved_count = 0
            for mapping in mappings:
                branch_code = mapping.get("branchCode")
                if not branch_code:
                    continue
                
                item = {
                    "businessEmail": business_email,
                    "branchCode": branch_code,
                    "branchName": mapping.get("branchName", ""),
                    "channels": mapping.get("channels", []),
                    "selectedChannels": mapping.get("selectedChannels", []),
                    "mappedToRestaurantGroup": mapping.get("mappedToRestaurantGroup"),
                    "restaurantGroupName": mapping.get("restaurantGroupName", ""),
                    "isNewGroup": mapping.get("isNewGroup", False),
                    "businessName": mapping.get("businessName", ""),
                    "address": mapping.get("address", ""),
                    "state": mapping.get("state", ""),
                    "createdAt": mapping.get("createdAt", ""),
                    "updatedAt": mapping.get("updatedAt", "")
                }
                
                # Remove None values
                item = {k: v for k, v in item.items() if v is not None}
                
                table.put_item(Item=item)
                saved_count += 1
            
            return {
                "statusCode": 200,
                "headers": cors_headers,
                "body": json.dumps({
                    "success": True,
                    "message": f"Saved {saved_count} mappings",
                    "savedCount": saved_count
                })
            }
        
        elif http_method == "DELETE":
            # Delete a specific mapping
            body = event.get("body", "{}")
            if isinstance(body, str):
                body = json.loads(body)
            
            branch_code = body.get("branchCode")
            if not branch_code:
                return {
                    "statusCode": 400,
                    "headers": cors_headers,
                    "body": json.dumps({"error": "branchCode is required for deletion"})
                }
            
            table.delete_item(
                Key={
                    "businessEmail": business_email,
                    "branchCode": branch_code
                }
            )
            
            return {
                "statusCode": 200,
                "headers": cors_headers,
                "body": json.dumps({
                    "success": True,
                    "message": f"Deleted mapping for {branch_code}"
                })
            }
        
        else:
            return {
                "statusCode": 405,
                "headers": cors_headers,
                "body": json.dumps({"error": f"Method {http_method} not allowed"})
            }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"})
        }
