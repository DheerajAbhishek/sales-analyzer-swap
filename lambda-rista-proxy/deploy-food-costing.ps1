#!/usr/bin/env pwsh
# Deploy Food Costing Lambda and API Gateway endpoint
# Run this script from the lambda-rista-proxy directory

param(
    [string]$FunctionName = "rista-food-costing-proxy",
    [string]$ApiId = "xiphvj43ij",
    [string]$Region = "ap-south-1",
    [string]$Stage = "Prod",
    [string]$RoleArn = "arn:aws:iam::509904898772:role/sales-dashboard-lambda-role"
)

Write-Host "`n🚀 Deploying Food Costing Lambda Function" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

# Step 1: Create/Update Lambda Function
Write-Host "📦 Step 1: Creating Lambda deployment package..." -ForegroundColor Yellow
Remove-Item -Path lambda-deployment.zip -ErrorAction SilentlyContinue
Compress-Archive -Path lambda_function.py -DestinationPath lambda-deployment.zip -Force
Write-Host "   ✓ Package created: lambda-deployment.zip`n" -ForegroundColor Green

# Check if function exists
Write-Host "🔍 Step 2: Checking if Lambda function exists..." -ForegroundColor Yellow
$functionExists = aws lambda get-function --function-name $FunctionName --region $Region 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ↻ Updating existing function: $FunctionName" -ForegroundColor Blue
    aws lambda update-function-code `
        --function-name $FunctionName `
        --zip-file fileb://lambda-deployment.zip `
        --region $Region `
        --output json | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Function code updated`n" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Failed to update function code`n" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ↻ Creating new function: $FunctionName" -ForegroundColor Blue
    aws lambda create-function `
        --function-name $FunctionName `
        --runtime python3.11 `
        --role $RoleArn `
        --handler lambda_function.lambda_handler `
        --zip-file fileb://lambda-deployment.zip `
        --timeout 30 `
        --memory-size 256 `
        --region $Region `
        --output json | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Function created`n" -ForegroundColor Green
        Start-Sleep -Seconds 3
    } else {
        Write-Host "   ✗ Failed to create function`n" -ForegroundColor Red
        exit 1
    }
}

# Step 3: Update environment variables
Write-Host "⚙️  Step 3: Configuring environment variables..." -ForegroundColor Yellow
Write-Host "   ℹ️  Note: Set RISTA_API_KEY and RISTA_SECRET_KEY in Lambda console" -ForegroundColor Cyan
aws lambda update-function-configuration `
    --function-name $FunctionName `
    --environment "Variables={RISTA_API_URL=https://api.ristaapps.com/v1}" `
    --region $Region `
    --output json | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Environment variables configured`n" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Warning: Could not set environment variables`n" -ForegroundColor Yellow
}

# Get Lambda ARN
$lambdaArn = aws lambda get-function --function-name $FunctionName --region $Region --query 'Configuration.FunctionArn' --output text
Write-Host "   Lambda ARN: $lambdaArn`n" -ForegroundColor Cyan

# Step 4: Get root resource ID
Write-Host "🌐 Step 4: Setting up API Gateway endpoint..." -ForegroundColor Yellow
$rootId = aws apigateway get-resources --rest-api-id $ApiId --region $Region --query 'items[?path==`/`].id' --output text
Write-Host "   Root Resource ID: $rootId" -ForegroundColor Cyan

# Step 5: Check if /food-costing resource exists
$resourceId = aws apigateway get-resources --rest-api-id $ApiId --region $Region --query "items[?path=='/food-costing'].id" --output text

if ([string]::IsNullOrWhiteSpace($resourceId)) {
    Write-Host "   ↻ Creating /food-costing resource..." -ForegroundColor Blue
    $resourceId = aws apigateway create-resource `
        --rest-api-id $ApiId `
        --parent-id $rootId `
        --path-part "food-costing" `
        --region $Region `
        --query 'id' --output text
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Resource created: $resourceId`n" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Failed to create resource`n" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ✓ Resource exists: $resourceId`n" -ForegroundColor Green
}

# Step 6: Create GET method (if not exists)
Write-Host "🔧 Step 5: Configuring GET method..." -ForegroundColor Yellow
$methodExists = aws apigateway get-method --rest-api-id $ApiId --resource-id $resourceId --http-method GET --region $Region 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ↻ Creating GET method..." -ForegroundColor Blue
    aws apigateway put-method `
        --rest-api-id $ApiId `
        --resource-id $resourceId `
        --http-method GET `
        --authorization-type NONE `
        --region $Region `
        --output json | Out-Null
    
    # Add Lambda integration
    aws apigateway put-integration `
        --rest-api-id $ApiId `
        --resource-id $resourceId `
        --http-method GET `
        --type AWS_PROXY `
        --integration-http-method POST `
        --uri "arn:aws:apigateway:${Region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations" `
        --region $Region `
        --output json | Out-Null
    
    Write-Host "   ✓ GET method configured`n" -ForegroundColor Green
} else {
    Write-Host "   ✓ GET method exists`n" -ForegroundColor Green
}

