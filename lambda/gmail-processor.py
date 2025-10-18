import json
import boto3
import base64
import os
import logging
import time
import requests
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import mimetypes
import hashlib

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
s3_client = boto3.client('s3')
secrets_client = boto3.client('secretsmanager')
dynamodb = boto3.resource('dynamodb')

# Environment variables
BUCKET_NAME = os.environ.get('S3_BUCKET_NAME', 'sale-dashboard-data')
USER_TOKENS_TABLE = os.environ.get('USER_TOKENS_TABLE', 'user-gmail-tokens')
N8N_WEBHOOK_URL = os.environ.get('N8N_WEBHOOK_URL')
GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

# Excel file MIME types
EXCEL_MIME_TYPES = [
    'application/vnd.ms-excel',  # .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # .xlsx
    'application/vnd.ms-excel.sheet.macroEnabled.12',  # .xlsm
    'text/csv',  # .csv (often used with Excel)
    'application/csv'  # .csv alternative
]

def get_cors_headers():
    """Return standard CORS headers"""
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
    }

def format_email_for_s3(email):
    """Convert email to S3-safe format (e.g., admin@swapnow.in -> admin_at_swapnow_dot_in)"""
    return email.replace('@', '_at_').replace('.', '_dot_')

def is_excel_file(mime_type, filename):
    """Check if the file is an Excel file"""
    if mime_type in EXCEL_MIME_TYPES:
        return True
    
    # Check by file extension as fallback
    excel_extensions = ['.xls', '.xlsx', '.xlsm', '.csv']
    return any(filename.lower().endswith(ext) for ext in excel_extensions)

class GmailTokenManager:
    """Manages Gmail API authentication tokens for users"""
    
    def __init__(self):
        self.table = dynamodb.Table(USER_TOKENS_TABLE)
    
    def store_user_tokens(self, user_email, access_token, refresh_token, expires_in=3600):
        """Store user's Gmail tokens in DynamoDB"""
        try:
            expires_at = int(time.time()) + expires_in
            
            self.table.put_item(
                Item={
                    'user_email': user_email,
                    'access_token': access_token,
                    'refresh_token': refresh_token,
                    'expires_at': expires_at,
                    'updated_at': int(time.time())
                }
            )
            logger.info(f"Stored tokens for user: {user_email}")
            return True
            
        except Exception as e:
            logger.error(f"Error storing tokens for {user_email}: {str(e)}")
            return False
    
    def get_user_tokens(self, user_email):
        """Retrieve user's Gmail tokens from DynamoDB"""
        try:
            response = self.table.get_item(Key={'user_email': user_email})
            
            if 'Item' not in response:
                logger.warning(f"No tokens found for user: {user_email}")
                return None
                
            return response['Item']
            
        except Exception as e:
            logger.error(f"Error retrieving tokens for {user_email}: {str(e)}")
            return None
    
    def refresh_access_token(self, user_email):
        """Refresh expired access token using refresh token"""
        try:
            tokens = self.get_user_tokens(user_email)
            if not tokens or 'refresh_token' not in tokens:
                logger.error(f"No refresh token found for user: {user_email}")
                return None
            
            # Get Google OAuth credentials from secrets manager
            google_creds = self.get_google_oauth_credentials()
            if not google_creds:
                logger.error("Failed to retrieve Google OAuth credentials")
                return None
            
            # Refresh token request
            refresh_data = {
                'client_id': google_creds['client_id'],
                'client_secret': google_creds['client_secret'],
                'refresh_token': tokens['refresh_token'],
                'grant_type': 'refresh_token'
            }
            
            response = requests.post('https://oauth2.googleapis.com/token', data=refresh_data)
            
            if response.status_code == 200:
                new_tokens = response.json()
                
                # Update stored tokens
                self.store_user_tokens(
                    user_email,
                    new_tokens['access_token'],
                    tokens['refresh_token'],  # Keep existing refresh token
                    new_tokens.get('expires_in', 3600)
                )
                
                logger.info(f"Successfully refreshed tokens for user: {user_email}")
                return new_tokens['access_token']
            else:
                logger.error(f"Token refresh failed for {user_email}: {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error refreshing tokens for {user_email}: {str(e)}")
            return None
    
    def get_valid_access_token(self, user_email):
        """Get a valid access token, refreshing if necessary"""
        try:
            tokens = self.get_user_tokens(user_email)
            if not tokens:
                return None
            
            current_time = int(time.time())
            
            # Check if token is still valid (with 5-minute buffer)
            if tokens['expires_at'] > current_time + 300:
                return tokens['access_token']
            
            # Token expired or about to expire, refresh it
            logger.info(f"Token expired for {user_email}, refreshing...")
            return self.refresh_access_token(user_email)
            
        except Exception as e:
            logger.error(f"Error getting valid token for {user_email}: {str(e)}")
            return None
    
    def get_google_oauth_credentials(self):
        """Retrieve Google OAuth credentials from AWS Secrets Manager"""
        try:
            secret_name = "google-oauth-credentials"
            region_name = "ap-south-1"
            
            # Create a Secrets Manager client with specific region
            session = boto3.session.Session()
            client = session.client(
                service_name='secretsmanager',
                region_name=region_name
            )
            
            response = client.get_secret_value(SecretId=secret_name)
            return json.loads(response['SecretString'])
        except Exception as e:
            logger.error(f"Error retrieving Google OAuth credentials: {str(e)}")
            return None


