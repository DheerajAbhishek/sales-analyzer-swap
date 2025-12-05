"""
Scheduled Token Refresh Lambda
Automatically refreshes Google OAuth tokens and renews Gmail watch subscriptions.

Triggered by: EventBridge (hourly or every 6 hours)
Purpose: Ensure tokens are always valid and email monitoring does not expire.
"""

import json
import boto3
import logging
import time
import requests
from datetime import datetime
from decimal import Decimal
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
dynamodb = boto3.resource('dynamodb')
secrets_client = boto3.client('secretsmanager')

# Environment variables
import os
USER_TOKENS_TABLE = os.environ.get('USER_TOKENS_TABLE', 'user-gmail-tokens')
# IMPORTANT: To prevent gaps where a token is expired but not yet refreshed,
# this threshold should be set to a value GREATER than the execution interval
# of the scheduled trigger (e.g., if the lambda runs every hour (3600s),
# set this threshold to at least 3700s, though a higher value like 7200s is safer).
REFRESH_THRESHOLD = int(os.environ.get('REFRESH_THRESHOLD', '7200'))  # Default: 2 hours
# IMPORTANT: This threshold should also be greater than the scheduler interval.
# Gmail watches last 7 days, so the default of 1 day is safe for any frequent schedule.
WATCH_REFRESH_THRESHOLD = int(os.environ.get('WATCH_REFRESH_THRESHOLD', '86400')) # Default: 1 day
PUBSUB_TOPIC = os.environ.get('PUBSUB_TOPIC')
OAUTH_SECRET_NAME = os.environ.get('OAUTH_SECRET_NAME', 'google-oauth-credentials')

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
    """Retrieve Google OAuth credentials from AWS Secrets Manager"""
    try:
        secret_name = OAUTH_SECRET_NAME
        response = secrets_client.get_secret_value(SecretId=secret_name)
        if 'SecretString' in response:
            secret = json.loads(response['SecretString'])
            secret['token_uri'] = secret.get('token_uri', 'https://oauth2.googleapis.com/token')
            logger.info("✅ OAuth credentials loaded from Secrets Manager")
            return secret
        else:
            logger.error("Secret not found in Secrets Manager")
            return None
    except Exception as e:
        logger.error(f"Error retrieving OAuth credentials from Secrets Manager: {str(e)}")
        logger.info("Trying environment variables as fallback")
        return {
            'client_id': os.environ.get('GOOGLE_CLIENT_ID'),
            'client_secret': os.environ.get('GOOGLE_CLIENT_SECRET'),
            'token_uri': 'https://oauth2.googleapis.com/token'
        }

def get_all_user_tokens():
    """
    Scan DynamoDB for all user tokens.
    TODO: For large numbers of users, 'scan' can be inefficient and costly.
    Consider a more targeted query approach, e.g., using a GSI on 'expires_at'
    to only fetch tokens that are close to expiring.
    """
    try:
        tokens_table = dynamodb.Table(USER_TOKENS_TABLE)
        response = tokens_table.scan()
        return response.get('Items', [])
    except Exception as e:
        logger.error(f"Error scanning tokens table: {str(e)}")
        return []

def refresh_access_token(user_email, refresh_token, oauth_creds):
    """Refresh a single user's access token and update it in DynamoDB."""
    try:
        logger.info(f"Attempting to refresh token for {user_email}")
        
        response = requests.post(
            oauth_creds['token_uri'],
            data={
                'client_id': oauth_creds['client_id'],
                'client_secret': oauth_creds['client_secret'],
                'refresh_token': refresh_token,
                'grant_type': 'refresh_token'
            },
            timeout=30
        )
        
        response.raise_for_status()  # Raises an HTTPError for bad responses (4xx or 5xx)
        
        token_data = response.json()
        new_access_token = token_data.get('access_token')

        if not new_access_token:
            logger.error(f"Token refresh response did not contain an access_token for {user_email}")
            return None
        
        expires_in = token_data.get('expires_in', 3600)
        expires_at = int(time.time()) + expires_in
        
        tokens_table = dynamodb.Table(USER_TOKENS_TABLE)
        tokens_table.update_item(
            Key={'user_email': user_email},
            UpdateExpression='SET access_token = :at, expires_at = :exp, updated_at = :ua',
            ExpressionAttributeValues={
                ':at': new_access_token,
                ':exp': expires_at,
                ':ua': int(time.time())
            }
        )
        
        logger.info(f"✅ Successfully refreshed token for {user_email}")
        return new_access_token
        
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error refreshing token for {user_email}: {e.response.status_code} {e.response.text}")
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred during token refresh for {user_email}: {str(e)}")
        return None

