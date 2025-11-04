"""
Gmail Token Manager - Cost Optimized Version

COST OPTIMIZATION: Uses Parameter Store instead of Secrets Manager for OAuth credentials
- Saves $0.40/month by eliminating Secrets Manager usage
- Uses AWS Systems Manager Parameter Store (free for standard parameters)

This replaces the get_google_oauth_credentials() method in existing Gmail processors.
"""

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
ssm_client = boto3.client('ssm')  # Parameter Store client (replaces secrets_client)

# Environment variables
import os
USER_TOKENS_TABLE = os.environ.get('USER_TOKENS_TABLE', 'user-gmail-tokens')

class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal types from DynamoDB"""
    def default(self, obj):
        if isinstance(obj, Decimal):
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


class CostOptimizedGmailTokenManager:
    """
    Gmail Token Manager using Parameter Store instead of Secrets Manager
    
    COST BENEFIT: Eliminates $0.40/month Secrets Manager cost
    """
    
    def __init__(self):
        self.tokens_table = dynamodb.Table(USER_TOKENS_TABLE)
    
    def get_google_oauth_credentials(self):
        """
        Retrieve Google OAuth credentials from Parameter Store (FREE!)
        
        Replaces the expensive Secrets Manager approach with free Parameter Store
        """
        try:
            parameter_prefix = "/sales-dashboard/google-oauth"
            
            # Get all OAuth parameters in one call
            response = ssm_client.get_parameters(
                Names=[
                    f"{parameter_prefix}/client-id",
                    f"{parameter_prefix}/client-secret",
                    f"{parameter_prefix}/redirect-uri",
                    f"{parameter_prefix}/auth-uri",
                    f"{parameter_prefix}/token-uri"
                ],
                WithDecryption=True  # Decrypt SecureString parameters
            )
            
            if not response['Parameters']:
                logger.error("No OAuth parameters found in Parameter Store")
                return None
            
            # Convert parameters to expected format
            credentials = {}
            
            for param in response['Parameters']:
                name = param['Name'].split('/')[-1]  # Get parameter name (e.g., 'client-id')
                key = name.replace('-', '_')  # Convert to underscore format (e.g., 'client_id')
                credentials[key] = param['Value']
            
            # Set defaults for missing parameters
            credentials.setdefault('auth_uri', 'https://accounts.google.com/o/oauth2/auth')
            credentials.setdefault('token_uri', 'https://oauth2.googleapis.com/token')
            
            # Validate required parameters
            required_params = ['client_id', 'client_secret']
            missing_params = [param for param in required_params if not credentials.get(param)]
            
            if missing_params:
                logger.error(f"Missing required OAuth parameters: {missing_params}")
                return None
            
            logger.info("✅ OAuth credentials loaded from Parameter Store (cost: $0.00)")
            return credentials
            
        except Exception as e:
            logger.error(f"Error retrieving OAuth credentials from Parameter Store: {str(e)}")
            return None
    
    def store_user_tokens(self, user_email, access_token, refresh_token, expires_in=3600):
        """Store user's Gmail tokens in DynamoDB"""
        try:
            expires_at = int(time.time()) + expires_in
            
            self.tokens_table.put_item(
                Item={
                    'userEmail': user_email,
                    'accessToken': access_token,
                    'refreshToken': refresh_token,
                    'expiresAt': expires_at,
                    'updatedAt': datetime.utcnow().isoformat()
                }
            )
            
            logger.info(f"Stored tokens for {user_email}")
            return True
            
        except Exception as e:
            logger.error(f"Error storing tokens for {user_email}: {str(e)}")
            return False
    
    def get_user_tokens(self, user_email):
        """Retrieve user's Gmail tokens from DynamoDB"""
        try:
            response = self.tokens_table.get_item(
                Key={'userEmail': user_email}
            )
            
            if 'Item' not in response:
                logger.info(f"No tokens found for {user_email}")
                return None
            
            return response['Item']
            
        except Exception as e:
            logger.error(f"Error retrieving tokens for {user_email}: {str(e)}")
            return None
    
    def refresh_access_token(self, user_email):
        """Refresh expired access token using refresh token"""
        try:
            tokens = self.get_user_tokens(user_email)
            if not tokens or 'refreshToken' not in tokens:
                logger.error(f"No refresh token found for {user_email}")
                return None
            
            # Get OAuth credentials from Parameter Store
            oauth_creds = self.get_google_oauth_credentials()
            if not oauth_creds:
                logger.error("Could not get OAuth credentials")
                return None
            
            # Refresh the token
            refresh_data = {
                'client_id': oauth_creds['client_id'],
                'client_secret': oauth_creds['client_secret'],
                'refresh_token': tokens['refreshToken'],
                'grant_type': 'refresh_token'
            }
            
            logger.info(f"Refreshing token for {user_email}")
            
            response = requests.post(
                oauth_creds['token_uri'],
                data=refresh_data,
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
                timeout=30
            )
            
            if response.status_code != 200:
                logger.error(f"Token refresh failed: {response.status_code} {response.text}")
                return None
            
            token_data = response.json()
            new_access_token = token_data.get('access_token')
            
            if not new_access_token:
                logger.error("No access token in refresh response")
                return None
            
            # Update stored tokens
            expires_in = token_data.get('expires_in', 3600)
            self.store_user_tokens(
                user_email, 
                new_access_token, 
                tokens['refreshToken'],  # Keep existing refresh token
                expires_in
            )
            
            logger.info(f"Token refreshed for {user_email}")
            return new_access_token
            
        except Exception as e:
            logger.error(f"Error refreshing token for {user_email}: {str(e)}")
            return None
    
    def get_valid_access_token(self, user_email):
        """Get a valid access token, refreshing if necessary"""
        try:
            tokens = self.get_user_tokens(user_email)
            if not tokens:
                return None
            
            current_time = int(time.time())
            if current_time >= tokens.get('expiresAt', 0):
                logger.info(f"Token expired for {user_email}, refreshing...")
                return self.refresh_access_token(user_email)
            
            return tokens['accessToken']
            
        except Exception as e:
            logger.error(f"Error getting valid token for {user_email}: {str(e)}")
            return None


