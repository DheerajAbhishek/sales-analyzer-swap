# Gmail Monitoring System - Code Guide

## 📚 Complete Technical Documentation for Troubleshooting

This guide explains every component of the Gmail monitoring system, how they work together, and how to debug issues.

---

## 🎯 System Overview

**Goal**: Automatically process Excel attachments from Swiggy/Zomato emails in real-time.

**Flow**:
```
Email Arrives → Pub/Sub → Handler → History Checker → Processor → Batch → Insights → Webhook
```

**Key Concepts**:
- **Watch Subscription**: Gmail sends notifications when emails arrive (expires every 7 days)
- **History ID**: Incremental counter that tracks mailbox changes
- **Async Invocation**: Lambdas trigger each other without waiting for completion
- **Duplicate Detection**: File hashes and order IDs prevent reprocessing

---

## 📂 File-by-File Code Explanation

### 1. **gmail-watch-subscribe.py** - Initial Setup

**When it runs**: Manually called when user connects Gmail OR every 6 days for renewal

**What it does**:
1. Gets user's Gmail OAuth tokens from DynamoDB
2. Calls Gmail API `users().watch()` to subscribe to INBOX changes
3. Stores `historyId` and `expiration` timestamp in DynamoDB

**Code Breakdown**:

```python
# Line 53-55: Get stored OAuth tokens
response = tokens_table.get_item(Key={'user_email': user_email})
token_data = response['Item']

# Lines 64-68: Create Google API credentials
credentials = Credentials(
    token=token_data['access_token'],
    refresh_token=token_data['refresh_token'],
    token_uri='https://oauth2.googleapis.com/token',
    client_id=os.environ.get('GOOGLE_CLIENT_ID'),
    client_secret=os.environ.get('GOOGLE_CLIENT_SECRET')
)

# Lines 74-77: Subscribe to Gmail push notifications
request_body = {
    'topicName': PUBSUB_TOPIC,  # Google Cloud Pub/Sub topic
    'labelIds': ['INBOX'],       # Only watch INBOX (not Sent, Drafts, etc.)
    'labelFilterAction': 'include'
}
watch_response = service.users().watch(userId='me', body=request_body).execute()

# Lines 86-93: Store watch info in DynamoDB for later use
tokens_table.update_item(
    Key={'user_email': user_email},
    UpdateExpression='SET watch_history_id = :hid, watch_expiration = :exp, watch_updated_at = :updated',
    ExpressionAttributeValues={
        ':hid': watch_response['historyId'],      # Current mailbox state
        ':exp': int(watch_response['expiration']), # ~7 days from now (milliseconds)
        ':updated': int(datetime.now().timestamp())
    }
)
```

**Returns**:
```json
{
  "success": true,
  "historyId": "2047873",
  "expiration": "1764165438918"  // Unix timestamp in milliseconds
}
```

**Troubleshooting**:
- ❌ **"No Gmail tokens found"**: User hasn't completed OAuth flow
- ❌ **Gmail API error 400**: Invalid Pub/Sub topic or missing permissions
- ❌ **Gmail API error 403**: OAuth scopes missing `gmail.readonly` or `gmail.modify`
- ⚠️ **Expiration < 7 days**: Watch subscription created incorrectly

---

### 2. **gmail-pubsub-handler.py** - First Responder

**When it runs**: Automatically triggered by Google Pub/Sub (within seconds of email arrival)

**What it does**:
1. Receives and decodes Pub/Sub notification
2. Extracts `emailAddress` and `historyId`
3. Compares with last processed `historyId` in DynamoDB
4. If newer → triggers `gmail-history-checker` Lambda
5. Updates DynamoDB with new `historyId`

**Code Breakdown**:

```python
# Lines 47-54: Parse API Gateway request
if 'body' in event:
    body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
else:
    body = event

message = body.get('message', {})

# Lines 61-65: Decode base64 Pub/Sub data
encoded_data = message.get('data', '')  # Base64 encoded string
decoded_data = base64.b64decode(encoded_data).decode('utf-8')
notification_data = json.loads(decoded_data)
# Result: {"emailAddress": "user@example.com", "historyId": 123456}

# Lines 74-79: Extract user and history ID
user_email = notification_data.get('emailAddress')  # Gmail account that received email
history_id = notification_data.get('historyId')     // New state of mailbox

# Lines 96-107: Get last processed history ID from DynamoDB
response = tokens_table.get_item(Key={'user_email': user_email})
token_data = response['Item']
last_history_id = token_data.get('watch_history_id', 0)

# Normalize DynamoDB Decimal to int (DynamoDB stores numbers as Decimal type)
if isinstance(last_history_id, Decimal):
    last_history_id = int(last_history_id)

# Lines 115-117: Check if this is actually new (prevents duplicate processing)
if int(history_id) <= int(last_history_id):
    print(f"ℹ️ History ID not newer, skipping")
    return {'statusCode': 200, 'body': json.dumps({'success': True, 'message': 'Already processed'})}

# Lines 128-135: Trigger history checker Lambda asynchronously
checker_payload = {
    'userEmail': str(user_email),
    'historyId': int(history_id),           # New mailbox state
    'lastHistoryId': int(last_history_id),  # Last processed state
    'monitoredSenders': MONITORED_SENDERS   # Only care about these senders
}

lambda_client.invoke(
    FunctionName=HISTORY_CHECKER_LAMBDA,
    InvocationType='Event',  # Async - don't wait for response
    Payload=json.dumps(checker_payload)
)

# Lines 144-149: Update DynamoDB so we don't reprocess this
tokens_table.update_item(
    Key={'user_email': user_email},
    UpdateExpression='SET watch_history_id = :hid, last_notification_at = :time',
    ExpressionAttributeValues={
        ':hid': history_id_int,
        ':time': int(datetime.now().timestamp())
    }
)
```

