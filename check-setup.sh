#!/bin/bash

echo "🚀 Sales Dashboard N8N Integration Setup Test"
echo "=============================================="

# Test 1: Check if backend dependencies are installed
echo "✅ 1. Checking backend dependencies..."
if [ -d "backend/node_modules" ]; then
    echo "   ✓ Backend dependencies installed"
else
    echo "   ❌ Backend dependencies missing. Run: cd backend && npm install"
    exit 1
fi

# Test 2: Check if .env file exists
echo "✅ 2. Checking environment configuration..."
if [ -f "backend/.env" ]; then
    echo "   ✓ Backend .env file exists"
else
    echo "   ❌ Backend .env file missing. Run: cd backend && cp .env.example .env"
    exit 1
fi

# Test 3: Check if frontend environment is configured
echo "✅ 3. Checking frontend environment..."
if grep -q "VITE_BACKEND_URL" .env; then
    echo "   ✓ Frontend configured for backend communication"
else
    echo "   ❌ Add VITE_BACKEND_URL=http://localhost:3001 to your .env file"
    exit 1
fi

echo ""
echo "🎉 Setup complete! Here's how to start everything:"
echo ""
echo "Terminal 1 - Start n8n:"
echo "  n8n start"
echo ""
echo "Terminal 2 - Start backend:"
echo "  cd backend"
echo "  npm run dev"
echo ""
echo "Terminal 3 - Start frontend:"
echo "  npm run dev"
echo ""
echo "📋 Next steps:"
echo "1. Get n8n API key from http://localhost:5678/settings/api"
echo "2. Add N8N_API_KEY to backend/.env"
echo "3. Test Google login to automatically create email workflow"
echo ""
echo "📖 See N8N_INTEGRATION_GUIDE.md for detailed instructions"