def lambda_handler(event, context):
    """
    Example Lambda handler using the cost-optimized token manager
    """
    try:
        # Use the cost-optimized version
        token_manager = CostOptimizedGmailTokenManager()
        
        # Test the Parameter Store connection
        oauth_creds = token_manager.get_google_oauth_credentials()
        if oauth_creds:
            logger.info("✅ Successfully connected to Parameter Store (FREE!)")
        else:
            logger.error("❌ Failed to connect to Parameter Store")
            
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json_dumps_decimal({
                'message': 'Cost-optimized Gmail Token Manager active',
                'parameterStoreConnected': oauth_creds is not None,
                'costSavings': '$0.40/month by using Parameter Store instead of Secrets Manager'
            })
        }
        
    except Exception as e:
        logger.error(f"Error in lambda handler: {str(e)}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json_dumps_decimal({'error': str(e)})
        }


if __name__ == '__main__':
    # Test the cost-optimized version locally
    import os
    
    # Set environment variables for testing
    os.environ.setdefault('USER_TOKENS_TABLE', 'user-gmail-tokens')
    
    # Test the token manager
    manager = CostOptimizedGmailTokenManager()
    credentials = manager.get_google_oauth_credentials()
    
    if credentials:
        print("✅ Parameter Store connection successful!")
        print("💰 Cost: $0.00 (vs $0.40/month for Secrets Manager)")
        print("📋 Available credentials:")
        for key, value in credentials.items():
            if 'secret' in key.lower():
                print(f"  {key}: {'*' * 10} (hidden)")
            else:
                print(f"  {key}: {value}")
    else:
        print("❌ Parameter Store connection failed")
        print("Make sure you've run the migration script first")