**Why always return 200?**
- Pub/Sub retries on non-200 responses
- We want to acknowledge receipt even if processing fails
- Actual errors are logged, not returned

**Troubleshooting**:
- ❌ **"No message in event"**: Pub/Sub not configured correctly or manual test missing `message` field
- ❌ **"History ID not newer"**: Duplicate notification (normal), or watch expired and got old notification
- ❌ **"User not found"**: User's Gmail tokens not in DynamoDB
- 🐛 **Check logs**: Look for `📬 Received Pub/Sub notification` to verify it's being triggered

**DynamoDB Fields Updated**:
- `watch_history_id`: Latest processed history ID
- `last_notification_at`: Timestamp of last notification

---

### 3. **gmail-history-checker.py** - Detective

**When it runs**: Triggered by `gmail-pubsub-handler` when new email detected

**What it does**:
1. Calls Gmail History API to get list of changes
2. Extracts message IDs that were added
3. Checks sender for each message
4. If sender matches monitored list → triggers `gmail-processor` with specific message IDs

**Code Breakdown**:

```python
# Lines 36-91: Get valid access token (refreshes if expired)
def get_valid_access_token(user_email, refresh_token):
    response = tokens_table.get_item(Key={'user_email': user_email})
    token_data = response['Item']
    current_time = int(datetime.now().timestamp())
    
    # Check if token expired
    if current_time >= token_data.get('expires_at', 0):
        # Refresh using OAuth refresh token
        secrets_client = boto3.client('secretsmanager')
        secret_response = secrets_client.get_secret_value(SecretId='google-oauth-credentials')
        oauth_creds = json.loads(secret_response['SecretString'])
        
        refresh_data = {
            'client_id': oauth_creds['client_id'],
            'client_secret': oauth_creds['client_secret'],
            'refresh_token': refresh_token,
            'grant_type': 'refresh_token'
        }
        
        response = requests.post('https://oauth2.googleapis.com/token', data=refresh_data)
        new_tokens = response.json()
        
        # Update DynamoDB with new access token
        tokens_table.update_item(
            Key={'user_email': user_email},
            UpdateExpression='SET access_token = :token, expires_at = :exp',
            ExpressionAttributeValues={
                ':token': new_tokens['access_token'],
                ':exp': current_time + new_tokens.get('expires_in', 3600)
            }
        )
        return new_tokens['access_token']
    
    return token_data['access_token']

# Lines 96-124: Check Gmail History API for new messages
def check_history_for_new_emails(user_email, history_id, last_history_id, access_token):
    headers = {'Authorization': f'Bearer {access_token}'}
    
    # Call Gmail History API
    url = f'{GMAIL_API_BASE}/users/me/history'
    params = {
        'startHistoryId': last_history_id,  # Start from last processed state
        'historyTypes': 'messageAdded',     // Only care about new messages (not deleted, labeled, etc.)
        'maxResults': 100                   # Max Gmail allows per request
    }
    
    response = requests.get(url, headers=headers, params=params)
    
    if response.status_code == 200:
        data = response.json()
        history = data.get('history', [])
        
        # Extract message IDs from history records
        new_message_ids = []
        for record in history:
            messages_added = record.get('messagesAdded', [])
            for msg in messages_added:
                message_id = msg.get('message', {}).get('id')
                if message_id:
                    new_message_ids.append(message_id)
        
        return new_message_ids
    elif response.status_code == 404:
        # History ID too old (Gmail only keeps ~1 month of history)
        logger.warning(f"History ID {last_history_id} not found, might be too old")
        return []

# Lines 145-157: Get sender email from message
def get_message_sender(user_email, message_id, access_token):
    headers = {'Authorization': f'Bearer {access_token}'}
    url = f'{GMAIL_API_BASE}/users/me/messages/{message_id}'
    params = {
        'format': 'metadata',           # Only get headers, not full message
        'metadataHeaders': ['From']     # Only need From header
    }
    
    response = requests.get(url, headers=headers, params=params)
    message_data = response.json()
    headers_list = message_data.get('payload', {}).get('headers', [])
    
    for header in headers_list:
        if header['name'].lower() == 'from':
            from_value = header['value']  # "John Doe <payments@swiggy.in>"
            
            # Extract email from "Name <email>" format
            if '<' in from_value and '>' in from_value:
                email = from_value.split('<')[1].split('>')[0].strip()
            else:
                email = from_value.strip()
            
            return email.lower()

# Lines 210-232: Main logic - check messages and filter by sender
new_message_ids = check_history_for_new_emails(user_email, history_id, last_history_id, access_token)

# Track which senders have new emails (and which specific messages)
senders_with_new_emails = {}

for message_id in new_message_ids:
    sender = get_message_sender(user_email, message_id, access_token)
    
    # Check if sender is in monitored list
    if sender and sender in [s.lower() for s in monitored_senders]:
        if sender not in senders_with_new_emails:
            senders_with_new_emails[sender] = []
        
        senders_with_new_emails[sender].append(message_id)
        logger.info(f"✉️ Found new email from monitored sender: {sender}")

# Lines 246-262: Trigger processor for each sender with their specific messages
for sender, message_ids in senders_with_new_emails.items():
    processor_payload = {
        'body': json.dumps({
            'user_email': user_email,
            'sender_email': sender,
            'specific_message_ids': message_ids,      # Only process these specific messages
            'trigger_source': 'history_checker',       # Mark as real-time (not manual upload)
            'process_mode': 'specific_messages'        # Use IDs, don't search
        })
    }
    
    lambda_client.invoke(
        FunctionName=GMAIL_PROCESSOR_LAMBDA,
        InvocationType='Event',  # Async
        Payload=json.dumps(processor_payload)
    )
```

**Why check sender for each message?**
- History API only tells us message IDs, not senders
- We need to filter out non-Swiggy/Zomato emails
- Prevents processing spam/promotional emails

