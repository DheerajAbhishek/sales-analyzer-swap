import json
import boto3
import urllib.request
import urllib.parse
import urllib.error
import logging
import os
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def get_secret():
    """Retrieve Google OAuth credentials from AWS Secrets Manager"""
    secret_name = "google-oauth-credentials"
    region_name = "ap-south-1"
    
    session = boto3.session.Session()
    client = session.client(service_name='secretsmanager', region_name=region_name)
    
    try:
        response = client.get_secret_value(SecretId=secret_name)
        return json.loads(response['SecretString'])
    except ClientError as e:
        logger.error(f"Error retrieving secret: {e}")
        raise

def get_cors_headers(event):
    """Get CORS headers with origin validation"""
    # TODO: Update ALLOWED_ORIGINS when you have your production domain
    allowed_origins = [
        'http://localhost:3000',
        'http://localhost:5173',
        # Add your production domain here when ready
    ]
    
    origin = event.get('headers', {}).get('origin') or event.get('headers', {}).get('Origin', '')
    
    # Validate origin against whitelist
    if origin in allowed_origins:
        allowed_origin = origin
    else:
        # For development, allow localhost by default
        allowed_origin = 'http://localhost:3000'
        logger.warning(f"Request from unauthorized origin: {origin}")
    
    return {
        'Access-Control-Allow-Origin': allowed_origin,
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    }

def lambda_handler(event, context):
    """Refresh OAuth access token using refresh token"""
    
    headers = get_cors_headers(event)
    
    # Handle preflight OPTIONS request
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}
    
    # Log request metadata (without sensitive data)
    source_ip = event.get('requestContext', {}).get('identity', {}).get('sourceIp', 'unknown')
    user_agent = event.get('headers', {}).get('User-Agent', 'unknown')
    logger.info(f"Token refresh request - IP: {source_ip}, UA: {user_agent[:50]}")
    
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        refresh_token = body.get('refresh_token')
        
        # Validate required parameters
        if not refresh_token:
            logger.warning("Missing refresh token in request")
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Refresh token is required'
                })
            }
        
        # Get OAuth credentials from Secrets Manager
        secrets = get_secret()
        client_id = secrets.get('client_id')
        client_secret = secrets.get('client_secret')
        
        if not client_id or not client_secret:
            logger.error("Missing OAuth credentials in Secrets Manager")
            raise Exception('Missing OAuth credentials in Secrets Manager')
        
        # Refresh access token
        token_url = 'https://oauth2.googleapis.com/token'
        
        params = {
            'client_id': client_id,
            'client_secret': client_secret,
            'refresh_token': refresh_token,
            'grant_type': 'refresh_token'
        }
        
        data = urllib.parse.urlencode(params).encode('utf-8')
        
        req = urllib.request.Request(
            token_url,
            data=data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                token_data = json.loads(response.read().decode('utf-8'))
                
                logger.info("Token refresh successful")
                
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps({
                        'success': True,
                        'tokens': {
                            'access_token': token_data.get('access_token'),
                            'refresh_token': token_data.get('refresh_token'),  # May be null
                            'expires_in': token_data.get('expires_in'),
                            'token_type': token_data.get('token_type', 'Bearer')
                        }
                    })
                }
                
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            error_data = json.loads(error_body)
            
            logger.error(f"Google OAuth API error: {error_data}")
            
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': f"Token refresh failed: {error_data.get('error_description', error_data.get('error'))}"
                })
            }
    
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in request body: {e}")
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'message': 'Invalid request format'
            })
        }
    
    except Exception as e:
        logger.error(f"Lambda error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'message': 'Internal server error'
            })
        }
