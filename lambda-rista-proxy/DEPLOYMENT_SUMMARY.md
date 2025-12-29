# Food Costing Endpoint - Deployment Summary

## ✅ Deployment Complete

**Lambda Function:** `rista-food-costing-proxy`  
**Region:** `ap-south-1`  
**API Gateway:** `xiphvj43ij`  
**Stage:** `Prod`

## 🌐 Endpoint URLs

### Direct Path (Recommended)
```
GET https://xiphvj43ij.execute-api.ap-south-1.amazonaws.com/Prod/food-costing
```

**Query Parameters:**
- `branchId` (required) - Branch code (e.g., "WWK", "RJP")
- `day` (required) - Date in YYYY-MM-DD format (e.g., "2025-12-20")

**Example:**
```bash
curl "https://xiphvj43ij.execute-api.ap-south-1.amazonaws.com/Prod/food-costing?branchId=WWK&day=2025-12-20"
```

## 📦 Response Format

```json
{
  "branchId": "WWK",
  "day": "2025-12-20",
  "opening": {
    "totalAmount": 150000.50
  },
  "purchases": {
    "totalAmount": 25000.00
  },
  "closing": {
    "totalAmount": 140000.00
  },
  "sales": {
    "noOfOrders": 45,
    "grossSale": 55000.00,
    "netSale": 50000.00
  },
  "results": {
    "dailyCogs": 35000.50,
    "foodCostPct": 70.00,
    "targetPct": 25
  }
}
```

## 🔑 Environment Variables (Configured)

- ✅ `RISTA_API_URL`: `https://api.ristaapps.com/v1`
- ✅ `RISTA_API_KEY`: Configured from .env
- ✅ `RISTA_SECRET_KEY`: Configured from .env

## 🎯 How It Works

1. **Opening Inventory**: Fetches previous day's audit total
2. **Purchases**: Fetches current day's PO total
3. **Closing Inventory**: Fetches current day's audit total
4. **Sales**: Aggregates all sales channels for the day
5. **Calculates**:
   - Daily COGS = Opening + Purchases - Closing
   - Food Cost % = (COGS / Net Sales) × 100

## 🧪 Testing

### Test with PowerShell
```powershell
$url = "https://xiphvj43ij.execute-api.ap-south-1.amazonaws.com/Prod/food-costing?branchId=WWK&day=2025-12-15"
Invoke-RestMethod -Uri $url -Method Get | ConvertTo-Json -Depth 5
```

### Test with curl
```bash
curl -s "https://xiphvj43ij.execute-api.ap-south-1.amazonaws.com/Prod/food-costing?branchId=WWK&day=2025-12-15" | jq
```

## 🔧 Lambda Configuration

**Runtime:** Python 3.11  
**Handler:** `lambda_function.lambda_handler`  
**Timeout:** 30 seconds  
**Memory:** 256 MB  
**Deployment Package:** Standard library only (no external dependencies)

## 📱 Frontend Integration

The frontend is already configured to use this endpoint via `ristaService.fetchFoodCostingDaily()`:

```javascript
// src/services/api.js
async fetchFoodCostingDaily(branchId, day) {
    const url = `${API_BASE_URL}?mode=food-costing&branchId=${branchId}&day=${day}`
    const response = await fetch(url, { method: 'GET' })
    // ... handles response
}
```

The Daily Food Costing page (`src/pages/costing/DailyFoodCosting.jsx`) automatically calls this when a branch and date are selected.

## 🚀 Deployment Files

- **Lambda Function:** `lambda-rista-proxy/lambda_function.py`
- **Deployment Script:** `lambda-rista-proxy/deploy-food-costing.ps1`
- **Package:** `lambda-rista-proxy/lambda-deployment.zip`

## 📊 API Gateway Resources

```
/food-costing
├── GET   → Lambda: rista-food-costing-proxy
└── POST  → Lambda: rista-food-costing-proxy
```

## ⚡ Quick Commands

### Update Lambda Code
```powershell
cd lambda-rista-proxy
Compress-Archive -Path lambda_function.py -DestinationPath lambda-deployment.zip -Force
aws lambda update-function-code --function-name rista-food-costing-proxy --zip-file fileb://lambda-deployment.zip --region ap-south-1
```

### Update Environment Variables
```powershell
aws lambda update-function-configuration `
    --function-name rista-food-costing-proxy `
    --environment "Variables={RISTA_API_URL=https://api.ristaapps.com/v1,RISTA_API_KEY=your-key,RISTA_SECRET_KEY=your-secret}" `
    --region ap-south-1
```

### View Logs
```powershell
aws logs tail /aws/lambda/rista-food-costing-proxy --follow --region ap-south-1
```

## ✨ Features

- ✅ No external dependencies (Python standard library only)
- ✅ JWT generation for Rista API authentication
- ✅ CORS headers configured
- ✅ Automatic aggregation of all inventory and sales data
- ✅ Error handling with proper HTTP status codes
- ✅ Environment variable support for credentials

## 📝 Notes

- The endpoint returns `0.0` values when no data exists for the specified date
- All amounts are in the default currency (INR)
- Sales aggregation includes all channels (Swiggy, Zomato, Takeaway, Corporate)
- The target food cost percentage is set to 25%

## 🔍 Troubleshooting

### If you get authentication errors:
1. Verify Lambda environment variables are set correctly
2. Check CloudWatch Logs: `/aws/lambda/rista-food-costing-proxy`

### If you get "Missing Authentication Token":
- Use the direct path: `/food-costing?...`
- Root-mode (`?mode=food-costing`) requires additional Lambda configuration

### If data is missing:
- Verify the branch code is correct
- Ensure the date has audit/PO/sales data in Rista
- Check that previous day has an audit for opening inventory