**Troubleshooting**:
- ❌ **"History ID not found"**: Last history ID too old (>30 days), need to reset
- ❌ **"No tokens found"**: DynamoDB missing user entry
- ❌ **"Token refresh failed"**: Invalid refresh token or OAuth credentials
- ⚠️ **"No new messages"**: Normal if email didn't arrive or was deleted
- 🐛 **Check logs**: Look for `Found X new messages` and `Found new email from monitored sender`

**API Rate Limits**:
- Gmail History API: 250 requests/user/second
- Gmail Messages API: 250 requests/user/second

---

### 4. **gmail-processor** - File Handler

**When it runs**: Triggered by `gmail-history-checker` with specific message IDs

**What it does**:
1. Downloads Excel attachments from Gmail messages
2. Checks for duplicates using MD5 hash
3. Uploads new files to S3
4. Triggers `sales-dashboard-batch-process` Lambda

**Code Breakdown**:

**Token Manager Class** (Lines 79-186):
```python
class GmailTokenManager:
    def get_valid_access_token(self, user_email):
        """Same logic as history checker - refresh if expired"""
        tokens = self.get_user_tokens(user_email)
        current_time = int(time.time())
        
        if current_time >= tokens.get('expires_at', 0):
            return self.refresh_access_token(user_email)
        
        return tokens['access_token']
```

**Gmail API Operations** (Lines 188-330):
```python
class GmailProcessor:
    def get_messages_from_sender(self, user_email, sender_email, max_results=200):
        """Search for messages from specific sender (fallback if no specific IDs)"""
        access_token = self.token_manager.get_valid_access_token(user_email)
        headers = {'Authorization': f'Bearer {access_token}'}
        
        # Search query
        query = f'from:{sender_email} has:attachment'
        params = {'q': query, 'maxResults': min(max_results, 500)}
        
        url = f'{GMAIL_API_BASE}/users/me/messages'
        response = requests.get(url, headers=headers, params=params)
        
        messages = response.json().get('messages', [])
        return messages
    
    def get_message_details(self, user_email, message_id):
        """Get full message with attachment info"""
        url = f'{GMAIL_API_BASE}/users/me/messages/{message_id}'
        response = requests.get(url, headers=headers)
        return response.json()
    
    def extract_attachments(self, user_email, message_data):
        """Find Excel attachments in message parts"""
        attachments = []
        parts = message_data.get('payload', {}).get('parts', [])
        
        def process_part(part):
            filename = part.get('filename', '')
            mime_type = part.get('mimeType', '')
            
            # Check if it's an Excel file
            if filename and part.get('body', {}).get('attachmentId'):
                if is_excel_file(mime_type, filename):
                    attachments.append({
                        'filename': filename,
                        'mime_type': mime_type,
                        'attachment_id': part['body']['attachmentId'],
                        'size': part['body'].get('size', 0)
                    })
            
            # Recursively check nested parts (multipart messages)
            if 'parts' in part:
                for sub_part in part['parts']:
                    process_part(sub_part)
        
        for part in parts:
            process_part(part)
        
        return attachments
    
    def download_attachment(self, user_email, message_id, attachment_id):
        """Download actual attachment data"""
        url = f'{GMAIL_API_BASE}/users/me/messages/{message_id}/attachments/{attachment_id}'
        response = requests.get(url, headers=headers)
        
        attachment_data = response.json()
        # Gmail returns base64url-encoded data
        file_data = base64.urlsafe_b64decode(attachment_data['data'])
        return file_data
```

**S3 Upload with Duplicate Detection** (Lines 332-403):
```python
class S3Uploader:
    def __init__(self):
        self.processed_files_cache = set()  # In-memory cache for current run
    
    def upload_attachment(self, user_email, sender_email, file_data, filename, message_id, mime_type):
        """Upload with duplicate detection"""
        
        # Calculate MD5 hash (first 8 chars for brevity)
        file_hash = hashlib.md5(file_data).hexdigest()[:8]
        
        # Sanitize filename
        safe_filename = filename.replace(' ', '_').replace('/', '_').replace('\\', '_')
        
        # Create S3 key
        formatted_user = format_email_for_s3(user_email)  # admin@swapnow.in → admin_at_swapnow_dot_in
        formatted_sender = format_email_for_s3(sender_email)
        current_date = datetime.now().strftime('%Y-%m-%d')
        
        s3_key = f"users/{formatted_user}/uploads/email-attachments/{formatted_sender}/{current_date}/{file_hash}_{safe_filename}"
        
        # Check in-memory cache (prevents re-uploading in same run)
        file_signature = f"{file_hash}_{safe_filename}"
        if file_signature in self.processed_files_cache:
            logger.info(f"⚠️ Skipping duplicate file in current run: {filename}")
            return None
        
        # Check if file exists in S3 (prevents re-uploading from previous runs)
        if self.check_file_exists(s3_key):
            logger.info(f"⚠️ File already exists in S3, skipping: {filename}")
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
        
        self.processed_files_cache.add(file_signature)
        logger.info(f"✅ Uploaded NEW file: {filename}")
        return s3_key
```

