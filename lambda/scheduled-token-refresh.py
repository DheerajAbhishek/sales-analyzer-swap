"""
Scheduled Token Refresh Lambda
Automatically refreshes Google OAuth tokens that are expiring soon

Triggered by: EventBridge (hourly or every 6 hours)
Purpose: Ensure tokens are always valid without manual intervention
"""

import json
import boto3
import logging
import time
import urllib.request
import urllib.parse
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
REFRESH_THRESHOLD = int(os.environ.get('REFRESH_THRESHOLD', '7200'))  # Refresh if expiring in 2 hours

class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal types from DynamoDB"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def json_dumps_decimal(obj, **kwargs):
    """Helper function to JSON serialize objects with Decimal support"""
    return json.dumps(obj, cls=DecimalEncoder, **kwargs)

def get_google_oauth_credentials():
    """Retrieve Google OAuth credentials from Secrets Manager"""
    try:
        secret_name = "google-oauth-credentials"
        
        response = secrets_client.get_secret_value(SecretId=secret_name)
        
        if 'SecretString' in response:
            secret = json.loads(response['SecretString'])
            
            # Add token_uri if not present
            secret['token_uri'] = secret.get('token_uri', 'https://oauth2.googleapis.com/token')
            
            logger.info("✅ OAuth credentials loaded from Secrets Manager")
            return secret
        else:
            logger.error("Secret not found in Secrets Manager")
            return None
        
    except Exception as e:
        logger.error(f"Error retrieving OAuth credentials from Secrets Manager: {str(e)}")
        # Fallback to environment variables
        logger.info("Trying environment variables as fallback")
        return {
            'client_id': os.environ.get('GOOGLE_CLIENT_ID'),
            'client_secret': os.environ.get('GOOGLE_CLIENT_SECRET'),
            'token_uri': 'https://oauth2.googleapis.com/token'
        }

def get_all_user_tokens():
    """Scan DynamoDB for all user tokens"""
    try:
        tokens_table = dynamodb.Table(USER_TOKENS_TABLE)
        response = tokens_table.scan()
        return response.get('Items', [])
    except Exception as e:
        logger.error(f"Error scanning tokens table: {str(e)}")
        return []

def refresh_access_token(user_email, refresh_token, oauth_creds):
    """Refresh a single user's access token"""
    try:
        logger.info(f"Refreshing token for {user_email}")
        
        # Prepare refresh request
        refresh_data = {
            'client_id': oauth_creds['client_id'],
            'client_secret': oauth_creds['client_secret'],
            'refresh_token': refresh_token,
            'grant_type': 'refresh_token'
        }
        
        # Call Google's token endpoint using urllib
        data = urllib.parse.urlencode(refresh_data).encode('utf-8')
        req = urllib.request.Request(
            oauth_creds['token_uri'],
            data=data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                response_data = response.read()
                token_data = json.loads(response_data.decode('utf-8'))
        except urllib.error.HTTPError as e:
            logger.error(f"Token refresh failed for {user_email}: {e.code} {e.read().decode('utf-8')}")
            return None
        new_access_token = token_data.get('access_token')
        
        if not new_access_token:
            logger.error(f"No access token in response for {user_email}")
            return None
        
        # Update DynamoDB
        expires_in = token_data.get('expires_in', 3600)
        expires_at = int(time.time()) + expires_in
        
        tokens_table = dynamodb.Table(USER_TOKENS_TABLE)
        tokens_table.put_item(
            Item={
                'user_email': user_email,
                'access_token': new_access_token,
                'refresh_token': refresh_token,
                'expires_at': expires_at,
                'updated_at': int(time.time())
            }
        )
        
        logger.info(f"✅ Successfully refreshed token for {user_email}")
        return new_access_token
        
    except Exception as e:
        logger.error(f"Error refreshing token for {user_email}: {str(e)}")
        return None

def lambda_handler(event, context):
    """
    EventBridge scheduled handler to refresh expiring tokens
    """
    try:
        logger.info("🔄 Starting scheduled token refresh check")
        
        # Get OAuth credentials
        oauth_creds = get_google_oauth_credentials()
        if not oauth_creds:
            logger.error("Could not get OAuth credentials")
            return {
                'statusCode': 500,
                'body': json_dumps_decimal({'error': 'OAuth credentials not available'})
            }
        
        # Get all user tokens
        all_tokens = get_all_user_tokens()
        logger.info(f"Found {len(all_tokens)} users in database")
        
        current_time = int(time.time())
        refreshed_count = 0
        skipped_count = 0
        failed_count = 0
        
        for token_item in all_tokens:
            user_email = token_item.get('user_email')
            expires_at = token_item.get('expires_at', 0)
            refresh_token = token_item.get('refresh_token')
            
            if not user_email or not refresh_token:
                logger.warning(f"Skipping user - missing email or refresh token")
                skipped_count += 1
                continue
            
            # Check if token is expiring soon
            time_until_expiry = expires_at - current_time
            
            if time_until_expiry <= REFRESH_THRESHOLD:
                logger.info(f"Token for {user_email} expires in {time_until_expiry}s - refreshing")
                
                result = refresh_access_token(user_email, refresh_token, oauth_creds)
                if result:
                    refreshed_count += 1
                else:
                    failed_count += 1
            else:
                hours_left = time_until_expiry / 3600
                logger.info(f"Token for {user_email} still valid for {hours_left:.1f} hours - skipping")
                skipped_count += 1
        
        summary = {
            'timestamp': datetime.utcnow().isoformat(),
            'total_users': len(all_tokens),
            'refreshed': refreshed_count,
            'skipped': skipped_count,
            'failed': failed_count,
            'threshold_seconds': REFRESH_THRESHOLD
        }
        
        logger.info(f"✅ Scheduled refresh complete: {json_dumps_decimal(summary)}")
        
        return {
            'statusCode': 200,
            'body': json_dumps_decimal({
                'message': 'Token refresh check complete',
                'summary': summary
            })
        }
        
    except Exception as e:
        logger.error(f"Error in scheduled token refresh: {str(e)}")
        return {
            'statusCode': 500,
            'body': json_dumps_decimal({'error': str(e)})
        }


if __name__ == '__main__':
    # Test locally
    test_event = {}
    test_context = {}
    
    result = lambda_handler(test_event, test_context)
    print(json_dumps_decimal(result, indent=2))
