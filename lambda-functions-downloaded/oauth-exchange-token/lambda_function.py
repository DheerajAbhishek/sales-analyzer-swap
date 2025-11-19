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

# Environment variables (configure in Lambda console)
SECRET_NAME = os.environ.get('GOOGLE_OAUTH_SECRET_NAME', 'google-oauth-credentials')
REGION_NAME = os.environ.get('AWS_REGION', 'ap-south-1')
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000,https://yourdomain.com').split(',')

def get_secret():
    """Retrieve Google OAuth credentials from AWS Secrets Manager"""
    session = boto3.session.Session()
    client = session.client(service_name='secretsmanager', region_name=REGION_NAME)
    
    try:
        response = client.get_secret_value(SecretId=SECRET_NAME)
        return json.loads(response['SecretString'])
    except ClientError as e:
        logger.error(f"Error retrieving secret: {e}")
        raise

def get_cors_headers(event):
    """Get CORS headers with origin validation"""
    origin = event.get('headers', {}).get('origin') or event.get('headers', {}).get('Origin', '')
    
    # Validate origin against whitelist
    if origin in ALLOWED_ORIGINS:
        allowed_origin = origin
    else:
        # Default to first allowed origin if origin not in whitelist
        allowed_origin = ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else '*'
        logger.warning(f"Request from unauthorized origin: {origin}")
    
    return {
        'Access-Control-Allow-Origin': allowed_origin,
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    }

def validate_redirect_uri(uri):
    """Validate redirect URI against allowed patterns"""
    allowed_uris = [
        'http://localhost:3000/oauth/callback',
        'http://localhost:5173/oauth/callback',
        'https://yourdomain.com/oauth/callback',
        # Add your production domain here
    ]
    return uri in allowed_uris

def lambda_handler(event, context):
    """Exchange OAuth authorization code for tokens securely"""
    
    headers = get_cors_headers(event)
    
    # Handle preflight OPTIONS request
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}
    
    # Log request metadata (without sensitive data)
    source_ip = event.get('requestContext', {}).get('identity', {}).get('sourceIp', 'unknown')
    user_agent = event.get('headers', {}).get('User-Agent', 'unknown')
    logger.info(f"OAuth exchange request - IP: {source_ip}, UA: {user_agent[:50]}")
    
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        code = body.get('code')
        redirect_uri = body.get('redirect_uri')
        
        # Validate required parameters
        if not code:
            logger.warning("Missing authorization code in request")
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Authorization code is required'
                })
            }
        
        if not redirect_uri:
            logger.warning("Missing redirect URI in request")
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Redirect URI is required'
                })
            }
        
        # Validate redirect URI against whitelist
        if not validate_redirect_uri(redirect_uri):
            logger.error(f"Invalid redirect URI attempted: {redirect_uri}")
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Invalid redirect URI'
                })
            }
        
        # Get OAuth credentials from Secrets Manager
        secrets = get_secret()
        client_id = secrets.get('client_id')
        client_secret = secrets.get('client_secret')
        
        if not client_id or not client_secret:
            logger.error("Missing OAuth credentials in Secrets Manager")
            raise Exception('Missing OAuth credentials in Secrets Manager')
        
        # Exchange authorization code for tokens
        token_url = 'https://oauth2.googleapis.com/token'
        
        params = {
            'client_id': client_id,
            'client_secret': client_secret,
            'code': code,
            'grant_type': 'authorization_code',
            'redirect_uri': redirect_uri
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
                
                logger.info("OAuth token exchange successful")
                
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps({
                        'success': True,
                        'tokens': {
                            'access_token': token_data.get('access_token'),
                            'refresh_token': token_data.get('refresh_token'),
                            'id_token': token_data.get('id_token'),
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
                    'message': f"Token exchange failed: {error_data.get('error_description', error_data.get('error'))}"
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