**Main Processing Logic** (Lines 490-627):
```python
def lambda_handler(event, context):
    # Parse input
    body = json.loads(event.get('body', '{}'))
    user_email = body.get('user_email')
    sender_email = body.get('sender_email')
    specific_message_ids = body.get('specific_message_ids')
    process_mode = body.get('process_mode', 'search_by_sender')
    trigger_source = body.get('trigger_source', 'manual')
    
    # Get messages
    if process_mode == 'specific_messages' and specific_message_ids:
        # History checker provided specific message IDs
        messages = [{'id': msg_id} for msg_id in specific_message_ids]
    else:
        # Fallback: search for all messages from sender
        messages = gmail_processor.get_messages_from_sender(user_email, sender_email, max_results)
    
    # Process each message concurrently (using ThreadPoolExecutor)
    all_processed_files = []
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = []
        for message in messages[:200]:  # Limit to 200 files per run
            future = executor.submit(
                process_single_message,
                message, user_email, sender_email,
                gmail_processor, s3_uploader, processed_counter
            )
            futures.append(future)
        
        # Collect results
        for future in as_completed(futures):
            files = future.result()
            all_processed_files.extend(files)
    
    # Count new vs existing
    new_files = [f for f in all_processed_files if f.get('status') == 'uploaded']
    
    # Trigger batch processing for NEW files only
    if new_files:
        batch_payload = {
            "body": json.dumps({
                "files": [file["s3_key"] for file in new_files],
                "businessEmail": user_email,
                "trigger_source": trigger_source  # Pass to insights Lambda
            })
        }
        
        lambda_client.invoke(
            FunctionName='sales-dashboard-batch-process',
            InvocationType='Event',
            Payload=json.dumps(batch_payload)
        )
        
        logger.info(f"📤 Batch processing triggered for {len(new_files)} NEW files")
```

**Concurrent Processing Function** (Lines 405-450):
```python
def process_single_message(message, user_email, sender_email, gmail_processor, s3_uploader, processed_counter):
    """Process one message (thread-safe)"""
    processed_files = []
    message_id = message['id']
    
    # Get message details
    message_data = gmail_processor.get_message_details(user_email, message_id)
    
    # Extract attachments
    attachments = gmail_processor.extract_attachments(user_email, message_data)
    
    # Download and upload each attachment
    for attachment in attachments:
        attachment_data = gmail_processor.download_attachment(
            user_email, message_id, attachment['attachment_id']
        )
        
        if attachment_data:
            s3_key = s3_uploader.upload_attachment(
                user_email, sender_email, attachment_data,
                attachment['filename'], message_id, attachment['mime_type']
            )
            
            if s3_key:
                processed_files.append({
                    'filename': attachment['filename'],
                    's3_key': s3_key,
                    'message_id': message_id,
                    'status': 'uploaded' if s3_key else 'skipped_duplicate'
                })
                
                # Thread-safe counter increment
                count = processed_counter.increment()
                if count % 10 == 0:
                    logger.info(f"✓ Processed {count} files so far...")
    
    return processed_files
```

**Troubleshooting**:
- ❌ **"No valid access token"**: Token refresh failed
- ❌ **"Failed to fetch messages"**: Gmail API error (check quotas)
- ❌ **"Failed to download attachment"**: Attachment ID invalid or expired
- ⚠️ **"Skipping duplicate file"**: Normal - file already processed
- ⚠️ **"Error checking file existence: 403 Forbidden"**: S3 permissions issue (Lambda can upload but not HeadObject)
- 🐛 **Check logs**: Look for `✅ Uploaded NEW file` vs `🔄 Existing files skipped`

**Performance**:
- Uses ThreadPoolExecutor with 10 workers (configurable via `MAX_WORKERS` env var)
- Processes ~6-7 messages/second with attachments
- Limits to 200 files per invocation to prevent timeouts

---

### 5. **sales-dashboard-batch-process** - Orchestrator

**When it runs**: Triggered by `gmail-processor` with list of S3 file keys

**What it does**:
1. Receives array of S3 file paths
2. Creates a job ID for tracking
3. Invokes `sales-dashboard-insights` Lambda for each file (async)
4. Updates DynamoDB job status

**Code Structure** (simplified):
```python
def lambda_handler(event, context):
    body = json.loads(event.get('body', '{}'))
    files = body.get('files', [])  # List of S3 keys
    business_email = body.get('businessEmail')
    trigger_source = body.get('trigger_source', 'manual')
    
    # Create job ID
    job_id = str(uuid.uuid4())
    
    # Store job in DynamoDB
    jobs_table.put_item(
        Item={
            'jobId': job_id,
            'status': 'PROCESSING',
            'totalFiles': len(files),
            'processedCount': 0,
            'createdAt': int(time.time())
        }
    )
    
    # Invoke insights Lambda for each file
    for file_key in files:
        insights_payload = {
            'queryStringParameters': {
                'filename': file_key,
                'businessEmail': business_email,
                'trigger_source': trigger_source
            },
            'requestContext': {
                'jobId': job_id
            }
        }
        
        lambda_client.invoke(
            FunctionName='sales-dashboard-insights',
            InvocationType='Event',
            Payload=json.dumps(insights_payload)
        )
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'jobId': job_id,
            'filesQueued': len(files)
        })
    }
```

**Troubleshooting**:
- ❌ **"Missing 'files' in request"**: Processor didn't send file list
- ⚠️ **Job stuck at PROCESSING**: One or more insights invocations failed
- 🐛 **Check DynamoDB**: Look at `jobs` table for status

---

### 6. **sales-dashboard-insights** - Data Extractor

**When it runs**: Triggered by batch processor for each file

**What it does**:
1. Downloads Excel file from S3
2. Detects format (Zomato/Swiggy/Takeaway)
3. Extracts insights per day
4. Saves to S3 as daily JSON files
5. Triggers webhook if `trigger_source='history_checker'`

**Key Code Sections**:

**File Download & Format Detection** (Lines 290-375):
```python
# Download from S3
tmp_path = f"/tmp/{os.path.basename(filename_from_event)}"
s3.download_file(BUCKET, filename_from_event, tmp_path)

# Calculate file hash for duplicate detection
file_hash = get_file_hash(tmp_path)

# Try different formats
# Zomato: Sheet="Order Level", skip 6 header rows
temp_df = pd.read_excel(tmp_path, engine="openpyxl", skiprows=6, sheet_name="Order Level")
if detect_format(temp_df.columns) == "zomato":
    df, file_format = temp_df, "zomato"

# Swiggy: Sheet="Order Level", skip 2 header rows
temp_df = pd.read_excel(tmp_path, engine="openpyxl", skiprows=2, sheet_name="Order Level")
if detect_format(temp_df.columns) == "swiggy":
    df, file_format = temp_df, "swiggy"

# Takeaway: Single sheet, skip 1 row
temp_df = pd.read_excel(tmp_path, engine="openpyxl", skiprows=1)
if detect_format(temp_df.columns) == "takeaway":
    df, file_format = temp_df, "takeaway"
```

**Column Detection** (Lines 450-490):
```python
# Zomato patterns
patterns = {
    "order_id": r"Order ID",
    "order_date": r"Order Date",
    "subtotal": r"Subtotal.*\(items total\)",
    "packaging_charge": r"Packaging charge",
    "payout": r"Order level Payout.*",
    "discount_promo": r"Restaurant discount.*Promo.*",
    "gst_on_order": r"Total GST collected from customers",
    # ... more patterns
}

# Use regex to find matching column names
found_cols = {
    key: next((c for c in df.columns if re.search(pattern, c, re.I)), None)
    for key, pattern in patterns.items()
}
```

**Restaurant ID Detection** (Lines 500-530):
```python
# Zomato: Get from "Res. ID" column
if file_format == "zomato":
    res_id_col = found_cols.get("res_id")
    restaurant_id = str(int(df[res_id_col].dropna().iloc[0]))

# Swiggy: Parse from Summary sheet
elif file_format == "swiggy":
    summary_df = pd.read_excel(tmp_path, sheet_name="Summary", header=None, nrows=15)
    for row in summary_df.itertuples():
        for cell in row:
            if "Rest. ID" in str(cell):
                match = re.search(r"Rest\. ID\s*-\s*(\d+)", cell)
                restaurant_id = match.group(1)

# Takeaway: Use branch name
elif file_format == "takeaway":
    restaurant_id = str(df[found_cols["branch_name"]].iloc[0])
```

**Per-Day Processing with Duplicate Detection** (Lines 620-900):
```python
# Group by date
for report_date, day_df in df.groupby(date_col):
    # Build S3 key for this date's insights
    insights_key = f"users/{user_folder}/daily-insights/{restaurant_id}/{report_date.strftime('%Y-%m-%d')}.json"
    
    # Check if already processed
    try:
        s3_object = s3.get_object(Bucket=BUCKET, Key=insights_key)
        existing_insight = json.loads(s3_object["Body"].read())
    except ClientError:
        existing_insight = {}
    
    # Get already processed file hashes and order IDs
    processed_hashes = existing_insight.get("processedFileHashes", [])
    processed_order_ids = set(existing_insight.get("processedOrderIds", []))
    
    # Skip if this file already processed for this date
    if file_hash in processed_hashes:
        logger.info(f"📝 File already processed for {report_date}, skipping")
        continue
    
    # Filter out already processed orders
    order_id_col = found_cols.get("order_id")
    day_df["_order_id_str"] = day_df[order_id_col].astype(str).str.strip()
    new_orders_df = day_df[~day_df["_order_id_str"].isin(processed_order_ids)]
    
    if len(new_orders_df) == 0:
        logger.info(f"📝 All orders already processed for {report_date}")
        continue
    
    # Calculate metrics for NEW orders only
    gross_sale = calculate_gross_sale(new_orders_df, file_format, found_cols)
    gst = new_orders_df[found_cols["gst_on_order"]].sum()
    discounts = calculate_discounts(new_orders_df, file_format, found_cols)
    # ... more calculations
    
    # Accumulate with existing data
    final_insight = {
        "platform": file_format,
        "restaurantId": restaurant_id,
        "reportDate": report_date.isoformat(),
        "processedOrdersCount": existing_insight.get("processedOrdersCount", 0) + len(new_orders_df),
        "grossSale": existing_insight.get("grossSale", 0) + float(gross_sale),
        "gstOnOrder": existing_insight.get("gstOnOrder", 0) + float(gst),
        "discounts": existing_insight.get("discounts", 0) + float(discounts),
        # ... more fields
        "processedFileHashes": list(set(processed_hashes + [file_hash])),
        "processedOrderIds": list(set(list(processed_order_ids) + new_order_ids))
    }
    
    # Save to S3
    s3.put_object(
        Bucket=BUCKET,
        Key=insights_key,
        Body=json.dumps(final_insight, default=str),
        ContentType="application/json"
    )
```

**Webhook Trigger Logic** (Lines 980-1008):
```python
# Only trigger webhook if:
# 1. Business email provided
# 2. Restaurant ID found
# 3. Latest date tracked
if business_email and restaurant_id and latest_processed_date:
    webhook_insights = {
        "restaurantId": restaurant_id,
        "platform": file_format,
        "latestDate": latest_processed_date,
        "startDate": start_date,
        "endDate": end_date,
        "triggerType": "immediate_after_processing",
        "triggerSource": trigger_source,  # 'history_checker' or 'manual'
        "summary": {
            "totalOrders": total_orders,
            "grossSale": round(total_gross_sale, 2),
            # ... more metrics
        }
    }
    
    trigger_insights_webhook(business_email, restaurant_id, webhook_insights)

# Webhook function (Lines 80-174)
def trigger_insights_webhook(business_email, restaurant_id, insights_data):
    trigger_source = insights_data.get("triggerSource", "manual")
    
    # Only send email for real-time processing
    if trigger_source == "manual":
        logger.info("⏭️ Skipping email notification for manual/initial processing")
        return
    elif trigger_source == "history_checker":
        logger.info("📧 Sending email notification for real-time processing")
    else:
        logger.info(f"⚠️ Unknown trigger_source: {trigger_source}, treating as manual")
        return
    
    if not N8N_WEBHOOK_URL:
        logger.info("⚠️ N8N_WEBHOOK_URL not configured")
        return
    
    # Format message for n8n
    message = f"{insights_data['platform']} report for {insights_data['restaurantId']} from {insights_data['startDate']} to {insights_data['endDate']}"
    
    payload = {
        "email": business_email,
        "message": message,
        "dateRange": {
            "startDate": insights_data["startDate"],
            "endDate": insights_data["endDate"]
        },
        "summary": insights_data["summary"],
        "insights": insights_data
    }
    
    # Try POST, fallback to GET
    response = requests.post(N8N_WEBHOOK_URL, json=payload, timeout=10)
    
    if response.status_code == 404:
        # Fallback to GET with query parameters
        response = requests.get(N8N_WEBHOOK_URL, params=query_params, timeout=10)
```

