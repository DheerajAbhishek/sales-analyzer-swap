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
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
s3_client = boto3.client('s3')
secrets_client = boto3.client('secretsmanager')
dynamodb = boto3.resource('dynamodb')

# Thread-safe counter
class Counter:
    def __init__(self):
        self.value = 0
        self.lock = Lock()
    
    def increment(self):
        with self.lock:
            self.value += 1
            return self.value

# Environment variables
BUCKET_NAME = os.environ.get('S3_BUCKET_NAME', 'sale-dashboard-data')
USER_TOKENS_TABLE = os.environ.get('USER_TOKENS_TABLE', 'user-gmail-tokens')
N8N_WEBHOOK_URL = os.environ.get('N8N_WEBHOOK_URL')
GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'
MAX_WORKERS = int(os.environ.get('MAX_WORKERS', '10'))  # Concurrent threads

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
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
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
                    tokens['refresh_token'],
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
            if current_time >= tokens.get('expires_at', 0):
                logger.info(f"Token expired for {user_email}, refreshing...")
                return self.refresh_access_token(user_email)
            
            return tokens['access_token']
            
        except Exception as e:
            logger.error(f"Error getting valid token for {user_email}: {str(e)}")
            return None
    
    def get_google_oauth_credentials(self):
        """Retrieve Google OAuth credentials from Secrets Manager"""
        try:
            secret_name = "google-oauth-credentials"
            response = secrets_client.get_secret_value(SecretId=secret_name)
            return json.loads(response['SecretString'])
        except Exception as e:
            logger.error(f"Error retrieving Google OAuth credentials: {str(e)}")
            return None


