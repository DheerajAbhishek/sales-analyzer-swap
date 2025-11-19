"""
Gmail Pub/Sub Notification Handler
Receives push notifications from Google Cloud Pub/Sub when users receive new emails.
Filters for specific senders (Zomato, Swiggy) and triggers real-time processing.
"""

import json
import boto3
import os
import base64
from datetime import datetime
from decimal import Decimal

# Environment variables
TOKENS_TABLE = os.environ.get('TOKENS_TABLE', 'gmail_tokens')
HISTORY_CHECKER_LAMBDA = os.environ.get('HISTORY_CHECKER_LAMBDA', 'gmail-history-checker')

dynamodb = boto3.resource('dynamodb')
tokens_table = dynamodb.Table(TOKENS_TABLE)
lambda_client = boto3.client('lambda')

# Senders we care about
MONITORED_SENDERS = [
    'billing@zomato.com',
    'payments@swiggy.in',
    'dheerajabhishek111@gmail.com',  # For testing purposes
    'narendhrakumar77@gmail.com'  # For testing purposes
]

def lambda_handler(event, context):
    """
    Handle Gmail push notification from Google Cloud Pub/Sub
    
    Pub/Sub sends data in this format:
    {
        "message": {
            "data": "base64-encoded-string",
            "messageId": "...",
            "publishTime": "..."
        }
    }
    """
    try:
        print(f"📬 Received Pub/Sub notification: {json.dumps(event)}")
        
        # Parse Pub/Sub message
        if 'body' in event:
            # Coming from API Gateway
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        else:
            body = event
        
        # Extract the message
        message = body.get('message', {})
        
        if not message:
            print("⚠️ No message in event")
            return {
                'statusCode': 200,
                'body': json.dumps({'success': True, 'message': 'No message data'})
            }
        
        # Decode the data
        encoded_data = message.get('data', '')
        if encoded_data:
            decoded_data = base64.b64decode(encoded_data).decode('utf-8')
            notification_data = json.loads(decoded_data)
            print(f"📨 Decoded notification: {notification_data}")
        else:
            print("⚠️ No data in message")
            return {
                'statusCode': 200,
                'body': json.dumps({'success': True, 'message': 'No data in message'})
            }
        
        # Extract user email and history ID
        user_email = notification_data.get('emailAddress')
        history_id = notification_data.get('historyId')
        
        if not user_email or not history_id:
            print(f"⚠️ Missing emailAddress or historyId in notification")
            return {
                'statusCode': 200,
                'body': json.dumps({'success': True, 'message': 'Invalid notification data'})
            }
        
        print(f"👤 User: {user_email}, History ID: {history_id}")
        
        # Get user's stored watch history ID
        try:
            response = tokens_table.get_item(Key={'user_email': user_email})
            
            if 'Item' not in response:
                print(f"⚠️ No tokens found for user: {user_email}")
                return {
                    'statusCode': 200,
                    'body': json.dumps({'success': True, 'message': 'User not found'})
                }
            
            token_data = response['Item']
            last_history_id = token_data.get('watch_history_id', 0)

            # Normalize DynamoDB Decimal (and string) types to native ints
            if isinstance(last_history_id, Decimal):
                last_history_id = int(last_history_id)
            elif isinstance(last_history_id, str):
                try:
                    last_history_id = int(last_history_id)
                except ValueError:
                    last_history_id = 0

            print(f"📊 Last history ID: {last_history_id}, New history ID: {history_id}")
            
            # Only process if this is a new change
            if int(history_id) <= int(last_history_id):
                print(f"ℹ️ History ID not newer, skipping")
                return {
                    'statusCode': 200,
                    'body': json.dumps({'success': True, 'message': 'Already processed'})
                }
            
            # Trigger history checker Lambda asynchronously
            # Convert Decimal types to int for JSON serialization
            # Ensure payload uses native Python types only (no Decimal)
            try:
                history_id_int = int(history_id)
            except Exception:
                history_id_int = 0

            last_history_id_int = int(last_history_id) if last_history_id else 0

            checker_payload = {
                'userEmail': str(user_email),
                'historyId': history_id_int,
                'lastHistoryId': last_history_id_int,
                'monitoredSenders': MONITORED_SENDERS
            }
            
            print(f"🚀 Invoking history checker for {user_email}")
            
            lambda_client.invoke(
                FunctionName=HISTORY_CHECKER_LAMBDA,
                InvocationType='Event',  # Async invocation
                Payload=json.dumps(checker_payload)
            )
            
            # Update last history ID
            # Persist the new history id as an int to avoid Decimal serialization issues
            tokens_table.update_item(
                Key={'user_email': user_email},
                UpdateExpression='SET watch_history_id = :hid, last_notification_at = :time',
                ExpressionAttributeValues={
                    ':hid': history_id_int,
                    ':time': int(datetime.now().timestamp())
                }
            )
            
            print(f"✅ Successfully queued history check for {user_email}")
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({
                    'success': True,
                    'message': 'Notification processed',
                    'userEmail': user_email,
                    'historyId': history_id
                })
            }
            
        except Exception as db_error:
            print(f"❌ Database error: {db_error}")
            # Still return 200 to Pub/Sub so it doesn't retry
            return {
                'statusCode': 200,
                'body': json.dumps({'success': False, 'message': str(db_error)})
            }
        
    except Exception as e:
        print(f"❌ Error processing notification: {e}")
        import traceback
        traceback.print_exc()
        
        # Return 200 to acknowledge receipt (prevent retries)
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'success': False,
                'message': str(e)
            })
        }
