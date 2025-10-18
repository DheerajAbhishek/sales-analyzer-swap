import json
import boto3
import logging
import time
import requests
from datetime import datetime
from decimal import Decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
dynamodb = boto3.resource('dynamodb')
secrets_client = boto3.client('secretsmanager')

# Environment variables
import os
USER_TOKENS_TABLE = os.environ.get('USER_TOKENS_TABLE', 'user-gmail-tokens')

class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal types from DynamoDB"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            # Convert Decimal to int if it's a whole number, otherwise float
            if obj % 1 == 0:
                return int(obj)
            else:
                return float(obj)
        return super(DecimalEncoder, self).default(obj)

def json_dumps_decimal(obj, **kwargs):
    """Helper function to JSON serialize objects with Decimal support"""
    return json.dumps(obj, cls=DecimalEncoder, **kwargs)

def get_cors_headers():
    """Return standard CORS headers"""
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
    }

def lambda_handler(event, context):
    """Lambda handler to manage Gmail OAuth tokens for users"""
    
    # Comprehensive logging for debugging CORS issues
    logger.info("=== GMAIL TOKEN MANAGER REQUEST START ===")
    logger.info(f"HTTP Method: {event.get('httpMethod', 'NOT_PROVIDED')}")
    logger.info(f"Headers: {json.dumps(event.get('headers', {}), indent=2)}")
    logger.info(f"Path Parameters: {event.get('pathParameters', {})}")
    logger.info(f"Query Parameters: {event.get('queryStringParameters', {})}")
    logger.info(f"Request Body: {event.get('body', 'NO_BODY')[:200]}...")  # First 200 chars
    logger.info(f"Source IP: {event.get('requestContext', {}).get('identity', {}).get('sourceIp', 'UNKNOWN')}")
    logger.info(f"User Agent: {event.get('headers', {}).get('User-Agent', 'UNKNOWN')}")
    logger.info(f"Origin: {event.get('headers', {}).get('Origin', 'UNKNOWN')}")
    logger.info(f"Referer: {event.get('headers', {}).get('Referer', 'UNKNOWN')}")
    
    # Handle preflight OPTIONS request
    if event.get('httpMethod') == 'OPTIONS':
        logger.info("🔧 HANDLING OPTIONS PREFLIGHT REQUEST")
        cors_headers = {
            **get_cors_headers(),
            'Access-Control-Max-Age': '86400'
        }
        logger.info(f"📤 PREFLIGHT RESPONSE HEADERS: {json.dumps(cors_headers, indent=2)}")
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({'message': 'CORS preflight response'})
        }
    
    # Route to appropriate handler based on HTTP method
    method = event.get('httpMethod', 'POST')
    logger.info(f"🚦 ROUTING REQUEST - Method: {method}")
    
    if method == 'GET':
        logger.info("➡️ Routing to GET handler")
        return get_user_tokens_handler(event, context)
    elif method == 'DELETE':
        logger.info("➡️ Routing to DELETE handler")
        return delete_user_tokens_handler(event, context)
    elif method == 'POST':
        logger.info("➡️ Routing to POST handler")
        return store_tokens_handler(event, context)
    else:
        logger.error(f"❌ UNSUPPORTED METHOD: {method}")
        error_response = {
            'statusCode': 405,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': f'Method {method} not allowed'})
        }
        logger.info(f"📤 ERROR RESPONSE: {json.dumps(error_response, indent=2)}")
        return error_response