class GmailProcessor:
    """Handles Gmail API operations"""
    
    def __init__(self):
        self.token_manager = GmailTokenManager()
    
    def get_messages_from_sender(self, user_email, sender_email, max_results=200):
        """Get messages from a specific sender"""
        try:
            access_token = self.token_manager.get_valid_access_token(user_email)
            if not access_token:
                logger.error(f"No valid access token for user: {user_email}")
                return []
            
            headers = {'Authorization': f'Bearer {access_token}'}
            query = f'from:{sender_email} has:attachment'
            
            params = {
                'q': query,
                'maxResults': min(max_results, 500)
            }
            
            url = f'{GMAIL_API_BASE}/users/me/messages'
            response = requests.get(url, headers=headers, params=params)
            
            if response.status_code == 200:
                messages = response.json().get('messages', [])
                logger.info(f"Found {len(messages)} messages from {sender_email}")
                return messages
            else:
                logger.error(f"Failed to fetch messages: {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting messages from sender: {str(e)}")
            return []
    
    def get_message_details(self, user_email, message_id):
        """Get full message details including attachments"""
        try:
            access_token = self.token_manager.get_valid_access_token(user_email)
            if not access_token:
                return None
            
            headers = {'Authorization': f'Bearer {access_token}'}
            url = f'{GMAIL_API_BASE}/users/me/messages/{message_id}'
            
            response = requests.get(url, headers=headers)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to get message details: {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting message details: {str(e)}")
            return None
    
    def extract_attachments(self, user_email, message_data):
        """Extract attachment information from message"""
        attachments = []
        
        try:
            parts = message_data.get('payload', {}).get('parts', [])
            
            def process_part(part):
                filename = part.get('filename', '')
                mime_type = part.get('mimeType', '')
                
                if filename and part.get('body', {}).get('attachmentId'):
                    if is_excel_file(mime_type, filename):
                        attachments.append({
                            'filename': filename,
                            'mime_type': mime_type,
                            'attachment_id': part['body']['attachmentId'],
                            'size': part['body'].get('size', 0)
                        })
                
                if 'parts' in part:
                    for sub_part in part['parts']:
                        process_part(sub_part)
            
            for part in parts:
                process_part(part)
                
        except Exception as e:
            logger.error(f"Error extracting attachments: {str(e)}")
        
        return attachments
    
    def download_attachment(self, user_email, message_id, attachment_id):
        """Download attachment data from Gmail"""
        try:
            access_token = self.token_manager.get_valid_access_token(user_email)
            if not access_token:
                return None
            
            headers = {'Authorization': f'Bearer {access_token}'}
            url = f'{GMAIL_API_BASE}/users/me/messages/{message_id}/attachments/{attachment_id}'
            
            response = requests.get(url, headers=headers)
            
            if response.status_code == 200:
                attachment_data = response.json()
                file_data = base64.urlsafe_b64decode(attachment_data['data'])
                return file_data
            else:
                logger.error(f"Failed to download attachment: {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error downloading attachment: {str(e)}")
            return None


class S3Uploader:
    """Handles S3 upload operations"""
    
    def __init__(self):
        self.processed_files_cache = set()  # Cache to track processed files in this run
    
    def check_file_exists(self, s3_key):
        """Check if file already exists in S3"""
        try:
            s3_client.head_object(Bucket=BUCKET_NAME, Key=s3_key)
            return True
        except s3_client.exceptions.NoSuchKey:
            return False
        except Exception as e:
            logger.warning(f"Error checking file existence: {str(e)}")
            return False
    
    def upload_attachment(self, user_email, sender_email, file_data, filename, message_id, mime_type):
        """Upload attachment to S3 with proper organization and duplicate detection"""
        try:
            formatted_user = format_email_for_s3(user_email)
            formatted_sender = format_email_for_s3(sender_email)
            current_date = datetime.now().strftime('%Y-%m-%d')
            
            file_hash = hashlib.md5(file_data).hexdigest()[:8]
            # Replace spaces, slashes, and other problematic characters with underscores
            safe_filename = filename.replace(' ', '_').replace('/', '_').replace('\\', '_')
            
            s3_key = f"users/{formatted_user}/uploads/email-attachments/{formatted_sender}/{current_date}/{file_hash}_{safe_filename}"
            
            # Check if we've already processed this file in this run
            file_signature = f"{file_hash}_{safe_filename}"
            if file_signature in self.processed_files_cache:
                logger.info(f"⚠️  Skipping duplicate file in current run: {filename}")
                return None
            
            # Check if file already exists in S3
            if self.check_file_exists(s3_key):
                logger.info(f"⚠️  File already exists in S3, skipping: {filename}")
                self.processed_files_cache.add(file_signature)
                return s3_key  # Return existing key for tracking
            
            # Upload new file
            s3_client.put_object(
                Bucket=BUCKET_NAME,
                Key=s3_key,
                Body=file_data,
                ContentType=mime_type,
                Metadata={
                    'user_email': user_email,
                    'sender_email': sender_email,
                    'message_id': message_id,
                    'original_filename': filename,
                    'upload_date': current_date,
                    'file_hash': file_hash
                }
            )
            
            # Add to cache
            self.processed_files_cache.add(file_signature)
            logger.info(f"✅ Uploaded NEW file: {filename} to {s3_key}")
            return s3_key
            
        except Exception as e:
            logger.error(f"Error uploading to S3: {str(e)}")
            return None


class WebhookTrigger:
    """Handles N8N webhook notifications"""
    
    def trigger_n8n_workflow(self, user_email, sender_email, processed_files):
        """Trigger N8N workflow with processing results"""
        if not N8N_WEBHOOK_URL:
            logger.info("N8N webhook URL not configured, skipping notification")
            return False
        
        try:
            payload = {
                'event': 'gmail_excel_processed',
                'user_email': user_email,
                'sender_email': sender_email,
                'processed_count': len(processed_files),
                'files': processed_files,
                'timestamp': datetime.now().isoformat()
            }
            
            response = requests.post(
                N8N_WEBHOOK_URL,
                json=payload,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully triggered N8N webhook for {len(processed_files)} files")
                return True
            else:
                logger.warning(f"N8N webhook returned status {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Error triggering N8N webhook: {str(e)}")
            return False


def process_single_message(message, user_email, sender_email, gmail_processor, s3_uploader, processed_counter):
    """Process a single message and its attachments (thread-safe)"""
    processed_files = []
    
    try:
        message_id = message['id']
        
        # Get message details
        message_data = gmail_processor.get_message_details(user_email, message_id)
        if not message_data:
            return processed_files
        
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
                            'file_type': 'excel',
                            'status': 'uploaded' if s3_key else 'skipped_duplicate'
                        })
                        
                        count = processed_counter.increment()
                        if count % 10 == 0:
                            logger.info(f"✓ Processed {count} files so far...")
            
            except Exception as e:
                logger.error(f"Error processing attachment {attachment.get('filename', 'unknown')}: {str(e)}")
                continue
        
        return processed_files
        
    except Exception as e:
        logger.error(f"Error processing message {message.get('id', 'unknown')}: {str(e)}")
        return []