def create_or_renew_gmail_watch(user_email, access_token, refresh_token, oauth_creds):
    """Creates or renews the Gmail watch subscription for a user."""
    if not PUBSUB_TOPIC:
        logger.error("PUBSUB_TOPIC environment variable not set. Cannot create/renew watch.")
        return False
    try:
        credentials = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri=oauth_creds['token_uri'],
            client_id=oauth_creds['client_id'],
            client_secret=oauth_creds['client_secret']
        )
        
        service = build('gmail', 'v1', credentials=credentials)
        
        request_body = {
            'topicName': PUBSUB_TOPIC,
            'labelIds': ['INBOX'],
            'labelFilterAction': 'include'
        }
        
        logger.info(f"Executing Gmail watch request for {user_email}...")
        watch_response = service.users().watch(
            userId='me',
            body=request_body
        ).execute()
        
        logger.info(f"Gmail watch response for {user_email}: {watch_response}")
        
        tokens_table = dynamodb.Table(USER_TOKENS_TABLE)
        tokens_table.update_item(
            Key={'user_email': user_email},
            UpdateExpression='SET watch_history_id = :hid, watch_expiration = :exp, watch_updated_at = :updated',
            ExpressionAttributeValues={
                ':hid': watch_response['historyId'],
                ':exp': int(watch_response['expiration']) // 1000,
                ':updated': int(datetime.now().timestamp())
            }
        )
        logger.info(f"✅ Successfully created/renewed watch for {user_email}")
        return True
    except HttpError as e:
        logger.error(f"Gmail API error creating/renewing watch for {user_email}: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error creating/renewing watch for {user_email}: {e}")
        return False

def lambda_handler(event, context):
    """
    EventBridge scheduled handler to refresh expiring tokens and renew watches.
    """
    try:
        logger.info("🔄 Starting scheduled token refresh and watch renewal check")
        
        oauth_creds = get_google_oauth_credentials()
        if not oauth_creds or not oauth_creds.get('client_id'):
            logger.error("Could not get valid OAuth credentials")
            return {
                'statusCode': 500,
                'body': json_dumps_decimal({'error': 'OAuth credentials not available'})
            }
        
        all_tokens = get_all_user_tokens()
        logger.info(f"Found {len(all_tokens)} users in database")
        
        current_time = int(time.time())
        refreshed_count = 0
        renewed_watch_count = 0
        skipped_count = 0
        failed_count = 0
        
        for token_item in all_tokens:
            user_email = token_item.get('user_email')
            access_token = token_item.get('access_token')
            expires_at = token_item.get('expires_at', 0)
            refresh_token = token_item.get('refresh_token')
            watch_expiration = token_item.get('watch_expiration')
            
            if not user_email or not refresh_token:
                logger.warning(f"Skipping user - missing email or refresh token: {user_email}")
                skipped_count += 1
                continue
            
            # 1. Check and refresh OAuth token if needed
            time_until_expiry = int(expires_at) - current_time
            
            if time_until_expiry <= REFRESH_THRESHOLD:
                logger.info(f"Token for {user_email} expires in {time_until_expiry}s (or has expired) - refreshing.")
                new_access_token = refresh_access_token(user_email, refresh_token, oauth_creds)
                if new_access_token:
                    access_token = new_access_token
                    refreshed_count += 1
                else:
                    failed_count += 1
                    logger.warning(f"Skipping watch renewal for {user_email} due to token refresh failure.")
                    continue
            else:
                hours_left = time_until_expiry / 3600
                logger.info(f"Token for {user_email} is still valid for {hours_left:.1f} hours. No refresh needed.")

            # 2. Check and renew Gmail watch subscription if needed
            renew_watch = False
            if not watch_expiration:
                logger.info(f"No watch subscription found for {user_email}. Attempting to create one.")
                renew_watch = True
            else:
                time_until_watch_expiry = int(watch_expiration) - current_time
                if time_until_watch_expiry <= WATCH_REFRESH_THRESHOLD:
                    logger.info(f"Gmail watch for {user_email} expires in {time_until_watch_expiry}s - renewing...")
                    renew_watch = True
                else:
                    days_left = time_until_watch_expiry / 86400
                    logger.info(f"Watch for {user_email} still valid for {days_left:.1f} days.")

            if renew_watch:
                success = create_or_renew_gmail_watch(user_email, access_token, refresh_token, oauth_creds)
                if success:
                    renewed_watch_count += 1
        
        summary = {
            'timestamp': datetime.utcnow().isoformat(),
            'total_users': len(all_tokens),
            'tokens_refreshed': refreshed_count,
            'watches_renewed': renewed_watch_count,
            'skipped_users': skipped_count,
            'failed_refreshes': failed_count,
            'token_refresh_threshold_seconds': REFRESH_THRESHOLD,
            'watch_refresh_threshold_seconds': WATCH_REFRESH_THRESHOLD
        }
        
        logger.info(f"✅ Scheduled run complete: {json_dumps_decimal(summary)}")
        
        return {
            'statusCode': 200,
            'body': json_dumps_decimal({
                'message': 'Token and watch renewal check complete',
                'summary': summary
            })
        }
        
    except Exception as e:
        logger.error(f"Error in scheduled run: {str(e)}")
        return {
            'statusCode': 500,
            'body': json_dumps_decimal({'error': str(e)})
        }

if __name__ == '__main__':
    test_event = {}
    test_context = {}
    result = lambda_handler(test_event, test_context)
    print(json_dumps_decimal(result, indent=2))