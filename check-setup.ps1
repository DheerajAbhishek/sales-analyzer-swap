Write-Host "Sales Dashboard N8N Integration Setup Test" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

# Test 1: Check if backend dependencies are installed
Write-Host "1. Checking backend dependencies..." -ForegroundColor Yellow
if (Test-Path "backend/node_modules") {
    Write-Host "   Backend dependencies installed" -ForegroundColor Green
}
else {
    Write-Host "   Backend dependencies missing. Run: cd backend; npm install" -ForegroundColor Red
    exit 1
}

# Test 2: Check if .env file exists
Write-Host "2. Checking environment configuration..." -ForegroundColor Yellow
if (Test-Path "backend/.env") {
    Write-Host "   Backend .env file exists" -ForegroundColor Green
}
else {
    Write-Host "   Backend .env file missing. Run: cd backend; copy .env.example .env" -ForegroundColor Red
    exit 1
}

# Test 3: Check if frontend environment is configured
Write-Host "3. Checking frontend environment..." -ForegroundColor Yellow
try {
    $content = Get-Content ".env" -Raw
    if ($content -match "VITE_BACKEND_URL") {
        Write-Host "   Frontend configured for backend communication" -ForegroundColor Green
    }
    else {
        Write-Host "   Add VITE_BACKEND_URL=http://localhost:3001 to your .env file" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "   Could not read .env file" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Setup complete! Here's how to start everything:" -ForegroundColor Green
Write-Host ""
Write-Host "Terminal 1 - Start n8n:" -ForegroundColor Cyan
Write-Host "  n8n start" -ForegroundColor White
Write-Host ""
Write-Host "Terminal 2 - Start backend:" -ForegroundColor Cyan
Write-Host "  cd backend" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Terminal 3 - Start frontend:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Get n8n API key from http://localhost:5678/settings/api" -ForegroundColor White
Write-Host "2. Add N8N_API_KEY to backend/.env" -ForegroundColor White
Write-Host "3. Test Google login to automatically create email workflow" -ForegroundColor White