**Troubleshooting**:
- ❌ **"Could not determine file format"**: Excel structure doesn't match known patterns
- ❌ **"No date column found"**: Column name regex doesn't match
- ⚠️ **"File already processed"**: Duplicate detection working (normal)
- ⚠️ **"All orders already processed"**: Same file uploaded multiple times
- ⚠️ **"Skipping email notification for manual"**: Correct - only real-time triggers email
- 🐛 **Check S3**: Look in `users/{email}/daily-insights/{restaurant_id}/` for JSON files
- 🐛 **Check logs**: Look for `🪣 Writing daily insight to S3`

**DynamoDB Job Updates**:
- Each successful processing increments `processedCount`
- When `processedCount == totalFiles`, job status → `COMPLETED`

---

## 🔄 Complete End-to-End Flow Example

**Scenario**: User receives Swiggy payment email

```
1. Email arrives at admin@swapnow.in Gmail inbox
   └─ Contains: invoice/Annexure_492064_19112025.xlsx

2. Gmail sends Pub/Sub notification within 2-5 seconds
   └─ Data: {"emailAddress": "admin@swapnow.in", "historyId": "2047900"}

3. google-pubsub-handler Lambda receives notification
   └─ Decodes: historyId = 2047900
   └─ Checks DynamoDB: last_history_id = 2047873
   └─ Comparison: 2047900 > 2047873 ✅ (new)
   └─ Triggers: gmail-history-checker
   └─ Updates DynamoDB: watch_history_id = 2047900

4. gmail-history-checker Lambda executes
   └─ Calls Gmail History API: startHistoryId=2047873
   └─ Returns: [message_id: "18c5d4f8a1b2c3d4"]
   └─ Gets sender: payments@swiggy.in
   └─ Matches monitored list ✅
   └─ Triggers: gmail-processor
      └─ Payload: {
            user_email: "admin@swapnow.in",
            sender_email: "payments@swiggy.in",
            specific_message_ids: ["18c5d4f8a1b2c3d4"],
            trigger_source: "history_checker",
            process_mode: "specific_messages"
          }

5. gmail-processor Lambda executes
   └─ Gets message details for "18c5d4f8a1b2c3d4"
   └─ Finds attachment: invoice/Annexure_492064_19112025.xlsx
   └─ Downloads attachment (base64 decode)
   └─ Calculates hash: ab91daec94779710470464de06193fca
   └─ Checks S3: File doesn't exist ✅
   └─ Uploads to: users/admin_at_swapnow_dot_in/uploads/email-attachments/payments_at_swiggy_dot_in/2025-11-19/ab91daec_invoice_Annexure_492064_19112025.xlsx
   └─ Triggers: sales-dashboard-batch-process
      └─ Payload: {
            files: ["users/admin_at_swapnow_dot_in/uploads/.../ab91daec_invoice_Annexure_492064_19112025.xlsx"],
            businessEmail: "admin@swapnow.in",
            trigger_source: "history_checker"
          }

6. sales-dashboard-batch-process Lambda executes
   └─ Creates job_id: "54558626-d2f6-4bc5-a64c-b7bef87bfb44"
   └─ DynamoDB: {jobId: "54558626...", status: "PROCESSING", totalFiles: 1, processedCount: 0}
   └─ Triggers: sales-dashboard-insights
      └─ Payload: {
            queryStringParameters: {
              filename: "users/admin_at_swapnow_dot_in/uploads/.../ab91daec_invoice_Annexure_492064_19112025.xlsx",
              businessEmail: "admin@swapnow.in",
              trigger_source: "history_checker"
            },
            requestContext: {jobId: "54558626..."}
          }

7. sales-dashboard-insights Lambda executes
   └─ Downloads file from S3
   └─ Detects format: swiggy
   └─ Finds restaurant_id: 492064
   └─ Parses dates: 2025-11-09 to 2025-11-15 (7 days of data)
   └─ For each day:
      ├─ Check S3: users/admin_at_swapnow_dot_in/daily-insights/492064/2025-11-09.json
      ├─ Exists? Read existing data
      ├─ Check file hash in processedFileHashes: Not found ✅
      ├─ Check order IDs in processedOrderIds: Filter out duplicates
      ├─ Calculate metrics for NEW orders only
      ├─ Accumulate with existing data
      └─ Save JSON to S3
   └─ Triggers webhook:
      └─ Check trigger_source: "history_checker" ✅
      └─ POST to N8N_WEBHOOK_URL
      └─ Payload: {
            email: "admin@swapnow.in",
            message: "swiggy report for 492064 from 2025-11-09 to 2025-11-15",
            summary: {totalOrders: 114, grossSale: 45000, ...}
          }
   └─ Updates DynamoDB job: processedCount = 1
   └─ Job complete: status = "COMPLETED"

8. N8N Workflow receives webhook
   └─ Sends email notification to admin@swapnow.in
   └─ Subject: "New Swiggy Report Processed"
   └─ Body: "114 orders, ₹45,000 gross sale from Nov 9-15"

Total time: ~10-15 seconds from email arrival to notification
```

