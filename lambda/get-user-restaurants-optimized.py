"""
Lambda function: get-user-restaurants-optimized

COST OPTIMIZATION: This function reduces S3 LIST operations by using DynamoDB as a cache.
Instead of scanning S3 every time, it maintains a user's restaurant list in DynamoDB and only
updates it when new data is actually uploaded.

This can reduce S3 requests from ~55,000/month to <1,000/month, saving ~$0.25/month.

Email encoding: admin@swapnow.in becomes admin_at_swapnow_dot_in
S3 structure: users/admin_at_swapnow_dot_in/daily-insights/{restaurantId}/file.json

Environment variables:
  BUCKET_NAME - name of the S3 bucket
  USER_RESTAURANTS_CACHE_TABLE - DynamoDB table for caching (default: user-restaurants-cache)

Input (event): one of:
  - query string parameter: ?businessEmail=admin@swapnow.in
  - pathParameters: { "businessEmail": "admin@swapnow.in" }
  - JSON body: { "businessEmail": "admin@swapnow.in" }
  - headers: business-email: admin@swapnow.in

Output (200): { "restaurantIds": ["19251816"], "cached": true, "lastUpdated": "2025-11-02T10:30:00Z" }
"""

import os
import json
import boto3
import traceback
from urllib import parse as urlparse
from datetime import datetime, timedelta
from decimal import Decimal

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Environment variables
BUCKET_NAME = os.environ.get('BUCKET_NAME')
CACHE_TABLE_NAME = os.environ.get('USER_RESTAURANTS_CACHE_TABLE', 'user-restaurants-cache')
CACHE_TTL_HOURS = int(os.environ.get('CACHE_TTL_HOURS', '24'))  # Cache for 24 hours by default

# Initialize DynamoDB table
try:
    cache_table = dynamodb.Table(CACHE_TABLE_NAME)
except Exception as e:
    print(f"Warning: Could not initialize cache table {CACHE_TABLE_NAME}: {e}")
    cache_table = None


def _get_email_from_event(event):
    """Extract email from various event sources"""
    # Try multiple common places where email might be supplied
    # 1) queryStringParameters
    q = event.get('queryStringParameters') if isinstance(event, dict) else None
    if q:
        email = q.get('email')
        if email:
            return email
        # also accept businessEmail as alternative name
        email = q.get('businessEmail') or q.get('business_email')
        if email:
            return email

    # 2) pathParameters
    p = event.get('pathParameters') if isinstance(event, dict) else None
    if p:
        email = p.get('email')
        if email:
            return email
        email = p.get('businessEmail') or p.get('business_email')
        if email:
            return email

    # 3) Request body (for POST requests)
    try:
        body = json.loads(event.get('body', '{}'))
        if body:
            email = body.get('email') or body.get('businessEmail') or body.get('business_email')
            if email:
                return email
    except (json.JSONDecodeError, TypeError):
        pass

    # 4) Headers
    headers = event.get('headers', {})
    if headers:
        # Check common header names
        for header_name in ['business-email', 'businessEmail', 'business_email', 'email']:
            if header_name in headers:
                return headers[header_name]

    return None


def _encode_email_for_s3(email):
    """Convert email to S3-safe format"""
    return email.replace('@', '_at_').replace('.', '_dot_')


def _extract_restaurant_id_from_key(key, prefix):
    """Extract restaurant ID from S3 object key"""
    try:
        # Remove the prefix to get the remainder: {restaurantId}/filename.json
        remainder = key[len(prefix):]
        # Split on '/' and take the first part (restaurant ID)
        parts = remainder.split('/')
        if len(parts) >= 1 and parts[0]:
            return parts[0]
        return None
    except Exception:
        return None


def _get_cached_restaurants(user_email):
    """Get cached restaurant list from DynamoDB"""
    if not cache_table:
        return None
        
    try:
        response = cache_table.get_item(
            Key={'userEmail': user_email}
        )
        
        if 'Item' not in response:
            return None
            
        item = response['Item']
        
        # Check if cache is still valid
        last_updated = datetime.fromisoformat(item['lastUpdated'])
        cache_expiry = last_updated + timedelta(hours=CACHE_TTL_HOURS)
        
        if datetime.utcnow() > cache_expiry:
            print(f"Cache expired for {user_email}")
            return None
            
        return {
            'restaurantIds': item['restaurantIds'],
            'lastUpdated': item['lastUpdated'],
            'cached': True
        }
        
    except Exception as e:
        print(f"Error reading cache for {user_email}: {e}")
        return None


