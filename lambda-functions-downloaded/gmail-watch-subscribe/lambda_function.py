"""
Gmail Watch Subscribe Lambda
Subscribes a user's Gmail mailbox to push notifications via Google Cloud Pub/Sub.
This should be called when a user connects their Gmail account.
"""

import json
import boto3
import os
from datetime import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Environment variables
TOKENS_TABLE = os.environ.get('TOKENS_TABLE', 'gmail_tokens')
PUBSUB_TOPIC = os.environ.get('PUBSUB_TOPIC', 'projects/YOUR_PROJECT_ID/topics/gmail-notifications')

dynamodb = boto3.resource('dynamodb')
tokens_table = dynamodb.Table(TOKENS_TABLE)

def lambda_handler(event, context):
    """
    Subscribe a user's Gmail to push notifications
    
    Request body:
    {
        "userEmail": "user@example.com"
    }
    """
    try:
        # Parse request
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event
        
        user_email = body.get('userEmail')
        
        if not user_email:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'userEmail is required'
                })
            }
        
        print(f"📧 Subscribing Gmail watch for user: {user_email}")
        
        # Get user's Gmail tokens from DynamoDB
        response = tokens_table.get_item(Key={'user_email': user_email})
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'No Gmail tokens found for user'
                })
            }
        
        token_data = response['Item']
        
        # Create credentials
        credentials = Credentials(
            token=token_data['access_token'],
            refresh_token=token_data['refresh_token'],
            token_uri='https://oauth2.googleapis.com/token',
            client_id=os.environ.get('GOOGLE_CLIENT_ID'),
            client_secret=os.environ.get('GOOGLE_CLIENT_SECRET')
        )
        
        # Build Gmail service
        service = build('gmail', 'v1', credentials=credentials)
        
        # Subscribe to push notifications
        request_body = {
            'topicName': PUBSUB_TOPIC,
            'labelIds': ['INBOX'],  # Only watch INBOX
            'labelFilterAction': 'include'
        }
        
        watch_response = service.users().watch(
            userId='me',
            body=request_body
        ).execute()
        
        print(f"✅ Gmail watch response: {watch_response}")
        
        # Store watch info in DynamoDB
        tokens_table.update_item(
            Key={'user_email': user_email},
            UpdateExpression='SET watch_history_id = :hid, watch_expiration = :exp, watch_updated_at = :updated',
            ExpressionAttributeValues={
                ':hid': watch_response['historyId'],
                ':exp': int(watch_response['expiration']) // 1000,  # Store as seconds
                ':updated': int(datetime.now().timestamp())
            }
        )
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'success': True,
                'message': 'Gmail watch subscription successful',
                'historyId': watch_response['historyId'],
                'expiration': watch_response['expiration']
            })
        }
        
    except HttpError as e:
        print(f"❌ Gmail API error: {e}")
        error_details = json.loads(e.content.decode('utf-8'))
        
        return {
            'statusCode': e.resp.status,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'success': False,
                'message': f"Gmail API error: {error_details.get('error', {}).get('message', str(e))}"
            })
        }
        
    except Exception as e:
        print(f"❌ Error subscribing Gmail watch: {e}")
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'success': False,
                'message': f'Error subscribing to Gmail notifications: {str(e)}'
            })
        }