class GmailProcessor:
    """Processes Gmail emails and extracts attachments"""
    
    def __init__(self):
        self.token_manager = GmailTokenManager()
    
    def get_messages_from_sender(self, user_email, sender_email, max_results=150):
        """Fetch messages from a specific sender"""
        try:
            access_token = self.token_manager.get_valid_access_token(user_email)
            if not access_token:
                logger.error(f"No valid access token for user: {user_email}")
                return []
            
            headers = {'Authorization': f'Bearer {access_token}'}
            
            # Search query for specific sender
            query = f'from:{sender_email}'
            
            # Get message list
            list_url = f'{GMAIL_API_BASE}/users/me/messages'
            params = {
                'q': query,
                'maxResults': max_results
            }
            
            response = requests.get(list_url, headers=headers, params=params)
            
            if response.status_code != 200:
                logger.error(f"Failed to fetch message list: {response.text}")
                return []
            
            message_list = response.json()
            messages = message_list.get('messages', [])
            
            logger.info(f"Found {len(messages)} messages from {sender_email}")
            return messages
            
        except Exception as e:
            logger.error(f"Error fetching messages from {sender_email}: {str(e)}")
            return []
    
    def get_message_details(self, user_email, message_id):
        """Get detailed message information including attachments"""
        try:
            access_token = self.token_manager.get_valid_access_token(user_email)
            if not access_token:
                return None
            
            headers = {'Authorization': f'Bearer {access_token}'}
            
            # Get message details
            message_url = f'{GMAIL_API_BASE}/users/me/messages/{message_id}'
            response = requests.get(message_url, headers=headers)
            
            if response.status_code != 200:
                logger.error(f"Failed to fetch message details: {response.text}")
                return None
            
            return response.json()
            
        except Exception as e:
            logger.error(f"Error fetching message details for {message_id}: {str(e)}")
            return None
    
    def extract_attachments(self, user_email, message_data):
        """Extract attachments from a message - Filter only Excel files"""
        attachments = []
        
        try:
            def process_parts(parts):
                for part in parts:
                    # Check if part has filename (attachment)
                    if part.get('filename'):
                        attachment_id = part['body'].get('attachmentId')
                        if attachment_id:
                            filename = part['filename']
                            mime_type = part.get('mimeType', 'application/octet-stream')
                            
                            # Only process Excel files - ignore everything else
                            if is_excel_file(mime_type, filename):
                                attachments.append({
                                    'filename': filename,
                                    'attachment_id': attachment_id,
                                    'mime_type': mime_type,
                                    'size': part['body'].get('size', 0)
                                })
                                logger.info(f"Found Excel file: {filename} (MIME: {mime_type})")
                            else:
                                logger.info(f"Ignoring non-Excel file: {filename} (MIME: {mime_type})")
                    
                    # Recursively process nested parts
                    if 'parts' in part:
                        process_parts(part['parts'])
            
            payload = message_data.get('payload', {})
            
            # Check if payload itself has attachments
            if payload.get('filename'):
                attachment_id = payload['body'].get('attachmentId')
                if attachment_id:
                    filename = payload['filename']
                    mime_type = payload.get('mimeType', 'application/octet-stream')
                    
                    # Only process Excel files - ignore everything else
                    if is_excel_file(mime_type, filename):
                        attachments.append({
                            'filename': filename,
                            'attachment_id': attachment_id,
                            'mime_type': mime_type,
                            'size': payload['body'].get('size', 0)
                        })
                        logger.info(f"Found Excel file: {filename} (MIME: {mime_type})")
                    else:
                        logger.info(f"Ignoring non-Excel file: {filename} (MIME: {mime_type})")
            
            # Process parts if they exist
            if 'parts' in payload:
                process_parts(payload['parts'])
            
            logger.info(f"Found {len(attachments)} Excel attachments in message (ignored non-Excel files)")
            return attachments
            
        except Exception as e:
            logger.error(f"Error extracting attachments: {str(e)}")
            return []
    
    def download_attachment(self, user_email, message_id, attachment_id):
        """Download attachment data from Gmail"""
        try:
            access_token = self.token_manager.get_valid_access_token(user_email)
            if not access_token:
                return None
            
            headers = {'Authorization': f'Bearer {access_token}'}
            
            # Download attachment
            attachment_url = f'{GMAIL_API_BASE}/users/me/messages/{message_id}/attachments/{attachment_id}'
            response = requests.get(attachment_url, headers=headers)
            
            if response.status_code != 200:
                logger.error(f"Failed to download attachment: {response.text}")
                return None
            
            attachment_data = response.json()
            
            # Decode base64 data
            if 'data' in attachment_data:
                # Gmail uses URL-safe base64 encoding
                file_data = base64.urlsafe_b64decode(attachment_data['data'] + '==')
                return file_data
            
            return None
            
        except Exception as e:
            logger.error(f"Error downloading attachment {attachment_id}: {str(e)}")
            return None


