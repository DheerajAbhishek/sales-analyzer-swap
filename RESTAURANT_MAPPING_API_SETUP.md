# Restaurant Mapping API - Backend Setup

This document describes how to set up the backend infrastructure for saving user restaurant mappings and metadata to DynamoDB.

## Required AWS Resources

### 1. DynamoDB Tables

#### Restaurant Mappings Table
```bash
aws dynamodb create-table \
    --table-name restaurant-mappings \
    --attribute-definitions \
        AttributeName=businessEmail,AttributeType=S \
    --key-schema \
        AttributeName=businessEmail,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region ap-south-1
```

#### Restaurant Metadata Table
```bash
aws dynamodb create-table \
    --table-name restaurant-metadata \
    --attribute-definitions \
        AttributeName=businessEmail,AttributeType=S \
    --key-schema \
        AttributeName=businessEmail,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region ap-south-1
```

### 2. Lambda Functions

Create the following Lambda functions using the Python files in the `lambda/` directory:

1. **restaurant-mappings-get** - GET endpoint for retrieving user restaurant mappings
2. **restaurant-mappings-save** - POST endpoint for saving user restaurant mappings  
3. **restaurant-metadata-get** - GET endpoint for retrieving restaurant metadata
4. **restaurant-metadata-save** - POST endpoint for saving restaurant metadata

#### Lambda Configuration:
- Runtime: Python 3.9 or higher
- Timeout: 30 seconds
- Memory: 256 MB
- Environment Variables:
  - `RESTAURANT_MAPPINGS_TABLE=restaurant-mappings`
  - `RESTAURANT_METADATA_TABLE=restaurant-metadata`

#### IAM Role for Lambda:
The Lambda functions need permissions to read/write to DynamoDB:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:Query",
                "dynamodb:Scan"
            ],
            "Resource": [
                "arn:aws:dynamodb:ap-south-1:*:table/restaurant-mappings",
                "arn:aws:dynamodb:ap-south-1:*:table/restaurant-metadata"
            ]
        },
        {
            "Effect": "Allow", 
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        }
    ]
}
```

### 3. API Gateway Endpoints

Add the following endpoints to your existing API Gateway:

#### GET /restaurant-mappings
- Integration: Lambda Function (restaurant-mappings-get)
- Query Parameters: `businessEmail` (required)
- CORS: Enabled

#### POST /restaurant-mappings  
- Integration: Lambda Function (restaurant-mappings-save)
- Request Body: 
  ```json
  {
    "businessEmail": "user@example.com",
    "mappings": [
      {
        "id": "restaurant_123",
        "name": "My Restaurant",
        "platforms": {
          "zomato": "19251816",
          "swiggy": "224899",
          "takeaway": "",
          "subs": "subsMK"
        }
      }
    ]
  }
  ```
- CORS: Enabled

#### GET /restaurant-metadata
- Integration: Lambda Function (restaurant-metadata-get)  
- Query Parameters: `businessEmail` (required)
- CORS: Enabled

#### POST /restaurant-metadata
- Integration: Lambda Function (restaurant-metadata-save)
- Request Body:
  ```json
  {
    "businessEmail": "user@example.com", 
    "metadata": {
      "restaurant_123_zomato": {
        "id": "restaurant_123_zomato",
        "name": "My Restaurant Main",
        "channel": "zomato",
        "updatedAt": "2025-10-15T10:30:00Z"
      }
    }
  }
  ```
- CORS: Enabled

## Data Flow

1. **User uploads data files** → Platform IDs are extracted and stored in S3
2. **User visits Profile page** → Frontend calls GET /restaurant-mappings to load existing mappings
3. **User creates restaurant mappings** → Frontend calls POST /restaurant-mappings to save
4. **User edits restaurant names** → Frontend calls POST /restaurant-metadata to save changes
5. **Report generation** → Uses the mappings to group platform IDs by restaurant

## Testing the APIs

### Get Restaurant Mappings
```bash
curl -X GET "https://your-api-gateway-url.amazonaws.com/Prod/restaurant-mappings?businessEmail=user@example.com" \
  -H "Content-Type: application/json"
```

### Save Restaurant Mappings
```bash
curl -X POST "https://your-api-gateway-url.amazonaws.com/Prod/restaurant-mappings" \
  -H "Content-Type: application/json" \
  -d '{
    "businessEmail": "user@example.com",
    "mappings": [
      {
        "id": "restaurant_1",
        "name": "Main Kitchen",
        "platforms": {
          "zomato": "19251816",
          "swiggy": "224899"
        }
      }
    ]
  }'
```

## Frontend Integration

The frontend services have been updated to automatically:

1. **Try backend first** - Attempt to save/load from DynamoDB via API
2. **Fallback to localStorage** - If backend is unavailable, use local storage
3. **Show sync status** - Indicate whether data was saved to backend or only locally
4. **Automatic retry** - Retry backend operations on next app load

This provides a robust solution that works offline but syncs when possible.

## Security Considerations

1. **Authentication** - Ensure proper JWT token validation
2. **Authorization** - Users can only access their own data (filter by businessEmail)
3. **Input validation** - All inputs are validated in Lambda functions
4. **Rate limiting** - Consider adding rate limiting to prevent abuse
5. **Data encryption** - DynamoDB encryption at rest is recommended

## Monitoring

Set up CloudWatch alarms for:
- Lambda function errors
- DynamoDB throttling
- API Gateway 4xx/5xx errors
- High latency requests