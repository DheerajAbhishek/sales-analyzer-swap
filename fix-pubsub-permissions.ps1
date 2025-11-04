# Fix Google Cloud Pub/Sub Permissions for Gmail Push Notifications
# Run this if you have gcloud CLI installed

Write-Host "Setting up Pub/Sub permissions for Gmail API..." -ForegroundColor Cyan
Write-Host ""

# Variables - UPDATE THESE
$PROJECT_ID = "YOUR_GCP_PROJECT_ID"  # e.g., "my-project-12345"
$TOPIC_NAME = "gmail-notifications"

Write-Host "Project ID: $PROJECT_ID" -ForegroundColor Yellow
Write-Host "Topic: $TOPIC_NAME" -ForegroundColor Yellow
Write-Host ""

# Check if gcloud is installed
$gcloudInstalled = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloudInstalled) {
    Write-Host "ERROR: gcloud CLI is not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install gcloud CLI or use the Google Cloud Console method instead:" -ForegroundColor Yellow
    Write-Host "1. Go to https://console.cloud.google.com/" -ForegroundColor White
    Write-Host "2. Navigate to Pub/Sub -> Topics -> $TOPIC_NAME" -ForegroundColor White
    Write-Host "3. Click PERMISSIONS tab" -ForegroundColor White
    Write-Host "4. Add Principal: gmail-api-push@system.gserviceaccount.com" -ForegroundColor White
    Write-Host "5. Role: Pub/Sub Publisher" -ForegroundColor White
    exit 1
}

# Confirm before running
Write-Host "This will grant 'Pub/Sub Publisher' role to gmail-api-push@system.gserviceaccount.com" -ForegroundColor Yellow
$confirm = Read-Host "Continue? (y/n)"
if ($confirm -ne 'y') {
    Write-Host "Cancelled" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "Granting permissions..." -ForegroundColor Cyan

# Grant permission
gcloud pubsub topics add-iam-policy-binding $TOPIC_NAME `
    --project=$PROJECT_ID `
    --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" `
    --role="roles/pubsub.publisher"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS! Permissions granted." -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now test the Gmail watch subscription again!" -ForegroundColor Cyan
}
else {
    Write-Host ""
    Write-Host "ERROR: Failed to grant permissions" -ForegroundColor Red
    Write-Host "Please use the Google Cloud Console method instead" -ForegroundColor Yellow
}
