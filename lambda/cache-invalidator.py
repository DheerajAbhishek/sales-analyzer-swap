"""
Lambda function: cache-invalidator

This function is triggered when new files are uploaded to S3.
It invalidates the restaurant cache to ensure fresh data on next request.

Trigger: S3 event when objects are created in the daily-insights folder

Environment variables:
  USER_RESTAURANTS_CACHE_TABLE - DynamoDB table for caching
"""

import json
import boto3
import urllib.parse
from datetime import datetime

dynamodb = boto3.resource('dynamodb')

# Environment variables
import os
CACHE_TABLE_NAME = os.environ.get('USER_RESTAURANTS_CACHE_TABLE', 'user-restaurants-cache')

# Initialize DynamoDB table
try:
    cache_table = dynamodb.Table(CACHE_TABLE_NAME)
except Exception as e:
    print(f"Warning: Could not initialize cache table {CACHE_TABLE_NAME}: {e}")
    cache_table = None


def _decode_s3_email(s3_encoded_email):
    """Convert S3-safe email back to original format"""
    return s3_encoded_email.replace('_at_', '@').replace('_dot_', '.')


def lambda_handler(event, context):
    """
    S3 Event handler to invalidate cache when new files are uploaded
    """
    print(f"Received S3 event: {json.dumps(event, default=str)}")
    
    if not cache_table:
        print("Cache table not available, skipping invalidation")
        return {'statusCode': 200, 'body': 'Cache table not configured'}
    
    try:
        invalidated_users = set()
        
        # Process S3 events
        for record in event.get('Records', []):
            if record.get('eventSource') != 'aws:s3':
                continue
                
            bucket = record.get('s3', {}).get('bucket', {}).get('name')
            key = record.get('s3', {}).get('object', {}).get('key')
            
            if not key:
                continue
                
            # URL decode the key
            key = urllib.parse.unquote_plus(key)
            print(f"Processing S3 key: {key}")
            
            # Check if this is a daily-insights file
            # Expected format: users/{encoded_email}/daily-insights/{restaurantId}/file.json
            if '/daily-insights/' in key and key.startswith('users/'):
                try:
                    # Extract encoded email from path
                    parts = key.split('/')
                    if len(parts) >= 4 and parts[0] == 'users' and parts[2] == 'daily-insights':
                        encoded_email = parts[1]
                        user_email = _decode_s3_email(encoded_email)
                        
                        if user_email not in invalidated_users:
                            # Invalidate cache for this user
                            cache_table.delete_item(
                                Key={'userEmail': user_email}
                            )
                            invalidated_users.add(user_email)
                            print(f"✅ Invalidated cache for user: {user_email}")
                            
                except Exception as e:
                    print(f"Error processing key {key}: {e}")
                    continue
        
        if invalidated_users:
            print(f"Cache invalidated for {len(invalidated_users)} users: {list(invalidated_users)}")
        else:
            print("No cache invalidations needed")
            
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Processed {len(event.get("Records", []))} S3 events',
                'invalidatedUsers': list(invalidated_users)
            })
        }
        
    except Exception as e:
        print(f"Error in cache invalidator: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }


def manual_invalidate_handler(event, context):
    """
    Manual cache invalidation endpoint
    Body: {"userEmail": "user@example.com"} or {"invalidateAll": true}
    """
    try:
        if not cache_table:
            return {'statusCode': 500, 'body': 'Cache table not configured'}
            
        body = json.loads(event.get('body', '{}'))
        
        if body.get('invalidateAll'):
            # Scan and delete all cache entries (use sparingly!)
            response = cache_table.scan()
            with cache_table.batch_writer() as batch:
                for item in response['Items']:
                    batch.delete_item(Key={'userEmail': item['userEmail']})
            
            count = len(response['Items'])
            print(f"Invalidated all cache entries ({count} users)")
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'message': f'Invalidated cache for {count} users'})
            }
            
        elif body.get('userEmail'):
            user_email = body['userEmail']
            cache_table.delete_item(Key={'userEmail': user_email})
            print(f"Manually invalidated cache for: {user_email}")
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'message': f'Cache invalidated for {user_email}'})
            }
        else:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Missing userEmail or invalidateAll parameter'})
            }
            
    except Exception as e:
        print(f"Error in manual cache invalidation: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }