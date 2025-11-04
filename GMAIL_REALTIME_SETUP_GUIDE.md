# Gmail Real-Time Email Processing Setup Guide

This guide will help you set up real-time email monitoring using Gmail Push Notifications with Google Cloud Pub/Sub.

## 🎯 Overview

When a user receives an email from Zomato/Swiggy:
1. Gmail sends push notification to Google Cloud Pub/Sub
2. Pub/Sub triggers your AWS Lambda via API Gateway
3. Lambda checks email history for monitored senders
4. Downloads Excel attachments, uploads to S3
5. Processes data and sends report back to user

**Delay: 1-2 minutes from email arrival to report delivery**

---

## 📋 Prerequisites

- Google Cloud Platform account
- AWS Account with API Gateway access
- Gmail API enabled in Google Cloud Console
- OAuth 2.0 credentials already configured

---

## Part 1: Google Cloud Pub/Sub Setup

### Step 1: Create Pub/Sub Topic

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (same one with Gmail API enabled)
3. Navigate to **Pub/Sub** → **Topics**
4. Click **CREATE TOPIC**
5. **Topic ID**: `gmail-notifications`
6. Leave other settings as default
7. Click **CREATE**

**Note the full topic name**: `projects/YOUR_PROJECT_ID/topics/gmail-notifications`

### Step 2: Create Service Account for Pub/Sub

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **CREATE SERVICE ACCOUNT**
3. **Name**: `gmail-pubsub-publisher`
4. **Role**: Select `Pub/Sub Publisher`
5. Click **DONE**
6. Click on the service account → **KEYS** tab
7. **ADD KEY** → **Create new key** → **JSON**
8. Download the JSON key file (keep it secure!)

---

## Part 2: AWS Setup

### Step 1: Create Lambda Functions

Deploy these 4 Lambda functions to AWS:

#### 1. **gmail-watch-subscribe** (Python 3.9+)
- **File**: `lambda/gmail-watch-subscribe.py`
- **Handler**: `lambda_function.lambda_handler`
- **Timeout**: 30 seconds
- **Memory**: 256 MB
- **Environment Variables**:
  ```
  TOKENS_TABLE=gmail_tokens
  PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications
  GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=your-client-secret
  ```
- **IAM Permissions**: DynamoDB read/write on `gmail_tokens` table
- **Layers**: Add Google API Python client layer

#### 2. **gmail-pubsub-handler** (Python 3.9+)
- **File**: `lambda/gmail-pubsub-handler.py`
- **Handler**: `lambda_function.lambda_handler`
- **Timeout**: 30 seconds
- **Memory**: 256 MB
- **Environment Variables**:
  ```
  TOKENS_TABLE=gmail_tokens
  HISTORY_CHECKER_LAMBDA=gmail-history-checker
  ```
- **IAM Permissions**: 
  - DynamoDB read/write on `gmail_tokens`
  - Lambda invoke permission for `gmail-history-checker`

#### 3. **gmail-history-checker** (Python 3.9+)
- **File**: `lambda/gmail-history-checker.py`
- **Handler**: `lambda_function.lambda_handler`
- **Timeout**: 60 seconds
- **Memory**: 512 MB
- **Environment Variables**:
  ```
  TOKENS_TABLE=gmail_tokens
  GMAIL_PROCESSOR_LAMBDA=gmail-processor-optimized
  ```
- **IAM Permissions**: 
  - DynamoDB read/write on `gmail_tokens`
  - Secrets Manager read for `google-oauth-credentials`
  - Lambda invoke permission for `gmail-processor-optimized`

#### 4. **gmail-report-emailer** (Python 3.9+)
- **File**: `lambda/gmail-report-emailer.py`
- **Handler**: `lambda_function.lambda_handler`
- **Timeout**: 30 seconds
- **Memory**: 256 MB
- **Environment Variables**:
  ```
  USE_GMAIL_FOR_EMAIL=true
  TOKENS_TABLE=gmail_tokens
  FROM_EMAIL=noreply@yourdomain.com
  S3_BUCKET_NAME=sale-dashboard-data
  ```
- **IAM Permissions**: 
  - DynamoDB read on `gmail_tokens`
  - S3 read access
  - SES send email (if using SES)//doubttttttttttttttttttttttttttttttttttttttttttt

### Step 2: Update Existing Lambda

Update **gmail-processor-optimized** environment variables:
```
BATCH_PROCESSOR_LAMBDA=your-batch-processor-lambda-name
```

---

## Part 3: API Gateway Setup

### Create API Gateway Endpoints

#### Endpoint 1: Gmail Watch Subscribe
- **Method**: POST
- **Path**: `/gmail/watch/subscribe`
- **Integration**: Lambda - `gmail-watch-subscribe`
- **CORS**: Enable
- **Auth**: None (called from your frontend after user login)