def _update_cache(user_email, restaurant_ids):
    """Update cached restaurant list in DynamoDB"""
    if not cache_table:
        return
        
    try:
        cache_table.put_item(
            Item={
                'userEmail': user_email,
                'restaurantIds': restaurant_ids,
                'lastUpdated': datetime.utcnow().isoformat(),
                'ttl': int((datetime.utcnow() + timedelta(hours=CACHE_TTL_HOURS * 2)).timestamp())  # DynamoDB TTL
            }
        )
        print(f"Updated cache for {user_email} with {len(restaurant_ids)} restaurants")
    except Exception as e:
        print(f"Error updating cache for {user_email}: {e}")


def _scan_s3_for_restaurants(email, encoded_email):
    """Fallback: Scan S3 for restaurant IDs (expensive operation)"""
    print(f"🔍 FALLBACK: Scanning S3 for restaurants (expensive!)")
    
    if not BUCKET_NAME:
        raise ValueError("BUCKET_NAME environment variable not set")

    prefix = f'users/{encoded_email}/daily-insights/'
    print(f"S3 prefix: {prefix}")

    # List objects with pagination
    paginator = s3.get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(Bucket=BUCKET_NAME, Prefix=prefix)

    restaurant_ids = set()
    object_count = 0

    for page in page_iterator:
        contents = page.get('Contents', [])
        object_count += len(contents)
        
        for obj in contents:
            key = obj.get('Key')
            if not key:
                continue
                
            rid = _extract_restaurant_id_from_key(key, prefix)
            if rid:
                restaurant_ids.add(rid)

    restaurant_list = sorted(list(restaurant_ids))
    
    # Update cache with fresh data
    _update_cache(email, restaurant_list)
    
    return {
        'restaurantIds': restaurant_list,
        'objectKeysCount': object_count,
        'cached': False,
        'lastUpdated': datetime.utcnow().isoformat()
    }


def lambda_handler(event, context):
    """Main handler with DynamoDB caching to reduce S3 costs"""
    
    try:
        # Extract email from event
        email = _get_email_from_event(event)
        if not email:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json', 
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language'
                },
                'body': json.dumps({'message': 'Missing required parameter: email'})
            }

        # URL decode email if needed
        email = urlparse.unquote_plus(email)
        encoded_email = _encode_email_for_s3(email)
        
        print(f"Processing request for email: {email}")
        
        # Try to get from cache first
        cached_result = _get_cached_restaurants(email)
        if cached_result:
            print(f"✅ Cache HIT for {email} - returning {len(cached_result['restaurantIds'])} restaurants")
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json', 
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language'
                },
                'body': json.dumps(cached_result)
            }
        
        # Cache miss - need to scan S3 (expensive!)
        print(f"❌ Cache MISS for {email} - scanning S3")
        result = _scan_s3_for_restaurants(email, encoded_email)
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json', 
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language'
            },
            'body': json.dumps(result)
        }
    
    except Exception as e:
        print(f"❌ ERROR in lambda_handler: {str(e)}")
        print(f"❌ Error type: {type(e).__name__}")
        traceback.print_exc()
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json', 
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language'
            },
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }


def invalidate_cache_handler(event, context):
    """
    Separate handler to invalidate cache when new data is uploaded.
    Call this from your data upload pipeline to keep cache fresh.
    """
    try:
        # Extract email from event
        email = _get_email_from_event(event)
        if not email:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing email parameter'})
            }
        
        # Delete cache entry to force refresh on next request
        if cache_table:
            cache_table.delete_item(Key={'userEmail': email})
            print(f"Invalidated cache for {email}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({'message': f'Cache invalidated for {email}'})
        }
        
    except Exception as e:
        print(f"Error invalidating cache: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }


if __name__ == '__main__':
    # Local testing
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--email', required=True)
    parser.add_argument('--invalidate', action='store_true', help='Invalidate cache instead of reading')
    args = parser.parse_args()
    
    os.environ.setdefault('BUCKET_NAME', os.environ.get('BUCKET_NAME', ''))
    os.environ.setdefault('USER_RESTAURANTS_CACHE_TABLE', 'user-restaurants-cache')
    
    if args.invalidate:
        ev = {'queryStringParameters': {'email': args.email}}
        print(invalidate_cache_handler(ev, None))
    else:
        ev = {'queryStringParameters': {'email': args.email}}
        print(lambda_handler(ev, None))