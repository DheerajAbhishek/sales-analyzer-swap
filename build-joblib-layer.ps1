# Build Lambda Layer for Joblib
# This creates a zip file that can be uploaded as a Lambda Layer

Write-Host "Building Lambda Layer for Joblib..." -ForegroundColor Cyan

# Create temporary directory structure
$layerDir = "joblib-layer"
$pythonDir = Join-Path $layerDir "python"

# Clean up if exists
if (Test-Path $layerDir) {
    Write-Host "Cleaning up existing layer directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $layerDir
}

# Create directory structure
New-Item -ItemType Directory -Path $pythonDir -Force | Out-Null
Write-Host "Installing Joblib to $pythonDir..." -ForegroundColor Cyan

# Install Joblib and its dependencies
pip install --target $pythonDir `
    joblib `
    --upgrade

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install Joblib" -ForegroundColor Red
    exit 1
}

Write-Host "Joblib installed successfully!" -ForegroundColor Green

Write-Host "Creating layer zip file..." -ForegroundColor Cyan

# Create zip file
$zipFile = "joblib-lambda-layer.zip"
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
Write-Host "Layer Name: joblib-lambda-layer" -ForegroundColor White
Write-Host "File: $zipFile" -ForegroundColor White
Write-Host "Compatible Runtimes: Python 3.9, Python 3.10, Python 3.11, Python 3.12" -ForegroundColor White
Write-Host "Use Case: Parallel computing, persistence utilities" -ForegroundColor White
Write-Host ""

# Clean up
Write-Host "Cleaning up temporary files..." -ForegroundColor Yellow
if (Test-Path $layerDir) {
    Remove-Item -Recurse -Force $layerDir
}

Write-Host "Joblib layer build complete!" -ForegroundColor Green