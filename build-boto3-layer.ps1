# Build Lambda Layer for Boto3
# This creates a zip file that can be uploaded as a Lambda Layer

Write-Host "Building Lambda Layer for Boto3..." -ForegroundColor Cyan

# Create temporary directory structure
$layerDir = "boto3-layer"
$pythonDir = Join-Path $layerDir "python"

# Clean up if exists
if (Test-Path $layerDir) {
    Write-Host "Cleaning up existing layer directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $layerDir
}

# Create directory structure
New-Item -ItemType Directory -Path $pythonDir -Force | Out-Null
Write-Host "Installing Boto3 to $pythonDir..." -ForegroundColor Cyan

# Install Boto3 and botocore (latest versions)
# Note: AWS Lambda runtime includes boto3/botocore, but this ensures latest version
pip install --target $pythonDir `
    boto3 `
    botocore `
    --upgrade

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install Boto3" -ForegroundColor Red
    exit 1
}

Write-Host "Boto3 installed successfully!" -ForegroundColor Green

Write-Host "Creating layer zip file..." -ForegroundColor Cyan

# Create zip file
$zipFile = "boto3-lambda-layer.zip"
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

# Show layer information
Write-Host "=== LAYER INFORMATION ===" -ForegroundColor Cyan
Write-Host "Layer Name: boto3-lambda-layer" -ForegroundColor White
Write-Host "File: $zipFile" -ForegroundColor White
Write-Host "Compatible Runtimes: Python 3.9, Python 3.10, Python 3.11, Python 3.12" -ForegroundColor White
Write-Host "Includes: boto3, botocore, s3transfer, jmespath, urllib3" -ForegroundColor White
Write-Host "Use Case: AWS service interactions" -ForegroundColor White
Write-Host ""
Write-Host "NOTE: AWS Lambda runtime includes boto3/botocore by default." -ForegroundColor Yellow
Write-Host "This layer provides the latest versions for enhanced features." -ForegroundColor Yellow
Write-Host ""

# Clean up
Write-Host "Cleaning up temporary files..." -ForegroundColor Yellow
if (Test-Path $layerDir) {
    Remove-Item -Recurse -Force $layerDir
}

Write-Host "Boto3 layer build complete!" -ForegroundColor Green