**Request Body Example**:
```json
{
  "userEmail": "user@example.com"
}
```

#### Endpoint 2: Pub/Sub Webhook (CRITICAL)
- **Method**: POST
- **Path**: `/gmail/pubsub/webhook`
- **Integration**: Lambda - `gmail-pubsub-handler`
- **CORS**: Not needed (Google calls this)
- **Auth**: None (Pub/Sub doesn't support API keys, use verification in Lambda if needed)

**⚠️ IMPORTANT**: This endpoint must be **publicly accessible** (no API key required) because Google Pub/Sub cannot pass custom headers.

**Note the full URL**: `https://YOUR_API_ID.execute-api.REGION.amazonaws.com/Production/gmail/pubsub/webhook`

---

## Part 4: Configure Pub/Sub Push Subscription

### Step 1: Create Push Subscription

1. Go back to **Google Cloud Console** → **Pub/Sub** → **Subscriptions**
2. Click **CREATE SUBSCRIPTION**
3. **Subscription ID**: `gmail-push-to-aws`
4. **Select a topic**: `gmail-notifications` (the one you created)
5. **Delivery type**: Select **Push**
6. **Endpoint URL**: Paste your API Gateway URL
   ```
   https://YOUR_API_ID.execute-api.REGION.amazonaws.com/Production/gmail/pubsub/webhook
   ```
7. **Authentication**: None (or configure if you add auth to Lambda)
8. **Acknowledgement deadline**: 30 seconds
9. **Message retention**: 7 days
10. **Retry policy**: Exponential backoff (default)
11. Click **CREATE**

### Step 2: Test the Subscription

Google will immediately send a verification request to your endpoint. Check:
- API Gateway logs
- Lambda `gmail-pubsub-handler` logs in CloudWatch

You should see a test notification being received.

---

## Part 5: Update Gmail Watch Subscription Code

### Update Lambda Environment Variable

In `gmail-watch-subscribe` Lambda, set:
```
PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications
```

Replace `YOUR_PROJECT_ID` with your actual Google Cloud project ID.

---

## Part 6: DynamoDB Table Updates

Ensure your `gmail_tokens` table has these attributes (will be auto-created by Lambdas):
- `user_email` (Primary Key, String)
- `access_token` (String)
- `refresh_token` (String)
- `expires_at` (Number - timestamp)
- `watch_history_id` (String - for Gmail history tracking)
- `watch_expiration` (Number - Gmail watch expiration)
- `watch_updated_at` (Number - last watch update)
- `last_notification_at` (Number - last notification received)

---

## Part 7: Testing the Complete Flow

### Test 1: Subscribe User to Watch

When a user signs up with Google OAuth:
1. Frontend calls `/gmail/watch/subscribe` (automatic in authService)
2. Check Lambda logs - should see "Gmail watch subscription successful"
3. Check DynamoDB - user should have `watch_history_id` and `watch_expiration`

### Test 2: Send Test Email

1. Have the user send themselves an email from `billing@zomato.com` or `payments@swiggy.in` (if possible)
2. OR send from any email and temporarily modify `MONITORED_SENDERS` in `gmail-pubsub-handler.py`

**Watch the logs**:
1. **gmail-pubsub-handler**: Should receive notification within seconds
2. **gmail-history-checker**: Should check history and find new messages
3. **gmail-processor-optimized**: Should download attachments
4. **batch-processor**: Should process the data
5. **gmail-report-emailer**: Should send report to user

### Test 3: Monitor CloudWatch

Create CloudWatch dashboard with these metrics:
- Lambda invocations for all 4 functions
- Lambda errors
- API Gateway 4xx/5xx errors
- Average processing time

---

## Part 8: Gmail Watch Renewal

Gmail watch subscriptions **expire after 7 days**. You need to renew them.

### Option A: EventBridge Scheduled Renewal (Recommended)

Create an EventBridge rule:
- **Schedule**: `rate(6 days)` (renew before expiration)
- **Target**: Lambda function that calls `gmail-watch-subscribe` for all users

**Create renewal Lambda**:
```python
import boto3
import json

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

def lambda_handler(event, context):
    table = dynamodb.Table('gmail_tokens')
    
    # Scan all users
    response = table.scan()
    users = response['Items']
    
    for user in users:
        user_email = user['user_email']
        
        # Re-subscribe
        lambda_client.invoke(
            FunctionName='gmail-watch-subscribe',
            InvocationType='Event',
            Payload=json.dumps({'userEmail': user_email})
        )
    
    return {'renewed': len(users)}
```

### Option B: Renew on User Login

Already implemented in your frontend - watch subscription happens on every signup/link.

---

## Part 9: Monitoring & Alerts

### Set up CloudWatch Alarms

1. **High Error Rate**
   - Metric: Lambda errors > 5 in 5 minutes
   - Action: SNS notification to your email

2. **Pub/Sub Handler Not Running**
   - Metric: Zero invocations for 1 hour (during business hours)
   - Action: SNS notification

3. **Processing Time Too Long**
   - Metric: `gmail-processor-optimized` duration > 5 minutes
   - Action: SNS notification

### Log Analysis

Check these regularly:
- Failed Gmail API calls
- Expired tokens not refreshing
- Pub/Sub messages not acknowledged
- S3 upload failures

---

## Part 10: Security Considerations

### 1. Pub/Sub Endpoint Security

Your `/gmail/pubsub/webhook` endpoint is public. To secure it:

**Option A**: Verify Pub/Sub signature in Lambda
```python
# Add to gmail-pubsub-handler.py
import base64
from google.cloud import pubsub_v1

def verify_pubsub_message(request):
    # Verify the push request signature
    # Google Cloud Pub/Sub documentation has examples
    pass
```

**Option B**: Use IP whitelisting
- Add AWS WAF to API Gateway
- Whitelist Google's Pub/Sub IP ranges

### 2. Token Storage

- Tokens are in DynamoDB - ensure encryption at rest is enabled
- Use IAM roles with least privilege
- Enable DynamoDB point-in-time recovery

### 3. Rate Limiting

Add API Gateway throttling:
- Burst: 100 requests
- Rate: 50 requests/second

---

## Part 11: Cost Estimates

### Google Cloud
- Pub/Sub: First 10 GB free, then $0.04/GB
- Expected: ~$5-10/month for 1000 users

### AWS
- Lambda: First 1M requests free
- API Gateway: First 1M requests free
- Expected: ~$10-20/month for 1000 users receiving 10 emails/day

**Total**: ~$15-30/month for 1000 active users

---

## Part 12: Troubleshooting

### Issue 1: Not Receiving Push Notifications

**Check**:
1. Pub/Sub subscription status in Google Cloud Console
2. API Gateway logs - any 4xx/5xx errors?
3. Lambda `gmail-pubsub-handler` CloudWatch logs
4. DynamoDB - does user have `watch_history_id`?

**Solution**:
- Re-run watch subscribe for the user
- Check Pub/Sub subscription delivery attempts (in Google Cloud Console)

### Issue 2: Duplicate Processing

**Check**:
- Are emails being processed multiple times?
- Check `watch_history_id` is being updated in DynamoDB

**Solution**:
- Add idempotency key to processing
- Check history ID comparison logic in `gmail-history-checker`

### Issue 3: Missing Emails

**Check**:
- Is `MONITORED_SENDERS` list correct?
- Are emails actually from those senders?
- Check Gmail History API responses

**Solution**:
- Temporarily log all senders to find the correct email
- Add more senders to `MONITORED_SENDERS`

---

## Summary Checklist

- [ ] Created Pub/Sub topic in Google Cloud
- [ ] Created Pub/Sub push subscription pointing to API Gateway
- [ ] Deployed all 4 Lambda functions
- [ ] Created API Gateway endpoints
- [ ] Updated environment variables with correct values
- [ ] Tested watch subscription
- [ ] Tested receiving a notification
- [ ] Set up CloudWatch alarms
- [ ] Configured watch renewal (EventBridge)
- [ ] Documented for your team

---

## Quick Reference

### Lambda Functions
1. **gmail-watch-subscribe**: Subscribes user mailbox to push notifications
2. **gmail-pubsub-handler**: Receives Pub/Sub notifications
3. **gmail-history-checker**: Checks what changed via History API
4. **gmail-report-emailer**: Sends processed report to user

### API Endpoints
- `POST /gmail/watch/subscribe` → Subscribe user
- `POST /gmail/pubsub/webhook` → Receive Pub/Sub push (Google calls this)

### Environment Variables Reference
```bash
# gmail-watch-subscribe
TOKENS_TABLE=gmail_tokens
PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# gmail-pubsub-handler
TOKENS_TABLE=gmail_tokens
HISTORY_CHECKER_LAMBDA=gmail-history-checker

# gmail-history-checker
TOKENS_TABLE=gmail_tokens
GMAIL_PROCESSOR_LAMBDA=gmail-processor-optimized

# gmail-report-emailer
USE_GMAIL_FOR_EMAIL=true
TOKENS_TABLE=gmail_tokens
FROM_EMAIL=noreply@yourdomain.com
S3_BUCKET_NAME=sale-dashboard-data

# gmail-processor-optimized (update existing)
BATCH_PROCESSOR_LAMBDA=your-batch-processor-name
```

---

## Need Help?

Common issues and solutions:
- **401 Unauthorized**: Refresh token expired, user needs to re-authenticate
- **404 History ID**: History too old, full sync needed
- **500 Internal Error**: Check Lambda CloudWatch logs for stack trace

Good luck! 🚀