# Step 7: Create POST method (if not exists)
Write-Host "🔧 Step 6: Configuring POST method..." -ForegroundColor Yellow
$methodExists = aws apigateway get-method --rest-api-id $ApiId --resource-id $resourceId --http-method POST --region $Region 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ↻ Creating POST method..." -ForegroundColor Blue
    aws apigateway put-method `
        --rest-api-id $ApiId `
        --resource-id $resourceId `
        --http-method POST `
        --authorization-type NONE `
        --region $Region `
        --output json | Out-Null
    
    # Add Lambda integration
    aws apigateway put-integration `
        --rest-api-id $ApiId `
        --resource-id $resourceId `
        --http-method POST `
        --type AWS_PROXY `
        --integration-http-method POST `
        --uri "arn:aws:apigateway:${Region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations" `
        --region $Region `
        --output json | Out-Null
    
    Write-Host "   ✓ POST method configured`n" -ForegroundColor Green
} else {
    Write-Host "   ✓ POST method exists`n" -ForegroundColor Green
}

# Step 8: Add Lambda permission for API Gateway
Write-Host "🔐 Step 7: Configuring Lambda permissions..." -ForegroundColor Yellow
$sourceArn = "arn:aws:execute-api:${Region}:509904898772:${ApiId}/*/*/*"
aws lambda add-permission `
    --function-name $FunctionName `
    --statement-id "apigateway-food-costing-invoke-$(Get-Date -Format 'yyyyMMddHHmmss')" `
    --action lambda:InvokeFunction `
    --principal apigateway.amazonaws.com `
    --source-arn $sourceArn `
    --region $Region 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Lambda permission added`n" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  Permission already exists or added previously`n" -ForegroundColor Cyan
}

# Step 9: Deploy API
Write-Host "🚀 Step 8: Deploying API to $Stage stage..." -ForegroundColor Yellow
aws apigateway create-deployment `
    --rest-api-id $ApiId `
    --stage-name $Stage `
    --region $Region `
    --output json | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ API deployed successfully`n" -ForegroundColor Green
} else {
    Write-Host "   ✗ Failed to deploy API`n" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "`n✅ DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "==========================================`n" -ForegroundColor Green
Write-Host "📍 Endpoint URL:" -ForegroundColor Cyan
Write-Host "   https://${ApiId}.execute-api.${Region}.amazonaws.com/${Stage}/food-costing`n" -ForegroundColor White

Write-Host "🧪 Test Commands:" -ForegroundColor Cyan
Write-Host "   # Direct path (GET)" -ForegroundColor Gray
Write-Host "   curl -s 'https://${ApiId}.execute-api.${Region}.amazonaws.com/${Stage}/food-costing?branchId=WWK&day=2025-12-20'`n" -ForegroundColor White

Write-Host "   # Root mode (GET) - CORS-safe" -ForegroundColor Gray
Write-Host "   curl -s 'https://${ApiId}.execute-api.${Region}.amazonaws.com/${Stage}?mode=food-costing&branchId=WWK&day=2025-12-20'`n" -ForegroundColor White

Write-Host "⚠️  IMPORTANT: Configure Lambda environment variables in AWS Console:" -ForegroundColor Yellow
Write-Host "   - RISTA_API_KEY" -ForegroundColor White
Write-Host "   - RISTA_SECRET_KEY`n" -ForegroundColor White

Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Set RISTA_API_KEY and RISTA_SECRET_KEY in Lambda console" -ForegroundColor White
Write-Host "   2. Test the endpoint with a real branch ID and date" -ForegroundColor White
Write-Host "   3. Frontend is already configured to use this endpoint`n" -ForegroundColor White
