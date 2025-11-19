"""
Lambda function: get-user-restaurants

This function lists objects in an S3 bucket under the prefix `users/{encoded_email}/daily-insights/` and
extracts restaurant IDs from the object keys. It returns a JSON array of unique restaurant IDs.

Email encoding: admin@swapnow.in becomes admin_at_swapnow_dot_in
S3 structure: users/admin_at_swapnow_dot_in/daily-insights/{restaurantId}/file.json
Only searches within the daily-insights folder.

Environment variables:
  BUCKET_NAME - name of the S3 bucket

Input (event): one of:
  - query string parameter: ?businessEmail=admin@swapnow.in
  - pathParameters: { "businessEmail": "admin@swapnow.in" }
  - JSON body: { "businessEmail": "admin@swapnow.in" }
  - headers: business-email: admin@swapnow.in

Output (200): { "restaurantIds": ["19251816"], "objectKeysCount": 50 }

Permissions required (IAM): s3:ListBucket on the bucket. GetObject not required for listing.
"""
import os
import json
import boto3
from urllib import parse as urlparse

s3 = boto3.client('s3')


def _get_email_from_event(event):
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

    # 3) JSON body
    body = event.get('body') if isinstance(event, dict) else None
    if body:
        try:
            # If body is a JSON string, parse it
            if isinstance(body, str):
                parsed = json.loads(body)
            elif isinstance(body, dict):
                parsed = body
            else:
                parsed = None
            if parsed:
                email = parsed.get('email')
                if email:
                    return email
                email = parsed.get('businessEmail') or parsed.get('business_email')
                if email:
                    return email
        except Exception:
            pass

    # 4) headers (API Gateway will put HTTP headers at event['headers'])
    headers = event.get('headers') if isinstance(event, dict) else None
    if headers:
        # header names are case-insensitive; check common variants
        for h in ('business-email', 'businessEmail', 'business_email', 'email'):
            # support both lower and original case
            val = headers.get(h) or headers.get(h.lower()) or headers.get(h.upper())
            if val:
                return val

    # 5) Try authorization authorizer claims (Cognito or JWT authorizer)
    rc = event.get('requestContext') if isinstance(event, dict) else None
    if rc:
        auth = rc.get('authorizer') or rc.get('authorizer')
        if isinstance(auth, dict):
            # Common locations for claims vary between proxy integrations
            claims = auth.get('claims') or auth.get('jwt') and auth.get('jwt').get('claims')
            if isinstance(claims, dict):
                for claim_name in ('business_email', 'businessEmail', 'email', 'username'):
                    if claims.get(claim_name):
                        return claims.get(claim_name)

    return None


def _encode_email_for_s3(email):
    """
    Convert email to S3-safe folder name format.
    Example: admin@swapnow.in -> admin_at_swapnow_dot_in
    """
    if not email:
        return email
    
    # Replace @ with _at_ and . with _dot_
    encoded = email.replace('@', '_at_').replace('.', '_dot_')
    return encoded


def _extract_restaurant_id_from_key(key, prefix):
    """
    Given a full S3 key and the prefix (e.g. users/admin_at_swapnow_dot_in/daily-insights/), 
    return the restaurant id.
    
    Expected structure: users/{encoded_email}/daily-insights/{restaurantId}/file.json
    Prefix: users/admin_at_swapnow_dot_in/daily-insights/
    Remainder: 19251816/2025-09-01.json
    Extract: 19251816
    """
    if not key.startswith(prefix):
        return None
    
    remainder = key[len(prefix):]
    remainder = remainder.strip('/')
    
    if remainder == '':
        return None

    # Split the path: 19251816/2025-09-01.json
    segments = remainder.split('/')
    
    # Take the first segment as restaurant ID
    restaurant_id = segments[0]
    
    # Don't return if it's just a file extension or empty
    if not restaurant_id or restaurant_id.startswith('.'):
        return None
        
    return restaurant_id


def lambda_handler(event, context):
    # Add debugging to help troubleshoot
    print(f"Event: {json.dumps(event, default=str)}")
    print(f"HTTP Method: {event.get('httpMethod')}")
    print(f"Headers: {event.get('headers', {})}")
    
    # Handle CORS preflight requests
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
                'Access-Control-Max-Age': '3600'
            },
            'body': ''
        }

    # Event parsing
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

    # support url-encoded email in path/query
    email = urlparse.unquote_plus(email)
    
    # Convert email to S3-safe format
    encoded_email = _encode_email_for_s3(email)
    print(f"Original email: {email}")
    print(f"Encoded email for S3: {encoded_email}")

    bucket = os.environ.get('BUCKET_NAME')
    if not bucket:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json', 
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language'
            },
            'body': json.dumps({'message': 'Server misconfiguration: BUCKET_NAME not set'})
        }

    # Use encoded email for S3 prefix with users/ folder and daily-insights subfolder
    prefix = f'users/{encoded_email}/daily-insights/'
    print(f"S3 prefix: {prefix}")

    # First, let's see what's actually in the bucket root to debug
    print("=== DEBUG: Listing bucket root to see actual structure ===")
    try:
        root_paginator = s3.get_paginator('list_objects_v2')
        root_page_iterator = root_paginator.paginate(Bucket=bucket, MaxKeys=50)  # Limit for debugging
        
        for page in root_page_iterator:
            contents = page.get('Contents', [])
            for obj in contents[:10]:  # Show first 10 objects
                key = obj.get('Key', '')
                print(f"Root object found: {key}")
            if len(contents) > 10:
                print(f"... and {len(contents) - 10} more objects")
            break  # Only check first page
    except Exception as e:
        print(f"Error listing bucket root: {str(e)}")
    print("=== END DEBUG ===")

    paginator = s3.get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(Bucket=bucket, Prefix=prefix)

    restaurant_ids = set()
    object_keys = []

    print(f"Starting to list objects with prefix: {prefix}")
    
    for page in page_iterator:
        contents = page.get('Contents', [])
        print(f"Found {len(contents)} objects in this page")
        
        for obj in contents:
            key = obj.get('Key')
            if not key:
                continue
            
            print(f"Processing object key: {key}")
            object_keys.append(key)
            
            rid = _extract_restaurant_id_from_key(key, prefix)
            if rid:
                print(f"Extracted restaurant ID: {rid}")
                restaurant_ids.add(rid)
            else:
                print(f"No restaurant ID extracted from key: {key}")

    print(f"Final results:")
    print(f"Total object keys found: {len(object_keys)}")
    print(f"Object keys: {object_keys}")
    print(f"Unique restaurant IDs: {sorted(list(restaurant_ids))}")

    result = {
        'restaurantIds': sorted(list(restaurant_ids)),
        'objectKeysCount': len(object_keys),
    }

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


if __name__ == '__main__':
    # Local quick test (requires AWS credentials configured and BUCKET_NAME env var set).
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--email', required=True)
    args = parser.parse_args()
    os.environ.setdefault('BUCKET_NAME', os.environ.get('BUCKET_NAME', ''))
    ev = {'queryStringParameters': {'email': args.email}}
    print(lambda_handler(ev, None))
