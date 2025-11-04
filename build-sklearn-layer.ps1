# Build Lambda Layer for Scikit-learn
# This creates a zip file that can be uploaded as a Lambda Layer

Write-Host "Building Lambda Layer for Scikit-learn..." -ForegroundColor Cyan

# Create temporary directory structure
$layerDir = "sklearn-layer"
$pythonDir = Join-Path $layerDir "python"

# Clean up if exists
if (Test-Path $layerDir) {
    Write-Host "Cleaning up existing layer directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $layerDir
}

# Create directory structure
New-Item -ItemType Directory -Path $pythonDir -Force | Out-Null
Write-Host "Installing Scikit-learn to $pythonDir..." -ForegroundColor Cyan

# Install Scikit-learn and its core dependencies
# Note: This will also install numpy, scipy, and joblib as dependencies
pip install --target $pythonDir `
    scikit-learn `
    --upgrade

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install Scikit-learn" -ForegroundColor Red
    exit 1
}

Write-Host "Scikit-learn installed successfully!" -ForegroundColor Green

Write-Host "Creating layer zip file..." -ForegroundColor Cyan

# Create zip file
$zipFile = "scikit-learn-lambda-layer.zip"
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

# Warning about size
if ($fileSizeMB -gt 250) {
    Write-Host "WARNING: Layer size is over 250MB - consider optimizing or splitting" -ForegroundColor Red
}

Write-Host ""

# Show layer information
Write-Host "=== LAYER INFORMATION ===" -ForegroundColor Cyan
Write-Host "Layer Name: scikit-learn-lambda-layer" -ForegroundColor White
Write-Host "File: $zipFile" -ForegroundColor White
Write-Host "Compatible Runtimes: Python 3.9, Python 3.10, Python 3.11, Python 3.12" -ForegroundColor White
Write-Host "Includes: scikit-learn, numpy, scipy, joblib, threadpoolctl" -ForegroundColor White
Write-Host "Use Case: Machine learning algorithms and data analysis" -ForegroundColor White
Write-Host ""

# Clean up
Write-Host "Cleaning up temporary files..." -ForegroundColor Yellow
if (Test-Path $layerDir) {
    Remove-Item -Recurse -Force $layerDir
}

Write-Host "Scikit-learn layer build complete!" -ForegroundColor Green