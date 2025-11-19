# API Security Setup Guide

This guide will help you secure your AWS API Gateway endpoints to prevent unauthorized access.

## 🔐 Security Layers Implemented

### 1. **API Key Authentication**
- All API requests now include `X-API-Key` header
- Separate keys for main API and threshold API
- Keys validated on AWS API Gateway level

### 2. **JWT Token Authentication**
- Bearer token authentication for user-specific endpoints
- Automatic token refresh and validation
- Auto-logout on 401/403 responses

### 3. **Request Signing**
- Critical operations use request signatures
- Timestamp + payload + secret = signature
- Prevents request tampering

### 4. **Rate Limiting**
- Client-side rate limiting (100 requests/minute)
- Prevents abuse and excessive API calls
- Configurable limits per service

### 5. **CORS Protection**
- Restrict allowed origins in API Gateway
- Prevent cross-origin attacks

---

## 📋 Step-by-Step Setup

### Step 1: Generate API Keys

Generate secure random API keys:

```powershell
# Generate API keys (PowerShell)
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

Or use online generator: https://www.random.org/strings/

### Step 2: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```

2. Edit `.env` and add your API keys:
   ```env
   VITE_API_KEY=YOUR_GENERATED_API_KEY_1
   VITE_THRESHOLD_API_KEY=YOUR_GENERATED_API_KEY_2
   VITE_REQUEST_SECRET=YOUR_GENERATED_SECRET
   ```

3. **IMPORTANT**: Add `.env` to `.gitignore` to never commit secrets:
   ```
   .env
   .env.local
   .env.production
   ```

### Step 3: Configure AWS API Gateway

#### Enable API Key Requirement

1. **Go to AWS API Gateway Console**
2. **Select your API**: `https://p28ja8leg9.execute-api.ap-south-1.amazonaws.com/Production`

3. **Create API Key**:
   - Navigate to: API Keys → Create API Key
   - Name: `sales-dashboard-api-key`
   - Paste the key you generated: `YOUR_GENERATED_API_KEY_1`
   - Save

4. **Create Usage Plan**:
   - Navigate to: Usage Plans → Create
   - Name: `sales-dashboard-usage-plan`
   - Enable throttling: 1000 requests/second, 10000 requests/day
   - Add API stage: Select your API and Production stage
   - Add API Key: Associate the key you created

5. **Require API Key on Methods**:
   - Go to Resources
   - For each endpoint (GET, POST, PUT, DELETE):
     - Click on Method Request
     - Set "API Key Required" to **true**
   - **Deploy API** to Production stage

6. **Repeat for Threshold API**:
   - API: `https://xiphvj43ij.execute-api.ap-south-1.amazonaws.com/Prod`
   - Create separate key: `YOUR_GENERATED_API_KEY_2`
   - Follow same steps

#### Configure CORS

1. **In API Gateway Console**:
   - Select your API
   - For each resource, enable CORS
   - Configure allowed origins:
     ```
     https://yourdomain.com
     http://localhost:5173
     ```
   - Allowed headers:
     ```
     Content-Type,X-API-Key,Authorization,X-User-Email,X-Request-Timestamp,X-Request-Signature
     ```
   - Allowed methods: `GET,POST,PUT,DELETE,OPTIONS`

2. **Deploy changes** to Production stage

### Step 4: Add Lambda Authorizer (Optional - Recommended)

For additional security, create a Lambda authorizer:

1. **Create Lambda Function**:

```python
import json
import os

def lambda_handler(event, context):
    # Get API key from headers
    api_key = event['headers'].get('X-API-Key', '')
    
    # Get expected key from environment
    expected_key = os.environ.get('EXPECTED_API_KEY')
    
    # Validate
    if api_key == expected_key:
        return {
            'principalId': 'user',
            'policyDocument': {
                'Version': '2012-10-17',
                'Statement': [{
                    'Action': 'execute-api:Invoke',
                    'Effect': 'Allow',
                    'Resource': event['methodArn']
                }]
            }
        }
    else:
        raise Exception('Unauthorized')
```

2. **Set Environment Variable**:
   - Key: `EXPECTED_API_KEY`
   - Value: Your generated API key

3. **Attach to API Gateway**:
   - Create Authorizer in API Gateway
   - Type: Lambda
   - Select your Lambda function
   - Identity source: `method.request.header.X-API-Key`

### Step 5: Enable CloudWatch Logging

1. **In API Gateway**:
   - Settings → CloudWatch log role ARN
   - Attach IAM role with CloudWatch permissions

2. **In Stage Settings**:
   - Enable CloudWatch Logs
   - Log level: INFO or ERROR
   - Enable detailed metrics

3. **Monitor requests** in CloudWatch Logs

### Step 6: Set Up AWS WAF (Optional - Advanced)

For additional protection against DDoS and attacks:

1. **Create Web ACL**:
   - Navigate to AWS WAF & Shield
   - Create Web ACL
   - Associate with API Gateway

2. **Add Rules**:
   - Rate-based rule: 2000 requests per 5 minutes per IP
   - Geo-blocking: Block unwanted countries
   - SQL injection protection
   - XSS protection

---

## 🔍 Verification

### Test API Protection

1. **Without API Key** (should fail):
   ```powershell
   curl https://p28ja8leg9.execute-api.ap-south-1.amazonaws.com/Production/user-restaurants?businessEmail=test@example.com
   ```
   Expected: 403 Forbidden

2. **With API Key** (should succeed):
   ```powershell
   curl -H "X-API-Key: YOUR_API_KEY" https://p28ja8leg9.execute-api.ap-south-1.amazonaws.com/Production/user-restaurants?businessEmail=test@example.com
   ```
   Expected: 200 OK

### Monitor Usage

Check API Gateway dashboard for:
- Number of API calls
- 4xx/5xx errors
- Latency metrics
- API key usage

---

## 🚀 Frontend Deployment

When deploying your frontend:

1. **Set environment variables** in your hosting platform:
   - Vercel: Settings → Environment Variables
   - Netlify: Site settings → Build & deploy → Environment
   - AWS Amplify: App settings → Environment variables

2. **Never commit** `.env` file to Git

3. **Use different keys** for production vs development

---

## 📊 Monitoring & Alerts

### Set Up CloudWatch Alarms

1. **High Error Rate**:
   - Metric: 4XXError or 5XXError
   - Threshold: > 10 in 5 minutes
   - Action: SNS notification

2. **Unusual Traffic**:
   - Metric: Count
   - Threshold: > 10,000 in 5 minutes
   - Action: SNS notification

3. **Unauthorized Access Attempts**:
   - Create metric filter in CloudWatch Logs
   - Pattern: "Forbidden" or "Unauthorized"
   - Alarm on high frequency

---

## 🔄 Key Rotation

Rotate API keys every 90 days:

1. Generate new API key
2. Create new key in AWS API Gateway
3. Add to usage plan
4. Update `.env` with new key
5. Deploy frontend
6. After 24 hours, remove old key

---

## 🛡️ Security Best Practices

✅ **DO**:
- Use HTTPS only
- Rotate keys regularly
- Monitor API usage
- Enable CloudWatch logging
- Use separate keys for dev/prod
- Implement rate limiting on backend
- Add Lambda authorizers for sensitive endpoints

❌ **DON'T**:
- Commit API keys to Git
- Share keys via email/chat
- Use same key for multiple environments
- Expose API URLs without protection
- Disable CORS

---

## 🆘 Troubleshooting

### Issue: "API Key Required" error in production

**Solution**: Ensure `.env` file is configured in your hosting platform's environment variables.

### Issue: CORS errors

**Solution**: 
1. Check API Gateway CORS configuration
2. Ensure `X-API-Key` is in allowed headers
3. Redeploy API after CORS changes

### Issue: Rate limit exceeded

**Solution**: 
- Adjust rate limits in `secureApiClient.js`
- Or increase AWS API Gateway usage plan limits

---

## 📞 Support

For issues:
1. Check CloudWatch Logs for detailed errors
2. Verify API key is correctly configured
3. Test with curl/Postman first
4. Check AWS API Gateway metrics

---

## 🔒 Additional Security (Production)

For production environments, consider:

1. **AWS Cognito** for user authentication
2. **AWS Secrets Manager** for storing API keys
3. **AWS Certificate Manager** for SSL/TLS
4. **DDoS protection** with AWS Shield
5. **Regular security audits**

---

**Last Updated**: November 2025
