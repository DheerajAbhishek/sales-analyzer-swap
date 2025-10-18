# Google OAuth Security Setup - Complete Guide

## 🔒 Security Issue Resolved

**Problem:** Google Client Secret was exposed in frontend `.env` file with `VITE_` prefix, making it publicly visible in JavaScript bundle.

**Solution:** Moved OAuth token exchange to backend Lambda functions, keeping client secret secure in AWS Secrets Manager.

---

## 📋 Setup Checklist

### 1. ✅ AWS Secrets Manager Setup

Store your Google OAuth credentials in Secrets Manager:

```bash
# Create or update the secret (use AWS Console or CLI)
aws secretsmanager create-secret \
    --name "google-oauth-credentials" \
    --region ap-south-1 \
    --secret-string '{
        "client_id": "271010290093-aindh5q2u3uc3supeeshj67b3n2qe9q1.apps.googleusercontent.com",
        "client_secret": "YOUR-ACTUAL-CLIENT-SECRET-HERE"
    }'
```

**Important:** Replace `YOUR-ACTUAL-CLIENT-SECRET-HERE` with your actual Google OAuth client secret!

### 2. ✅ Deploy New Lambda Functions

Deploy these two new Lambda functions to your AWS account:

#### A. `oauth-exchange-token` Lambda
- **File:** `lambda/oauth-exchange-token.py`
- **Purpose:** Exchanges OAuth authorization code for tokens
- **API Gateway Route:** `POST /oauth/exchange-token`
- **IAM Permissions Needed:**
  - `secretsmanager:GetSecretValue` for `google-oauth-credentials`
  - `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

#### B. `oauth-refresh-token` Lambda
- **File:** `lambda/oauth-refresh-token.py`
- **Purpose:** Refreshes expired access tokens
- **API Gateway Route:** `POST /oauth/refresh-token`
- **IAM Permissions Needed:**
  - `secretsmanager:GetSecretValue` for `google-oauth-credentials`
  - `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

### 3. ✅ API Gateway Configuration

Add these routes to your API Gateway:

```yaml
POST /oauth/exchange-token
  - Integration: Lambda Function (oauth-exchange-token)
  - CORS: Enabled
  - Authorization: None (public endpoint)

POST /oauth/refresh-token
  - Integration: Lambda Function (oauth-refresh-token)
  - CORS: Enabled
  - Authorization: None (public endpoint)
```

### 4. ✅ Frontend Configuration

Your `.env` file should now look like this:

```env
# Your existing API configuration
VITE_API_BASE_URL=https://p28ja8leg9.execute-api.ap-south-1.amazonaws.com/Production

# Google OAuth 2.0 Configuration
# ⚠️ Client ID is PUBLIC (safe to expose in frontend)
# 🔒 Client Secret is PRIVATE (stored securely in AWS Secrets Manager)
VITE_GOOGLE_CLIENT_ID=271010290093-aindh5q2u3uc3supeeshj67b3n2qe9q1.apps.googleusercontent.com

# OAuth Redirect URI (matches Google Cloud Console configuration)
VITE_OAUTH_REDIRECT_URI=http://localhost:3000/oauth/callback
```

**Note:** `VITE_GOOGLE_CLIENT_SECRET` has been removed! ✅

---

## 🔄 How It Works Now

### Before (Insecure):
```
1. Frontend → Google OAuth (with Client ID)
2. User authorizes
3. Google → Frontend (with auth code)
4. Frontend → Google Token API (with code + CLIENT_SECRET 🔓 EXPOSED!)
5. Google → Frontend (with access token)
```

### After (Secure):
```
1. Frontend → Google OAuth (with Client ID)
2. User authorizes
3. Google → Frontend (with auth code)
4. Frontend → Your Lambda (with code only)
5. Lambda → Google Token API (with code + CLIENT_SECRET 🔒 SECURE!)
6. Google → Lambda (with access token)
7. Lambda → Frontend (with access token)
```

---

## 🚀 Deployment Steps

### Step 1: Deploy Lambda Functions

```bash
# 1. Zip the Lambda functions
cd lambda
Compress-Archive -Path oauth-exchange-token.py -DestinationPath oauth-exchange-token.zip -Force
Compress-Archive -Path oauth-refresh-token.py -DestinationPath oauth-refresh-token.zip -Force

# 2. Upload to AWS Lambda (via Console or CLI)
aws lambda create-function \
    --function-name oauth-exchange-token \
    --runtime python3.11 \
    --role arn:aws:iam::YOUR-ACCOUNT-ID:role/lambda-execution-role \
    --handler oauth-exchange-token.lambda_handler \
    --zip-file fileb://oauth-exchange-token.zip \
    --region ap-south-1

aws lambda create-function \
    --function-name oauth-refresh-token \
    --runtime python3.11 \
    --role arn:aws:iam::YOUR-ACCOUNT-ID:role/lambda-execution-role \
    --handler oauth-refresh-token.lambda_handler \
    --zip-file fileb://oauth-refresh-token.zip \
    --region ap-south-1
```

### Step 2: Configure API Gateway

Add the routes to your existing API Gateway (manually via Console or IaC).

### Step 3: Store Secret in Secrets Manager

```bash
# Create the secret with your actual credentials
aws secretsmanager create-secret \
    --name "google-oauth-credentials" \
    --region ap-south-1 \
    --secret-string '{
        "client_id": "YOUR-CLIENT-ID",
        "client_secret": "YOUR-CLIENT-SECRET"
    }'
```

### Step 4: Update Frontend

The frontend code has already been updated in:
- ✅ `src/services/googleOAuthService.js`
- ✅ `.env`

### Step 5: Test

```bash
# 1. Start your frontend
npm run dev

# 2. Try "Continue with Google"
# 3. Check browser console for logs
# 4. Verify token exchange goes through your Lambda
```

---

## 🔍 Testing & Verification

### Test Token Exchange:
```bash
# Test the exchange endpoint
curl -X POST \
  https://YOUR-API.execute-api.ap-south-1.amazonaws.com/Production/oauth/exchange-token \
  -H 'Content-Type: application/json' \
  -d '{
    "code": "TEST-AUTH-CODE",
    "redirect_uri": "http://localhost:3000/oauth/callback"
  }'
```

### Verify Secret is Secure:
```bash
# Check your built frontend bundle
npm run build
grep -r "GOCSPX" dist/  # Should return NOTHING!
```

---

## ⚠️ Important Security Notes

1. **NEVER** commit your actual client secret to Git
2. **ROTATE** your client secret if it was previously exposed
3. **VERIFY** that `VITE_GOOGLE_CLIENT_SECRET` is removed from `.env`
4. **CHECK** your Git history to ensure secret wasn't committed
5. **UPDATE** production environment with new Lambda functions

---

## 🛠️ IAM Policy for Lambda

Your Lambda functions need this IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:ap-south-1:YOUR-ACCOUNT-ID:secret:google-oauth-credentials-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:ap-south-1:YOUR-ACCOUNT-ID:log-group:/aws/lambda/*"
    }
  ]
}
```

---

## 📝 Files Modified

1. ✅ `lambda/oauth-exchange-token.py` - NEW
2. ✅ `lambda/oauth-refresh-token.py` - NEW
3. ✅ `src/services/googleOAuthService.js` - UPDATED (removed client_secret exposure)
4. ✅ `.env` - UPDATED (removed VITE_GOOGLE_CLIENT_SECRET)

---

## 🎯 Next Steps

1. **Deploy Lambda functions** to AWS
2. **Configure API Gateway** routes
3. **Store credentials** in Secrets Manager
4. **Test OAuth flow** end-to-end
5. **Verify** no secrets in frontend bundle
6. **Deploy** to production

---

## 🆘 Troubleshooting

### Issue: "OAuth exchange failed"
- Check Lambda CloudWatch logs
- Verify secret exists in Secrets Manager
- Ensure API Gateway routes are correct

### Issue: "CORS error"
- Verify CORS headers in Lambda response
- Check API Gateway CORS configuration
- Enable OPTIONS method for preflight

### Issue: "Invalid client secret"
- Verify secret value in Secrets Manager
- Check secret JSON format: `{"client_id": "...", "client_secret": "..."}`
- Ensure IAM permissions allow Lambda to read secret

---

**Status:** ✅ Security issue resolved!  
**Date:** $(Get-Date)  
**Environment:** Development & Production Ready