---

## 🛠️ Troubleshooting Guide

### Issue: Not receiving notifications

**Check 1: Watch subscription status**
```powershell
aws dynamodb get-item --table-name gmail_tokens --key '{"user_email":{"S":"admin@swapnow.in"}}' --region ap-south-1 --output json | Select-String -Pattern "watch_expiration|watch_history_id"
```
- If `watch_expiration` < current timestamp → Subscription expired, renew it
- If `watch_history_id` = 0 → Never subscribed, run `gmail-watch-subscribe`

**Check 2: Pub/Sub handler logs**
```powershell
aws logs filter-log-events --log-group-name /aws/lambda/gmail-pubsub-handler --start-time $([int](([DateTime]::UtcNow.AddHours(-1) - [DateTime]'1970-01-01').TotalMilliseconds)) --region ap-south-1 --max-items 20
```
- Look for: `📬 Received Pub/Sub notification`
- If missing → Pub/Sub not configured or watch expired
- If present but `ℹ️ History ID not newer` → Duplicate notification (normal)

**Check 3: History checker logs**
```powershell
aws logs filter-log-events --log-group-name /aws/lambda/gmail-history-checker --start-time $([int](([DateTime]::UtcNow.AddHours(-1) - [DateTime]'1970-01-01').TotalMilliseconds)) --region ap-south-1 --max-items 20
```
- Look for: `Found X new messages`
- Look for: `✉️ Found new email from monitored sender`
- If missing → No messages or sender not in monitored list

**Check 4: Processor logs**
```powershell
aws logs filter-log-events --log-group-name /aws/lambda/gmail-processor --start-time $([int](([DateTime]::UtcNow.AddHours(-1) - [DateTime]'1970-01-01').TotalMilliseconds)) --region ap-south-1 --max-items 20
```
- Look for: `✅ Uploaded NEW file`
- Look for: `📤 Batch processing triggered`

---

### Issue: Files not processing

**Check 1: S3 files uploaded?**
```powershell
aws s3 ls s3://sale-dashboard-data/users/admin_at_swapnow_dot_in/uploads/email-attachments/payments_at_swiggy_dot_in/ --recursive --region ap-south-1 | Select-Object -Last 10
```

**Check 2: Insights Lambda logs**
```powershell
aws logs filter-log-events --log-group-name /aws/lambda/sales-dashboard-insights --start-time $([int](([DateTime]::UtcNow.AddHours(-1) - [DateTime]'1970-01-01').TotalMilliseconds)) --region ap-south-1 --max-items 50
```
- Look for errors: `Could not determine file format`, `No date column found`
- Look for success: `🪣 Writing daily insight to S3`

**Check 3: Daily insights saved?**
```powershell
aws s3 ls s3://sale-dashboard-data/users/admin_at_swapnow_dot_in/daily-insights/492064/ --region ap-south-1
```

---

### Issue: Webhook not triggering

**Check 1: Trigger source**
```powershell
# Look for this in insights logs
aws logs filter-log-events --log-group-name /aws/lambda/sales-dashboard-insights --start-time $([int](([DateTime]::UtcNow.AddHours(-1) - [DateTime]'1970-01-01').TotalMilliseconds)) --region ap-south-1 --query 'events[*].message' --output text | Select-String -Pattern "trigger_source|Triggering webhook|Skipping email"
```
- If `trigger_source: manual` → Webhook skipped (correct for manual uploads)
- If `trigger_source: history_checker` → Should trigger webhook
- If `⚠️ N8N_WEBHOOK_URL not configured` → Environment variable missing

**Check 2: N8N webhook URL**
```powershell
aws lambda get-function-configuration --function-name sales-dashboard-insights --region ap-south-1 --query 'Environment.Variables.N8N_WEBHOOK_URL'
```

**Check 3: Webhook response**
- Look for: `📡 Webhook response status: 200`
- If 404 → N8N workflow not active or wrong URL
- If 500 → N8N workflow error

---

### Issue: Duplicate files being processed

**Expected behavior**: Files with same hash should be skipped

**Check logs**:
```
⚠️ File already exists in S3, skipping: invoice_Annexure_492064.xlsx
```

**If NOT skipping**:
- Different file hash (file content changed)
- S3 HeadObject permission denied (check IAM)
- Cache not working (check in-memory cache logic)

---

### Issue: Old emails being processed

**Cause**: History ID gap too large (>30 days)

**Solution**:
1. Reset history ID in DynamoDB to current:
```powershell
# Get current history ID
aws lambda invoke --function-name gmail-watch-subscribe --payload '{"userEmail":"admin@swapnow.in"}' --region ap-south-1 response.json
cat response.json
# Extract historyId from response

# Or manually set to 0 to process everything
aws dynamodb update-item --table-name gmail_tokens --key '{"user_email":{"S":"admin@swapnow.in"}}' --update-expression "SET watch_history_id = :val" --expression-attribute-values '{":val":{"N":"0"}}' --region ap-south-1
```

---

## 📊 Key Environment Variables

### gmail-watch-subscribe
- `TOKENS_TABLE`: DynamoDB table with user tokens (default: `gmail_tokens`)
- `PUBSUB_TOPIC`: Google Cloud Pub/Sub topic (format: `projects/{PROJECT_ID}/topics/gmail-notifications`)
- `GOOGLE_CLIENT_ID`: OAuth client ID
- `GOOGLE_CLIENT_SECRET`: OAuth client secret

### gmail-pubsub-handler
- `TOKENS_TABLE`: DynamoDB table (default: `gmail_tokens`)
- `HISTORY_CHECKER_LAMBDA`: Name of history checker Lambda (default: `gmail-history-checker`)

### gmail-history-checker
- `TOKENS_TABLE`: DynamoDB table (default: `gmail_tokens`)
- `GMAIL_PROCESSOR_LAMBDA`: Name of processor Lambda (default: `gmail-processor-optimized`)

