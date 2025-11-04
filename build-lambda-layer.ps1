# Build Lambda Layer for Google API Python Client
# This creates a zip file that can be uploaded as a Lambda Layer

Write-Host "Building Lambda Layer for Google API Python Client..." -ForegroundColor Cyan

# Create temporary directory structure
$layerDir = "lambda-layer"
$pythonDir = Join-Path $layerDir "python"

# Clean up if exists
if (Test-Path $layerDir) {
    Write-Host "Cleaning up existing layer directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $layerDir
}

# Create directory structure
New-Item -ItemType Directory -Path $pythonDir -Force | Out-Null
Write-Host "Installing Python packages to $pythonDir..." -ForegroundColor Cyan

# Install packages to the python directory
# Include ALL dependencies needed by the Lambda functions
pip install --target $pythonDir `
    google-api-python-client `
    google-auth `
    google-auth-httplib2 `
    google-auth-oauthlib `
    requests `
    email-validator `
    --upgrade

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install packages" -ForegroundColor Red
    exit 1
}

Write-Host "Packages installed successfully!" -ForegroundColor Green

Write-Host "Creating layer zip file..." -ForegroundColor Cyan

# Create zip file
$zipFile = "google-api-lambda-layer.zip"
if (Test-Path $zipFile) {
    Remove-Item $zipFile -Force
}

# Zip the layer directory
Compress-Archive -Path (Join-Path $layerDir "*") -DestinationPath $zipFile -Force

# Get file size
$fileInfo = Get-Item $zipFile
$fileSizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
Write-Host "SUCCESS! Lambda Layer created: $zipFile" -ForegroundColor Green
Write-Host "File size: $fileSizeMB MB" -ForegroundColor Green
Write-Host ""

# Next steps
Write-Host "=== NEXT STEPS ===" -ForegroundColor Cyan
Write-Host "1. Go to AWS Lambda Console -> Layers" -ForegroundColor White
Write-Host "2. Click 'Create Layer'" -ForegroundColor White
Write-Host "3. Name: google-api-python-layer" -ForegroundColor White
Write-Host "4. Upload: $zipFile" -ForegroundColor White
Write-Host "5. Compatible runtimes: Python 3.9, Python 3.10, Python 3.11, Python 3.12" -ForegroundColor White
Write-Host "6. Add this layer to these Lambda functions:" -ForegroundColor White
Write-Host "   - gmail-watch-subscribe" -ForegroundColor Yellow
Write-Host "   - gmail-pubsub-handler" -ForegroundColor Yellow
Write-Host "   - gmail-processor" -ForegroundColor Yellow
Write-Host "   - gmail-token-manager" -ForegroundColor Yellow
Write-Host "   - oauth-exchange-token" -ForegroundColor Yellow
Write-Host "   - oauth-refresh-token" -ForegroundColor Yellow
Write-Host ""

# Clean up
Write-Host "Cleaning up temporary files..." -ForegroundColor Yellow
if (Test-Path $layerDir) {
    Remove-Item -Recurse -Force $layerDir
}

Write-Host "Done!" -ForegroundColor Green
