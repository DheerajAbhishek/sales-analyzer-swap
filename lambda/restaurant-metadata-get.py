import json
import boto3
from botocore.exceptions import ClientError
import os

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')

# Get table name from environment variable
RESTAURANT_METADATA_TABLE = os.environ.get('RESTAURANT_METADATA_TABLE', 'restaurant-metadata')

def lambda_handler(event, context):
    """
    Get user restaurant metadata from DynamoDB
    """
    
    # Enable CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Max-Age': '86400'
    }
    
    try:
        # Handle OPTIONS request for CORS
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'message': 'CORS preflight'})
            }
        
        # Get business email from query parameters
        query_params = event.get('queryStringParameters') or {}
        business_email = query_params.get('businessEmail')
        
        if not business_email:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'error': 'businessEmail parameter is required'
                })
            }
        
        # Get the table reference
        table = dynamodb.Table(RESTAURANT_METADATA_TABLE)
        
        # Query the table
        response = table.get_item(
            Key={
                'businessEmail': business_email
            }
        )
        
        # Check if item exists
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({
                    'message': 'No restaurant metadata found for this user',
                    'metadata': {}
                })
            }
        
        # Return the metadata
        item = response['Item']
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'metadata': item.get('metadata', {}),
                'updatedAt': item.get('updatedAt'),
                'message': 'Restaurant metadata retrieved successfully'
            })
        }
        
    except ClientError as e:
        print(f"DynamoDB error: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': 'Database error occurred',
                'details': str(e)
            })
        }
        
    except Exception as e:
        print(f"Unexpected error: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': 'An unexpected error occurred',
                'details': str(e)
            })
        }