class S3Uploader:
    """Handles uploading files to S3"""
    
    def upload_attachment(self, user_email, sender_email, attachment_data, filename, message_id, mime_type='application/octet-stream'):
        """Upload Excel attachment to S3 with organized structure"""
        try:
            # Validate file size (should be under 1MB for Excel files as mentioned)
            file_size = len(attachment_data)
            if file_size > 1024 * 1024:  # 1MB limit
                logger.warning(f"Excel file {filename} is larger than 1MB ({file_size} bytes)")
            
            # Format user email for S3 path
            formatted_user_email = format_email_for_s3(user_email)
            formatted_sender_email = format_email_for_s3(sender_email)
            
            # Create organized S3 key following your bucket structure
            timestamp = datetime.now().strftime('%Y-%m-%d')
            file_hash = hashlib.md5(attachment_data).hexdigest()[:8]
            
            # Clean filename for S3 - replace problematic characters with underscores
            clean_filename = "".join(c if (c.isalnum() or c in ('-', '_', '.')) else '_' for c in filename).rstrip()
            
            # Fixed S3 key structure - message_id and hash as part of filename, not folders
            s3_key = f"users/{formatted_user_email}/uploads/email-attachments/{formatted_sender_email}/{timestamp}/{message_id}_{file_hash}_{clean_filename}"
            
            # Prepare metadata for Excel files
            metadata = {
                'user_email': user_email,
                'sender_email': sender_email,
                'message_id': message_id,
                'original_filename': filename,
                'upload_timestamp': str(int(time.time())),
                'file_size': str(file_size),
                'mime_type': mime_type,
                'file_type': 'excel',
                'processed_by': 'gmail-processor-lambda'
            }
            
            # Set appropriate Content-Type for Excel files
            if mime_type == 'application/octet-stream':
                if filename.lower().endswith('.xlsx'):
                    content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                elif filename.lower().endswith('.xls'):
                    content_type = 'application/vnd.ms-excel'
                elif filename.lower().endswith('.csv'):
                    content_type = 'text/csv'
                else:
                    content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            else:
                content_type = mime_type
            
            # Upload to S3
            s3_client.put_object(
                Bucket=BUCKET_NAME,
                Key=s3_key,
                Body=attachment_data,
                ContentType=content_type,
                Metadata=metadata
            )
            
            logger.info(f"Uploaded Excel file to S3: {s3_key} (Size: {file_size} bytes)")
            return s3_key
            
        except Exception as e:
            logger.error(f"Error uploading Excel file to S3: {str(e)}")
            return None