def store_tokens_handler(event, context):
    """Handler to store Gmail OAuth tokens for users"""
    try:
        # Parse input
        body = json.loads(event.get('body', '{}')) if isinstance(event.get('body'), str) else event.get('body', {})
        
        # Check if this is a token check request (temporary workaround)
        if body.get('action') == 'check_tokens':
            logger.info("🔍 HANDLING TOKEN CHECK REQUEST VIA POST")
            user_email = body.get('user_email')
            
            if not user_email:
                return {
                    'statusCode': 400,
                    'headers': get_cors_headers(),
                    'body': json.dumps({
                        'error': 'user_email is required for token check'
                    })
                }
            
            # Use the existing get_user_tokens logic
            return get_user_tokens_handler(event, context)
        
        # Original token storage logic
        user_email = body.get('user_email')
        access_token = body.get('access_token')
        refresh_token = body.get('refresh_token')
        expires_in = body.get('expires_in', 3600)
        id_token = body.get('id_token')
        
        if not all([user_email, access_token, refresh_token]):
            return {
                'statusCode': 400,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'error': 'user_email, access_token, and refresh_token are required'
                })
            }
        
        logger.info(f"Storing Gmail tokens for user: {user_email}")
        
        # Calculate expiration timestamp
        expires_at = int(time.time()) + expires_in
        
        # Store tokens in DynamoDB
        table = dynamodb.Table(USER_TOKENS_TABLE)
        
        item = {
            'user_email': user_email,
            'access_token': access_token,
            'refresh_token': refresh_token,
            'expires_at': expires_at,
            'created_at': int(time.time()),
            'updated_at': int(time.time())
        }
        
        # Store ID token if provided
        if id_token:
            item['id_token'] = id_token
        
        table.put_item(Item=item)
        
        logger.info(f"Successfully stored tokens for user: {user_email}")
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Tokens stored successfully',
                'user_email': user_email,
                'expires_at': expires_at
            })
        }
        
    except Exception as e:
        logger.error(f"Error storing Gmail tokens: {str(e)}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }


def get_user_tokens_handler(event, context):
    """Lambda handler to retrieve Gmail tokens for a user"""
    logger.info("🔍 GET_USER_TOKENS_HANDLER CALLED")
    try:
        # Parse input - check both path parameters and body (handle None case)
        path_params = event.get('pathParameters') or {}
        user_email = path_params.get('userEmail')
        
        # If no user_email in path, check body (for POST workaround)
        if not user_email:
            body = json.loads(event.get('body', '{}')) if isinstance(event.get('body'), str) else event.get('body', {})
            user_email = body.get('user_email')
            logger.info("📧 Getting user_email from request body (POST workaround)")
        
        logger.info(f"📧 Extracted user_email: {user_email}")
        logger.info(f"🔍 All path parameters: {path_params}")
        
        if not user_email:
            logger.error("❌ No user_email provided in path parameters or body")
            error_response = {
                'statusCode': 400,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'error': 'user_email parameter is required'
                })
            }
            logger.info(f"📤 BAD REQUEST RESPONSE: {json.dumps(error_response, indent=2)}")
            return error_response
        
        logger.info(f"Retrieving Gmail tokens for user: {user_email}")
        
        # Get tokens from DynamoDB
        table = dynamodb.Table(USER_TOKENS_TABLE)
        logger.info(f"🗄️ Querying DynamoDB table: {USER_TOKENS_TABLE}")
        response = table.get_item(Key={'user_email': user_email})
        logger.info(f"📊 DynamoDB response: {json.dumps(response, default=str, indent=2)}")
        
        if 'Item' not in response:
            logger.warning(f"⚠️ No tokens found for user: {user_email}")
            not_found_response = {
                'statusCode': 404,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'error': 'No tokens found for user'
                })
            }
            logger.info(f"📤 NOT FOUND RESPONSE: {json.dumps(not_found_response, indent=2)}")
            return not_found_response
        
        tokens = response['Item']
        current_time = int(time.time())
        logger.info(f"⏰ Current timestamp: {current_time}")
        logger.info(f"🔑 Token expires_at: {tokens.get('expires_at', 'NOT_SET')}")
        
        # Check if tokens are expired
        is_expired = tokens['expires_at'] <= current_time
        logger.info(f"🔍 Token expired status: {is_expired}")
        
        # Return token status (without exposing actual tokens)
        success_response = {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json_dumps_decimal({
                'user_email': user_email,
                'has_tokens': True,
                'is_expired': is_expired,
                'expires_at': tokens['expires_at'],
                'created_at': tokens.get('created_at'),
                'updated_at': tokens.get('updated_at')
            })
        }
        logger.info(f"📤 SUCCESS RESPONSE: {json.dumps(success_response, indent=2)}")
        return success_response
        
    except Exception as e:
        logger.error(f"💥 ERROR in get_user_tokens_handler: {str(e)}")
        logger.error(f"💥 ERROR TYPE: {type(e).__name__}")
        logger.error(f"💥 ERROR DETAILS: {repr(e)}")
        error_response = {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }
        logger.info(f"📤 EXCEPTION RESPONSE: {json.dumps(error_response, indent=2)}")
        return error_response


def delete_user_tokens_handler(event, context):
    """Lambda handler to delete Gmail tokens for a user"""
    try:
        # Parse input
        user_email = event.get('pathParameters', {}).get('userEmail')
        
        if not user_email:
            return {
                'statusCode': 400,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'error': 'user_email parameter is required'
                })
            }
        
        logger.info(f"Deleting Gmail tokens for user: {user_email}")
        
        # Delete tokens from DynamoDB
        table = dynamodb.Table(USER_TOKENS_TABLE)
        table.delete_item(Key={'user_email': user_email})
        
        logger.info(f"Successfully deleted tokens for user: {user_email}")
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Tokens deleted successfully',
                'user_email': user_email
            })
        }
        
    except Exception as e:
        logger.error(f"Error deleting Gmail tokens: {str(e)}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }