# AWS Cost Optimization Implementation Guide

## 🎯 **Current Situation**
- **Total Bill**: $0.53/month (≈ ₹45)
- **Main Costs**: S3 requests ($0.32) + Secrets Manager ($0.20) + DynamoDB ($0.01)
- **Problem**: Exceeded free tier S3 requests (55,887 vs 2,000 free)

## 💰 **Optimization Summary**

| Optimization | Current Cost | Optimized Cost | Monthly Savings |
|--------------|-------------|----------------|----------------|
| S3 LIST requests | $0.28 | $0.02-0.05 | $0.23-0.26 |
| Secrets Manager | $0.20 | $0.00 | $0.20 |
| S3 PUT requests | $0.04 | $0.02-0.03 | $0.01-0.02 |
| **TOTAL** | **$0.53** | **$0.04-0.08** | **$0.44-0.49** |

### 🏆 **Expected Results**
- **Monthly cost**: $0.53 → $0.04-0.08 (92% reduction!)
- **Annual savings**: ~$5.40-5.88
- **Percentage savings**: 85-92%

---

## 🚀 **Implementation Steps**

### Phase 1: S3 Request Optimization (Saves $0.23-0.26/month)

#### 1.1 Deploy the Optimized Restaurant Fetcher
```bash
# Deploy the cache-enabled version
aws lambda create-function \
  --function-name get-user-restaurants-optimized \
  --runtime python3.9 \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://get-user-restaurants-optimized.zip

# Create DynamoDB table for caching
aws dynamodb create-table \
  --table-name user-restaurants-cache \
  --attribute-definitions AttributeName=userEmail,AttributeType=S \
  --key-schema AttributeName=userEmail,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --time-to-live-specification AttributeName=ttl,Enabled=true
```

#### 1.2 Set up S3 Event Trigger for Cache Invalidation
```bash
# Deploy cache invalidator
aws lambda create-function \
  --function-name cache-invalidator \
  --runtime python3.9 \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://cache-invalidator.zip

# Configure S3 event notification
aws s3api put-bucket-notification-configuration \
  --bucket your-bucket-name \
  --notification-configuration file://s3-notification-config.json
```

#### 1.3 Update API Gateway
```bash
# Update the API Gateway endpoint to use the optimized function
aws apigateway put-integration \
  --rest-api-id YOUR_API_ID \
  --resource-id YOUR_RESOURCE_ID \
  --http-method GET \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri arn:aws:apigateway:REGION:lambda:path/2015-03-31/functions/arn:aws:lambda:REGION:ACCOUNT:function:get-user-restaurants-optimized/invocations
```

### Phase 2: Parameter Store Migration (Saves $0.20/month)

#### 2.1 Run the Migration Script
```bash
# First, migrate the credentials
python parameter-store-migration.py --migrate

# Verify the migration worked
python parameter-store-migration.py --verify
```

#### 2.2 Update Lambda Functions
Replace the `get_google_oauth_credentials()` method in these files:
- `gmail-processor.py`
- `gmail-processor-optimized.py` 
- `oauth-exchange-token.py`
- `oauth-refresh-token.py`

Use the optimized version from `gmail-token-manager-optimized.py`

#### 2.3 Test and Delete Old Secret
```bash
# Test your Gmail functionality first!
# Then delete the expensive secret:
python parameter-store-migration.py --delete-secret
```

### Phase 3: S3 Upload Optimization (Saves $0.01-0.02/month)

#### 3.1 Deploy Enhanced Upload Deduplication
```bash
# Create file tracking table
aws dynamodb create-table \
  --table-name uploaded-files-tracking \
  --attribute-definitions \
    AttributeName=contentHash,AttributeType=S \
    AttributeName=userEmail,AttributeType=S \
  --key-schema \
    AttributeName=contentHash,KeyType=HASH \
    AttributeName=userEmail,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --time-to-live-specification AttributeName=ttl,Enabled=true

# Deploy optimized uploader
aws lambda create-function \
  --function-name s3-upload-optimizer \
  --runtime python3.9 \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://s3-upload-optimizer.zip
```

#### 3.2 Integrate with Gmail Processor
Update `gmail-processor.py` to use the `OptimizedS3Uploader` class instead of the basic `S3Uploader`.

### Phase 4: Cost Monitoring (Prevents future overage)

#### 4.1 Set up Billing Alerts
```bash
# Deploy cost monitoring
python cost-monitoring-setup.py --email your-email@example.com
```

#### 4.2 Create CloudWatch Dashboard
Create a custom dashboard to monitor:
- S3 request counts
- Parameter Store usage (should be 0 cost)
- DynamoDB read/write units
- Lambda invocation counts

---

## 🔧 **Configuration Files Needed**

### S3 Event Notification Config (`s3-notification-config.json`)
```json
{
  "LambdaConfigurations": [
    {
      "Id": "cache-invalidator",
      "LambdaFunctionArn": "arn:aws:lambda:REGION:ACCOUNT:function:cache-invalidator",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {
              "Name": "prefix",
              "Value": "users/"
            },
            {
              "Name": "suffix",
              "Value": ".json"
            }
          ]
        }
      }
    }
  ]
}
```

### Environment Variables for Lambda Functions
```bash
# get-user-restaurants-optimized
USER_RESTAURANTS_CACHE_TABLE=user-restaurants-cache
CACHE_TTL_HOURS=24

# s3-upload-optimizer  
FILE_TRACKING_TABLE=uploaded-files-tracking
S3_BUCKET_NAME=your-bucket-name

# gmail-processor functions
USER_TOKENS_TABLE=user-gmail-tokens
S3_BUCKET_NAME=your-bucket-name
```

---

## 📊 **Monitoring and Validation**

### Check Optimization Success

#### 1. S3 Request Reduction
```bash
# Monitor S3 requests in CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/S3 \
  --metric-name NumberOfObjects \
  --start-time 2025-11-01T00:00:00Z \
  --end-time 2025-11-30T23:59:59Z \
  --period 86400 \
  --statistics Sum
```

#### 2. Secrets Manager Elimination
```bash
# Should show zero usage after migration
aws cloudwatch get-metric-statistics \
  --namespace AWS/SecretsManager \
  --metric-name SuccessfulRequests \
  --start-time 2025-11-01T00:00:00Z \
  --end-time 2025-11-30T23:59:59Z \
  --period 86400 \
  --statistics Sum
```

#### 3. Cache Hit Rates
Check DynamoDB CloudWatch metrics for cache table usage.

### Monthly Cost Review
```bash
# Generate cost report
python cost-monitoring-setup.py --report-only
```

---

## 🚨 **Rollback Plan**

If anything breaks:

1. **S3 Caching Issues**: Switch API Gateway back to `get-user-restaurants-fixed`
2. **Parameter Store Problems**: 
   - Restore secret: `aws secretsmanager restore-secret --secret-id google-oauth-credentials`
   - Revert Lambda code to use `secrets_client`
3. **Upload Issues**: Disable the optimized uploader and use basic S3 uploads

---

## 🎯 **Expected Timeline**

- **Phase 1** (S3 optimization): 2-3 hours
- **Phase 2** (Parameter Store): 1 hour  
- **Phase 3** (Upload optimization): 1-2 hours
- **Phase 4** (Monitoring): 30 minutes

**Total implementation time**: 4-6 hours

---

## 🏁 **Success Metrics**

After implementation, you should see:

✅ **S3 requests drop from 55,887 to <5,000/month**  
✅ **Secrets Manager cost goes to $0.00**  
✅ **Monthly bill drops from $0.53 to $0.04-0.08**  
✅ **Billing alerts prevent future overages**  

**Result**: 85-92% cost reduction while maintaining all functionality!

---

## 📧 **Support**

If you need help with implementation:
1. Check the inline documentation in each script
2. Use the `--help` flags on CLI tools
3. Review CloudWatch logs for any errors
4. Test each phase incrementally

The optimizations are designed to be safe and reversible. Start with Phase 1 (biggest savings) and work your way through!