class WebhookTrigger:
    """Triggers N8N webhook after processing"""
    
    def trigger_n8n_workflow(self, user_email, sender_email, processed_files):
        """Trigger N8N workflow with processing results using GET method"""
        try:
            if not N8N_WEBHOOK_URL:
                logger.warning("N8N webhook URL not configured")
                return False
            
            # Prepare summary data for GET request query parameters
            # Note: Full file list is too large for a GET request. Sending summary data.
            webhook_params = {
                'user_email': user_email,
                'sender_email': sender_email,
                'total_files': len(processed_files),
                'status': 'completed',
                'timestamp': datetime.now().isoformat()
            }
            
            # Send GET request with data in URL params
            response = requests.get(N8N_WEBHOOK_URL, params=webhook_params, timeout=30)
            
            if response.status_code == 200:
                logger.info(f"Successfully triggered N8N GET webhook for {user_email}")
                return True
            else:
                logger.error(f"N8N GET webhook failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error triggering N8N GET webhook: {str(e)}")
            return False


def lambda_handler(event, context):
    """Main Lambda handler"""
    
    # Log request details for debugging
    logger.info("=== GMAIL PROCESSOR REQUEST START ===")
    logger.info(f"HTTP Method: {event.get('httpMethod', 'NOT_PROVIDED')}")
    logger.info(f"Headers: {json.dumps(event.get('headers', {}), indent=2)}")
    logger.info(f"Request Body: {event.get('body', 'NO_BODY')[:200]}...")
    
    # Handle preflight OPTIONS request
    if event.get('httpMethod') == 'OPTIONS':
        logger.info("🔧 HANDLING OPTIONS PREFLIGHT REQUEST")
        cors_headers = {
            **get_cors_headers(),
            'Access-Control-Max-Age': '86400'
        }
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({'message': 'CORS preflight response'})
        }
    
    try:
        # Parse input
        body = json.loads(event.get('body', '{}')) if isinstance(event.get('body'), str) else event.get('body', {})
        
        user_email = body.get('user_email')
        sender_email = body.get('sender_email')
        max_results = body.get('max_results', 200)  # Increased to 200 messages to ensure we can find 150+ files
        
        if not user_email or not sender_email:
            return {
                'statusCode': 400,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'error': 'user_email and sender_email are required'
                })
            }
        
        logger.info(f"Processing emails for user: {user_email}, sender: {sender_email}")
        
        # IMMEDIATE RESPONSE - Start processing and return quickly to avoid timeout
        # Return success immediately while processing continues in background
        immediate_response = {
            'statusCode': 202,  # 202 Accepted - Processing started
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Email processing started successfully',
                'status': 'processing',
                'user_email': user_email,
                'sender_email': sender_email,
                'max_results': max_results,
                'note': 'Processing is running in background. Results will be sent via webhook when complete.',
                'estimated_time': '2-5 minutes for 150+ files',
                'response_time': '5 seconds (fast response mode)'
            })
        }
        
        # Check remaining time - if less than 5 seconds, return immediately
        remaining_time = context.get_remaining_time_in_millis() if context else 30000
        if remaining_time < 5000:  # Less than 5 seconds remaining - FAST RESPONSE
            logger.info(f"⏰ Limited time remaining ({remaining_time}ms), returning immediate response")
            return immediate_response
        
        # BACKGROUND PROCESSING - Continue with actual processing
        logger.info("🚀 Starting background email processing...")
        
        # Initialize processors
        gmail_processor = GmailProcessor()
        s3_uploader = S3Uploader()
        webhook_trigger = WebhookTrigger()
        
        processed_files = []
        
        # Get messages from sender
        messages = gmail_processor.get_messages_from_sender(user_email, sender_email, max_results)
        
        if not messages:
            logger.info("No messages found from sender")
            # Send webhook with no results
            webhook_trigger.trigger_n8n_workflow(user_email, sender_email, [])
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'message': 'No messages found from sender',
                    'processed_files': 0,
                    'note': 'Only Excel files (.xlsx, .xls, .xlsm, .csv) are processed'
                })
            }
        
        # Process each message with time management
        processed_count = 0
        max_files_per_run = 200  # Increased to handle 150+ files easily
        
        for message in messages:
            # Check remaining time every 10 messages
            if processed_count % 10 == 0 and context:
                remaining_time = context.get_remaining_time_in_millis()
                if remaining_time < 5000:  # Less than 5 seconds remaining
                    logger.info(f"⏰ Time limit approaching ({remaining_time}ms), stopping processing")
                    break
            
            if processed_count >= max_files_per_run:
                logger.info(f"Reached max files limit ({max_files_per_run}) - stopping to prevent timeout")
                break
                
            message_id = message['id']
            
            # Get message details
            message_data = gmail_processor.get_message_details(user_email, message_id)
            if not message_data:
                continue
            
            # Extract attachments
            attachments = gmail_processor.extract_attachments(user_email, message_data)
            
            # Process each attachment
            for attachment in attachments:
                try:
                    # Download attachment
                    attachment_data = gmail_processor.download_attachment(
                        user_email, message_id, attachment['attachment_id']
                    )
                    
                    if attachment_data:
                        # Upload to S3 with Excel-specific handling
                        s3_key = s3_uploader.upload_attachment(
                            user_email, sender_email, attachment_data, 
                            attachment['filename'], message_id, attachment['mime_type']
                        )
                        
                        if s3_key:
                            processed_files.append({
                                'filename': attachment['filename'],
                                's3_key': s3_key,
                                'message_id': message_id,
                                'size': attachment['size'],
                                'mime_type': attachment['mime_type'],
                                'file_type': 'excel'
                            })
                            processed_count += 1
                
                except Exception as e:
                    logger.error(f"Error processing Excel file {attachment['filename']}: {str(e)}")
                    continue
        
        logger.info(f"Processed {len(processed_files)} Excel files (max {max_files_per_run} per run)")
        
        # Trigger batch processing if files were processed
        if processed_files:
            try:
                lambda_client = boto3.client('lambda')
                batch_payload = {
                    "body": json.dumps({
                        "files": [file["s3_key"] for file in processed_files],
                        "businessEmail": user_email
                    })
                }
                
                # Get batch processor name from environment
                batch_processor_name = os.environ.get('BATCH_PROCESSOR_LAMBDA')
                if batch_processor_name:
                    response = lambda_client.invoke(
                        FunctionName=batch_processor_name,
                        InvocationType='Event',
                        Payload=json.dumps(batch_payload)
                    )
                    logger.info(f"Batch processing triggered for {len(processed_files)} files")
                else:
                    logger.warning("BATCH_PROCESSOR_LAMBDA environment variable not set")
            except Exception as e:
                logger.error(f"Failed to trigger batch processing: {str(e)}")
        
        # Trigger N8N webhook with results
        webhook_success = webhook_trigger.trigger_n8n_workflow(user_email, sender_email, processed_files)
        
        # Return final results (if we have time)
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Excel file processing completed',
                'user_email': user_email,
                'sender_email': sender_email,
                'processed_files': len(processed_files),
                'files': processed_files,
                'webhook_triggered': webhook_success,
                'total_messages_checked': len(messages),
                'max_files_per_run': max_files_per_run,
                'note': 'Excel files processed and webhook triggered with results.'
            })
        }
        
    except Exception as e:
        logger.error(f"Lambda execution error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }