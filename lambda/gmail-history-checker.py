"""
Gmail History Checker Lambda
Checks Gmail History API for new messages from monitored senders.
Then invokes the existing gmail-processor-optimized Lambda for each sender.
"""

import json
import boto3
import os
import requests
import logging
from datetime import datetime

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

# Environment variables
TOKENS_TABLE = os.environ.get('TOKENS_TABLE', 'gmail_tokens')
GMAIL_PROCESSOR_LAMBDA = os.environ.get('GMAIL_PROCESSOR_LAMBDA', 'gmail-processor-optimized')
GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

# Monitored senders
MONITORED_SENDERS = [
    'billing@zomato.com',
    'payments@swiggy.in',
    'dheerajabhishek111@gmail.com',  # For testing purposes
    'narendhrakumar77@gmail.com'  # For testing purposes
]

tokens_table = dynamodb.Table(TOKENS_TABLE)

def get_valid_access_token(user_email, refresh_token):
    """Get valid access token, refresh if needed"""
    try:
        # Get current tokens
        response = tokens_table.get_item(Key={'user_email': user_email})
        
        if 'Item' not in response:
            logger.error(f"No tokens found for {user_email}")
            return None
        
        token_data = response['Item']
        current_time = int(datetime.now().timestamp())
        
        # Check if token is expired
        if current_time >= token_data.get('expires_at', 0):
            logger.info(f"Token expired for {user_email}, refreshing...")
            
            # Get OAuth credentials
            secrets_client = boto3.client('secretsmanager')
            secret_response = secrets_client.get_secret_value(SecretId='google-oauth-credentials')
            oauth_creds = json.loads(secret_response['SecretString'])
            
            # Refresh token
            refresh_data = {
                'client_id': oauth_creds['client_id'],
                'client_secret': oauth_creds['client_secret'],
                'refresh_token': refresh_token,
                'grant_type': 'refresh_token'
            }
            
            response = requests.post('https://oauth2.googleapis.com/token', data=refresh_data)
            
            if response.status_code == 200:
                new_tokens = response.json()
                
                # Update stored tokens
                tokens_table.update_item(
                    Key={'user_email': user_email},
                    UpdateExpression='SET access_token = :token, expires_at = :exp, updated_at = :updated',
                    ExpressionAttributeValues={
                        ':token': new_tokens['access_token'],
                        ':exp': current_time + new_tokens.get('expires_in', 3600),
                        ':updated': current_time
                    }
                )
                
                return new_tokens['access_token']
            else:
                logger.error(f"Token refresh failed: {response.text}")
                return None
        
        return token_data['access_token']
        
    except Exception as e:
        logger.error(f"Error getting valid token: {e}")
        return None


def check_history_for_new_emails(user_email, history_id, last_history_id, access_token):
    """Check Gmail history for new messages from monitored senders"""
    try:
        headers = {'Authorization': f'Bearer {access_token}'}
        
        url = f'{GMAIL_API_BASE}/users/me/history'
        params = {
            'startHistoryId': last_history_id,
            'historyTypes': 'messageAdded',
            'maxResults': 100
        }
        
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            history = data.get('history', [])
            
            logger.info(f"Found {len(history)} history records")
            
            # Extract new message IDs
            new_message_ids = []
            for record in history:
                messages_added = record.get('messagesAdded', [])
                for msg in messages_added:
                    message = msg.get('message', {})
                    message_id = message.get('id')
                    if message_id:
                        new_message_ids.append(message_id)
            
            logger.info(f"Found {len(new_message_ids)} new messages")
            return new_message_ids
            
        elif response.status_code == 404:
            # History ID not found - probably too old
            logger.warning(f"History ID {last_history_id} not found, might be too old")
            return []
        else:
            logger.error(f"History API error: {response.text}")
            return []
            
    except Exception as e:
        logger.error(f"Error checking history: {e}")
        return []


def get_message_sender(user_email, message_id, access_token):
    """Get the sender of a specific message"""
    try:
        headers = {'Authorization': f'Bearer {access_token}'}
        url = f'{GMAIL_API_BASE}/users/me/messages/{message_id}'
        params = {'format': 'metadata', 'metadataHeaders': ['From']}
        
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            message_data = response.json()
            headers_list = message_data.get('payload', {}).get('headers', [])
            
            for header in headers_list:
                if header['name'].lower() == 'from':
                    from_value = header['value']
                    # Extract email from "Name <email@domain.com>" format
                    if '<' in from_value and '>' in from_value:
                        email = from_value.split('<')[1].split('>')[0].strip()
                    else:
                        email = from_value.strip()
                    return email.lower()
            
        return None
        
    except Exception as e:
        logger.error(f"Error getting message sender: {e}")
        return None


def lambda_handler(event, context):
    """
    Main handler - checks history and triggers processor for relevant senders
    
    Expected event:
    {
        "userEmail": "user@example.com",
        "historyId": "12345",
        "lastHistoryId": "12340",
        "monitoredSenders": ["billing@zomato.com", "payments@swiggy.in"]
    }
    """
    try:
        user_email = event.get('userEmail')
        history_id = event.get('historyId')
        last_history_id = event.get('lastHistoryId')
        monitored_senders = event.get('monitoredSenders', MONITORED_SENDERS)
        
        logger.info(f"🔍 Checking history for {user_email}")
        logger.info(f"   History ID: {last_history_id} → {history_id}")
        logger.info(f"   Monitoring: {monitored_senders}")
        
        # Get user's refresh token
        response = tokens_table.get_item(Key={'user_email': user_email})
        if 'Item' not in response:
            logger.error(f"No tokens found for {user_email}")
            return {'success': False, 'message': 'User tokens not found'}
        
        refresh_token = response['Item'].get('refresh_token')
        
        # Get valid access token
        access_token = get_valid_access_token(user_email, refresh_token)
        if not access_token:
            logger.error(f"Failed to get valid access token for {user_email}")
            return {'success': False, 'message': 'Failed to get access token'}
        
        # Check history for new messages
        new_message_ids = check_history_for_new_emails(
            user_email, history_id, last_history_id, access_token
        )
        
        if not new_message_ids:
            logger.info("No new messages found")
            return {'success': True, 'message': 'No new messages', 'processedSenders': []}
        
        # Check each message to see if it's from a monitored sender
        senders_with_new_emails = {}  # Changed to dict to track message IDs per sender
        
        for message_id in new_message_ids:
            sender = get_message_sender(user_email, message_id, access_token)
            logger.info(f"Message {message_id} sender: {sender}")
            if sender and sender in [s.lower() for s in monitored_senders]:
                if sender not in senders_with_new_emails:
                    senders_with_new_emails[sender] = []
                senders_with_new_emails[sender].append(message_id)
                logger.info(f"✉️  Found new email from monitored sender: {sender} (Message: {message_id})")
        
        if not senders_with_new_emails:
            logger.info("No messages from monitored senders")
            return {
                'success': True,
                'message': 'No messages from monitored senders',
                'processedSenders': []
            }
        
        # Invoke gmail-processor-optimized for each sender with specific message IDs
        processed_senders = []
        
        for sender, message_ids in senders_with_new_emails.items():
            try:
                logger.info(f"🚀 Invoking processor for {sender} with {len(message_ids)} specific messages")
                logger.info(f"   Message IDs: {message_ids}")
                
                processor_payload = {
                    'body': json.dumps({
                        'user_email': user_email,
                        'sender_email': sender,
                        'specific_message_ids': message_ids,  # ✅ Pass specific message IDs
                        'trigger_source': 'history_checker',
                        'history_id': history_id,
                        'process_mode': 'specific_messages'  # Tell processor to use specific IDs
                    })
                }
                
                # Invoke async
                lambda_client.invoke(
                    FunctionName=GMAIL_PROCESSOR_LAMBDA,
                    InvocationType='Event',  # Async
                    Payload=json.dumps(processor_payload)
                )
                
                processed_senders.append({
                    'sender': sender,
                    'message_count': len(message_ids),
                    'message_ids': message_ids
                })
                logger.info(f"✅ Triggered processor for {sender} with {len(message_ids)} messages")
                
            except Exception as e:
                logger.error(f"Failed to invoke processor for {sender}: {e}")
        
        return {
            'success': True,
            'message': f'Triggered processing for {len(processed_senders)} senders',
            'processedSenders': processed_senders,
            'newMessagesCount': len(new_message_ids)
        }
        
    except Exception as e:
        logger.error(f"Error in history checker: {e}")
        import traceback
        traceback.print_exc()
        
        return {
            'success': False,
            'message': str(e)
        }