def lambda_handler(event, context):
    """Main Lambda handler with concurrent processing"""
    
    # Log request details for debugging
    logger.info("=" * 80)
    logger.info("🚀 GMAIL PROCESSOR (OPTIMIZED) REQUEST START")
    logger.info("=" * 80)
    logger.info(f"HTTP Method: {event.get('httpMethod', 'NOT_PROVIDED')}")
    logger.info(f"Max Workers: {MAX_WORKERS}")
    
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
        start_time = time.time()
        
        # Parse input
        body = json.loads(event.get('body', '{}')) if isinstance(event.get('body'), str) else event.get('body', {})
        
        user_email = body.get('user_email')
        sender_email = body.get('sender_email')
        max_results = body.get('max_results', 200)
        specific_message_ids = body.get('specific_message_ids')  # New: specific messages to process
        process_mode = body.get('process_mode', 'search_by_sender')  # New: processing mode
        trigger_source = body.get('trigger_source', 'manual')
        
        if not user_email or not sender_email:
            return {
                'statusCode': 400,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'error': 'user_email and sender_email are required'
                })
            }
        
        logger.info(f"Processing emails for user: {user_email}, sender: {sender_email}")
        logger.info(f"Trigger source: {trigger_source}, Process mode: {process_mode}")
        if specific_message_ids:
            logger.info(f"Specific message IDs to process: {len(specific_message_ids)} messages")
        
        # Initialize processors
        gmail_processor = GmailProcessor()
        s3_uploader = S3Uploader()
        webhook_trigger = WebhookTrigger()
        
        # Get messages - either specific ones or search by sender
        logger.info("📥 Fetching message list...")
        fetch_start = time.time()
        
        if process_mode == 'specific_messages' and specific_message_ids:
            # Process only the specific message IDs provided
            messages = [{'id': msg_id} for msg_id in specific_message_ids]
            logger.info(f"✅ Using {len(messages)} specific message IDs from history checker")
        else:
            # Default behavior - search for messages from sender
            messages = gmail_processor.get_messages_from_sender(user_email, sender_email, max_results)
            logger.info(f"🔍 Searched for messages from {sender_email}")
        
        fetch_time = time.time() - fetch_start
        logger.info(f"✓ Got {len(messages)} messages to process in {fetch_time:.2f}s")
        
        if not messages:
            logger.info("No messages found from sender")
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'message': 'No messages found from sender',
                    'processed_files': 0
                })
            }
        
        # CONCURRENT PROCESSING - Process messages in parallel
        logger.info(f"⚡ Starting concurrent processing with {MAX_WORKERS} workers...")
        processing_start = time.time()
        
        all_processed_files = []
        processed_counter = Counter()
        
        max_files_per_run = 200
        messages_to_process = messages[:max_files_per_run] if len(messages) > max_files_per_run else messages
        
        # Use ThreadPoolExecutor for concurrent processing
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # Submit all tasks
            future_to_message = {
                executor.submit(
                    process_single_message, 
                    message, 
                    user_email, 
                    sender_email, 
                    gmail_processor, 
                    s3_uploader,
                    processed_counter
                ): message 
                for message in messages_to_process
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_message):
                try:
                    files = future.result()
                    all_processed_files.extend(files)
                except Exception as e:
                    logger.error(f"Error in concurrent processing: {str(e)}")
        
        processing_time = time.time() - processing_start
        total_time = time.time() - start_time
        
        # Count new vs existing files
        new_files = [f for f in all_processed_files if f.get('status') == 'uploaded']
        existing_files = [f for f in all_processed_files if f.get('status') == 'skipped_duplicate']
        
        logger.info("=" * 80)
        logger.info(f"✅ Processing complete!")
        logger.info(f"   Messages fetched: {len(messages)}")
        logger.info(f"   Files found: {len(all_processed_files)}")
        logger.info(f"   📁 New files uploaded: {len(new_files)}")
        logger.info(f"   🔄 Existing files skipped: {len(existing_files)}")
        logger.info(f"   Fetch time: {fetch_time:.2f}s")
        logger.info(f"   Processing time: {processing_time:.2f}s")
        logger.info(f"   Total time: {total_time:.2f}s")
        logger.info(f"   Speed improvement: {(len(messages) / total_time):.1f} messages/second")
        logger.info("=" * 80)
        
        # Trigger batch processing if NEW files were processed
        new_files_only = [f for f in all_processed_files if f.get('status') == 'uploaded']
        if new_files_only:
            try:
                lambda_client = boto3.client('lambda')
                batch_payload = {
                    "body": json.dumps({
                        "files": [file["s3_key"] for file in new_files_only],
                        "businessEmail": user_email,
                        "trigger_source": trigger_source  # Pass trigger_source to batch processor
                    })
                }
                
                batch_processor_name = os.environ.get('BATCH_PROCESSOR_LAMBDA')
                if batch_processor_name:
                    response = lambda_client.invoke(
                        FunctionName=batch_processor_name,
                        InvocationType='Event',
                        Payload=json.dumps(batch_payload)
                    )
                    logger.info(f"📤 Batch processing triggered for {len(new_files_only)} NEW files with trigger_source={trigger_source}")
                else:
                    logger.warning("⚠️  BATCH_PROCESSOR_LAMBDA environment variable not set")
            except Exception as e:
                logger.error(f"Failed to trigger batch processing: {str(e)}")
        else:
            logger.info("🔄 No new files to process - all files were duplicates")
        
        # Note: N8N webhook notification is handled by the insights function
        # No need to trigger webhook from here
        
        # Return final results
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Excel file processing completed',
                'user_email': user_email,
                'sender_email': sender_email,
                'process_mode': process_mode,
                'trigger_source': trigger_source,
                'total_files_found': len(all_processed_files),
                'new_files_uploaded': len(new_files_only),
                'existing_files_skipped': len(all_processed_files) - len(new_files_only),
                'files': all_processed_files,
                'total_messages_checked': len(messages),
                'performance': {
                    'fetch_time_seconds': round(fetch_time, 2),
                    'processing_time_seconds': round(processing_time, 2),
                    'total_time_seconds': round(total_time, 2),
                    'messages_per_second': round(len(messages) / total_time, 1)
                }
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