### gmail-processor
- `S3_BUCKET_NAME`: S3 bucket for uploads (default: `sale-dashboard-data`)
- `USER_TOKENS_TABLE`: DynamoDB table (default: `user-gmail-tokens`)
- `BATCH_PROCESSOR_LAMBDA`: Name of batch processor Lambda
- `MAX_WORKERS`: Concurrent threads for processing (default: `10`)

### sales-dashboard-insights
- `BUCKET_NAME`: S3 bucket (default: `sale-dashboard-data`)
- `JOBS_TABLE_NAME`: DynamoDB jobs table
- `N8N_WEBHOOK_URL`: Webhook URL for notifications

---

## 📝 DynamoDB Schema

### gmail_tokens / user-gmail-tokens table
```json
{
  "user_email": "admin@swapnow.in",           // Partition key
  "access_token": "ya29.a0AfH6...",           // OAuth access token (expires in 1 hour)
  "refresh_token": "1//0gXXX...",             // OAuth refresh token (never expires)
  "expires_at": 1731234567,                   // Unix timestamp when access_token expires
  "watch_history_id": 2047900,                // Last processed Gmail history ID
  "watch_expiration": 1764165438918,          // Unix timestamp (ms) when watch expires
  "watch_updated_at": 1731234567,             // When watch was last updated
  "last_notification_at": 1731234567,         // When last Pub/Sub notification received
  "updated_at": 1731234567                    // General update timestamp
}
```

### jobs table
```json
{
  "jobId": "54558626-d2f6-4bc5-a64c-b7bef87bfb44",  // Partition key
  "status": "COMPLETED",                             // PROCESSING | COMPLETED | FAILED
  "totalFiles": 5,                                   // Total files in job
  "processedCount": 5,                               // Files processed so far
  "createdAt": 1731234567,                           // Unix timestamp
  "errorDetails": "..."                              // Only if FAILED
}
```

---

## 🔐 Required IAM Permissions

### gmail-pubsub-handler
- `dynamodb:GetItem` on `gmail_tokens` table
- `dynamodb:UpdateItem` on `gmail_tokens` table
- `lambda:InvokeFunction` on `gmail-history-checker`

### gmail-history-checker
- `dynamodb:GetItem` on `gmail_tokens` table
- `dynamodb:UpdateItem` on `gmail_tokens` table
- `secretsmanager:GetSecretValue` on `google-oauth-credentials`
- `lambda:InvokeFunction` on `gmail-processor`

### gmail-processor
- `dynamodb:GetItem` on `user-gmail-tokens` table
- `dynamodb:UpdateItem` on `user-gmail-tokens` table
- `s3:PutObject` on `sale-dashboard-data` bucket
- `s3:HeadObject` on `sale-dashboard-data` bucket (for duplicate detection)
- `lambda:InvokeFunction` on `sales-dashboard-batch-process`

### sales-dashboard-insights
- `s3:GetObject` on `sale-dashboard-data` bucket
- `s3:PutObject` on `sale-dashboard-data` bucket
- `s3:HeadObject` on `sale-dashboard-data` bucket
- `dynamodb:UpdateItem` on jobs table

---

## 🚀 Testing Commands

### Test watch subscription
```powershell
aws lambda invoke --function-name gmail-watch-subscribe --payload '{"userEmail":"admin@swapnow.in"}' --region ap-south-1 response.json
cat response.json
```

### Test processor manually
```powershell
aws lambda invoke --function-name gmail-processor --payload '{\"body\":\"{\\\"user_email\\\":\\\"admin@swapnow.in\\\",\\\"sender_email\\\":\\\"payments@swiggy.in\\\",\\\"max_results\\\":5,\\\"trigger_source\\\":\\\"manual_test\\\"}\"}' --region ap-south-1 test_result.json
cat test_result.json
```

### Check recent logs
```powershell
# Pub/Sub handler
aws logs tail /aws/lambda/gmail-pubsub-handler --since 1h --region ap-south-1

# History checker
aws logs tail /aws/lambda/gmail-history-checker --since 1h --region ap-south-1

# Processor
aws logs tail /aws/lambda/gmail-processor --since 1h --region ap-south-1

# Insights
aws logs tail /aws/lambda/sales-dashboard-insights --since 1h --region ap-south-1
```

---

## 📈 Performance Metrics

**Expected timings**:
- Pub/Sub notification → Handler: <2 seconds
- Handler → History checker: <1 second
- History checker → Processor: <3 seconds (per message check)
- Processor → File upload: <5 seconds (per file)
- Insights extraction: <10 seconds (per file)

**Total end-to-end**: ~15-20 seconds from email arrival to webhook

**Bottlenecks**:
- Gmail API rate limits: 250 requests/user/second
- Lambda concurrency limits: 1000 concurrent executions (account-wide)
- File download/upload: Network speed dependent

---

## 🎓 Key Concepts for Troubleshooting

### History ID
- Incremental counter for mailbox state
- Each email/action increments it
- Gmail only keeps ~30 days of history
- If gap too large → History API returns 404

### Watch Expiration
- Gmail watch subscriptions expire every ~7 days
- Must renew before expiration
- If expired → No more notifications until renewed

### Trigger Source
- `manual`: Manual upload via UI (no email notification)
- `history_checker`: Real-time email processing (sends email notification)
- Determines whether webhook triggers email

### File Hash
- MD5 hash of file content (first 8 characters)
- Used for duplicate detection
- Same file = same hash
- Different hash = different content

### Async Invocation
- `InvocationType='Event'` = fire-and-forget
- Lambda doesn't wait for response
- Prevents timeout cascades
- Check CloudWatch logs for errors

---

This guide should help you understand every component and debug any issues. Keep it handy! 🚀
