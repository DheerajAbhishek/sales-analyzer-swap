import json
import boto3
from botocore.exceptions import ClientError
import os
from datetime import datetime

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')

# Get table name from environment variable
RESTAURANT_METADATA_TABLE = os.environ.get('RESTAURANT_METADATA_TABLE', 'restaurant-metadata')

def lambda_handler(event, context):
    """
    Save user restaurant metadata to DynamoDB
    """
    
    # Enable CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    }
    
    try:
        # Handle OPTIONS request for CORS
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'message': 'CORS preflight'})
            }
        
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        
        business_email = body.get('businessEmail')
        metadata = body.get('metadata', {})
        
        if not business_email:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'error': 'businessEmail is required'
                })
            }
        
        if not isinstance(metadata, dict):
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'error': 'metadata must be an object'
                })
            }
        
        # Get the table reference
        table = dynamodb.Table(RESTAURANT_METADATA_TABLE)
        
        # Prepare item to save
        item = {
            'businessEmail': business_email,
            'metadata': metadata,
            'updatedAt': datetime.utcnow().isoformat(),
            'createdAt': body.get('updatedAt', datetime.utcnow().isoformat())
        }
        
        # Check if this is an update (item already exists)
        try:
            existing_response = table.get_item(
                Key={'businessEmail': business_email}
            )
            if 'Item' in existing_response:
                # Preserve original creation date
                item['createdAt'] = existing_response['Item'].get('createdAt', item['createdAt'])
        except ClientError:
            # If get_item fails, continue with the save
            pass
        
        # Save to DynamoDB
        table.put_item(Item=item)
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'message': 'Restaurant metadata saved successfully',
                'businessEmail': business_email,
                'metadataKeys': len(metadata.keys()) if metadata else 0,
                'updatedAt': item['updatedAt']
            })
        }
        
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({
                'error': 'Invalid JSON in request body'
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