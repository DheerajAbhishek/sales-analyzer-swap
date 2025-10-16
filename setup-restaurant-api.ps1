# Restaurant Mapping API - Setup Commands

# First, create the Lambda functions (replace with your actual values)
$REGION = "ap-south-1"
$ROLE_ARN = "arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-execution-role"
$API_ID = "YOUR_API_GATEWAY_ID"  # Get this from your existing API Gateway

# 1. Create Lambda Functions
Write-Host "Creating Lambda functions..."

# Create restaurant-mappings-get
aws lambda create-function `
    --function-name restaurant-mappings-get `
    --runtime python3.9 `
    --role $ROLE_ARN `
    --handler lambda_function.lambda_handler `
    --zip-file fileb://restaurant-mappings-get.zip `
    --environment Variables='{RESTAURANT_MAPPINGS_TABLE=restaurant-mappings}' `
    --region $REGION

# Create restaurant-mappings-save
aws lambda create-function `
    --function-name restaurant-mappings-save `
    --runtime python3.9 `
    --role $ROLE_ARN `
    --handler lambda_function.lambda_handler `
    --zip-file fileb://restaurant-mappings-save.zip `
    --environment Variables='{RESTAURANT_MAPPINGS_TABLE=restaurant-mappings}' `
    --region $REGION

# Create restaurant-metadata-get
aws lambda create-function `
    --function-name restaurant-metadata-get `
    --runtime python3.9 `
    --role $ROLE_ARN `
    --handler lambda_function.lambda_handler `
    --zip-file fileb://restaurant-metadata-get.zip `
    --environment Variables='{RESTAURANT_METADATA_TABLE=restaurant-metadata}' `
    --region $REGION

# Create restaurant-metadata-save
aws lambda create-function `
    --function-name restaurant-metadata-save `
    --runtime python3.9 `
    --role $ROLE_ARN `
    --handler lambda_function.lambda_handler `
    --zip-file fileb://restaurant-metadata-save.zip `
    --environment Variables='{RESTAURANT_METADATA_TABLE=restaurant-metadata}' `
    --region $REGION

Write-Host "Lambda functions created!"

# 2. Get your existing API Gateway resources
Write-Host "Getting API Gateway structure..."
aws apigateway get-resources --rest-api-id $API_ID --region $REGION

# You'll need to note the root resource ID from the above command
$ROOT_RESOURCE_ID = "YOUR_ROOT_RESOURCE_ID"

# 3. Create restaurant-mappings resource
$MAPPINGS_RESOURCE = aws apigateway create-resource `
    --rest-api-id $API_ID `
    --parent-id $ROOT_RESOURCE_ID `
    --path-part "restaurant-mappings" `
    --region $REGION | ConvertFrom-Json

$MAPPINGS_RESOURCE_ID = $MAPPINGS_RESOURCE.id

# 4. Create restaurant-metadata resource  
$METADATA_RESOURCE = aws apigateway create-resource `
    --rest-api-id $API_ID `
    --parent-id $ROOT_RESOURCE_ID `
    --path-part "restaurant-metadata" `
    --region $REGION | ConvertFrom-Json

$METADATA_RESOURCE_ID = $METADATA_RESOURCE.id

# 5. Create GET method for restaurant-mappings
aws apigateway put-method `
    --rest-api-id $API_ID `
    --resource-id $MAPPINGS_RESOURCE_ID `
    --http-method GET `
    --authorization-type NONE `
    --region $REGION

# 6. Create POST method for restaurant-mappings
aws apigateway put-method `
    --rest-api-id $API_ID `
    --resource-id $MAPPINGS_RESOURCE_ID `
    --http-method POST `
    --authorization-type NONE `
    --region $REGION

# 7. Create GET method for restaurant-metadata
aws apigateway put-method `
    --rest-api-id $API_ID `
    --resource-id $METADATA_RESOURCE_ID `
    --http-method GET `
    --authorization-type NONE `
    --region $REGION

# 8. Create POST method for restaurant-metadata
aws apigateway put-method `
    --rest-api-id $API_ID `
    --resource-id $METADATA_RESOURCE_ID `
    --http-method POST `
    --authorization-type NONE `
    --region $REGION

Write-Host "API methods created!"

# 9. Set up Lambda integrations (you'll need to run these for each method)
# Example for GET /restaurant-mappings:
aws apigateway put-integration `
    --rest-api-id $API_ID `
    --resource-id $MAPPINGS_RESOURCE_ID `
    --http-method GET `
    --type AWS_PROXY `
    --integration-http-method POST `
    --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/arn:aws:lambda:$REGION:YOUR_ACCOUNT_ID:function:restaurant-mappings-get/invocations" `
    --region $REGION

# 10. Deploy the API
aws apigateway create-deployment `
    --rest-api-id $API_ID `
    --stage-name Prod `
    --region $REGION

Write-Host "Setup complete! Remember to:"
Write-Host "1. Replace YOUR_ACCOUNT_ID, YOUR_API_GATEWAY_ID, and YOUR_ROOT_RESOURCE_ID"
Write-Host "2. Create the DynamoDB tables"
Write-Host "3. Set up proper IAM permissions"
Write-Host "4. Enable CORS for all endpoints"
Write-Host "5. Add Lambda permissions for API Gateway to invoke functions"