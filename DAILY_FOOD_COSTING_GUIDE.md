# Daily Food Costing Feature - Complete Documentation

## 🎯 Overview

The Daily Food Costing feature calculates the daily Cost of Goods Sold (COGS) and Food Cost Percentage to help restaurant managers track profitability and maintain healthy margins.

### Target Benchmark: 25%

---

## 📐 Core Formula

```
Daily COGS = Opening Inventory + Purchases − Closing Inventory

Food Cost % = (Daily COGS ÷ Net Sales) × 100
```

---

## 📦 Inventory Logic

- **Inventory is tracked daily**
- **Opening Inventory (Today)** = Closing Inventory (Yesterday)
- **Closing Inventory (Today)** is entered at end of day and becomes tomorrow's opening

---

## 📚 Data Sources

### 1. Inventory (DynamoDB)

**Table**: `daily-food-costing-inventory`

**Structure**:
```json
{
  "branch_email": "main_kitchen_user_at_example_dot_com",  // Partition Key
  "date": "2025-12-28",                                    // Sort Key
  "closingInventoryValue": 50000.00,
  "user_email": "user@example.com",
  "timestamp": "2025-12-28T18:30:00+05:30",
  "metadata": {
    "opening_inventory": 45000.00,
    "purchases": 12000.00,
    "closing_inventory": 50000.00,
    "daily_cogs": 7000.00,
    "net_sales": 28000.00,
    "food_cost_percentage": 25.00,
    "orders_count": 45
  }
}
```

**Query Logic**:
- Fetch yesterday's closing inventory → use as today's opening
- Save today's closing inventory after calculation

### 2. Purchases (S3 - Costing Module)

**Location**: `s3://costing-module-rohith/users/{email}/{branch}/{vendor}/processed_invoices/`

**Query Logic**:
- Sum all invoice `grand_total` values for the selected date
- Filter by branch and date pattern in filename: `invoice_{date}_{timestamp}.json`
- Exclude delivery records

**Example**:
```javascript
// Invoice structure
{
  "metadata": {
    "grand_total": 3500.50,
    "invoice_number": "INV-001",
    "date": "2025-12-28"
  },
  "categorized": { ... },
  "uncategorized": [ ... ]
}
```

### 3. Sales (RISTA API)

**Endpoint**: `GET https://api.ristaapps.com/v1/sales/page?branch={branchId}&day={date}`

**Included Channels** (only these count for food costing):
- ✅ Swiggy
- ✅ Zomato
- ✅ Takeaway - Swap
- ✅ Corporate Orders

**Excluded Channels**:
- ❌ Dine-in
- ❌ Other delivery channels

**Calculation**:
- Net Sales = Sum of `billAmount` for allowed channels (excluding voided orders)
- Sales are already net of GST in RISTA API

---

## 🖥️ Frontend Component

### Location
`src/pages/costing/DailyFoodCosting.jsx`

### Features

#### Inputs
1. **Branch Selector** (dropdown)
2. **Date Picker** (defaults to today)
3. **Closing Inventory Input** (manual entry at end of day)

#### Auto-Fetched Data
- Opening Inventory (from yesterday's closing)
- Purchases (from today's invoices)
- Sales (from today's RISTA data)

#### Display Results
- Opening Inventory
- Purchases
- Closing Inventory
- Daily COGS
- Total Sales
- Food Cost %

#### Visual Indicators
- 🟢 **Green** → Food Cost % ≤ 25% (Within Target)
- 🔴 **Red** → Food Cost % > 25% (Above Target)

---

## 🔌 Backend Lambda Function

### Location
`lambda-daily-food-costing/lambda_function.py`

### Endpoint
**POST** `/api/daily-food-costing/calculate`

### Request Body
```json
{
  "userEmail": "user@example.com",
  "branch": "Main Kitchen",
  "branchId": "MK",
  "date": "2025-12-28",
  "closingInventory": 50000.00
}
```

### Response
```json
{
  "success": true,
  "date": "2025-12-28",
  "branch": "Main Kitchen",
  "calculations": {
    "openingInventory": 45000.00,
    "purchases": 12000.00,
    "closingInventory": 50000.00,
    "dailyCogs": 7000.00,
    "netSales": 28000.00,
    "foodCostPercentage": 25.00
  },
  "salesDetails": {
    "ordersCount": 45,
    "grossSale": 28000.00,
    "gst": 2520.00
  },
  "status": {
    "isWithinTarget": true,
    "message": "Good"
  }
}
```

### Lambda Configuration

**Environment Variables**:
```
INVENTORY_TABLE=daily-food-costing-inventory
BUCKET_NAME=costing-module-rohith
VITE_RISTA_API_KEY=your-rista-api-key
VITE_RISTA_SECRET_KEY=your-rista-secret-key
```

**IAM Permissions Required**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/daily-food-costing-inventory"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::costing-module-rohith",
        "arn:aws:s3:::costing-module-rohith/*"
      ]
    }
  ]
}
```

**Timeout**: 60 seconds (to handle multiple API calls)
**Memory**: 512 MB

---

## 🔁 Workflow

### Daily Process

1. **Morning**: System automatically uses yesterday's closing as today's opening
2. **Throughout Day**: 
   - Purchases are recorded via invoice upload/manual entry
   - Sales happen through various channels
3. **End of Day**:
   - Manager enters closing inventory value
   - System fetches all data
   - Calculates COGS and Food Cost %
   - Saves closing inventory to DynamoDB
4. **Next Day**: Today's closing becomes tomorrow's opening

### Example Scenario

**Date**: December 28, 2025

**Data**:
- Opening Inventory (Dec 27 closing): ₹45,000
- Purchases (Dec 28): ₹12,000
- Closing Inventory (Dec 28): ₹50,000
- Sales (Dec 28): ₹28,000

**Calculation**:
```
COGS = 45,000 + 12,000 - 50,000 = ₹7,000
Food Cost % = (7,000 / 28,000) × 100 = 25.00%
```

**Status**: ✅ Within Target (≤ 25%)

---

## 🚀 Deployment Steps

### 1. Deploy Lambda Function

```bash
cd lambda-daily-food-costing

# Install dependencies (if any)
pip install -r requirements.txt -t .

# Create deployment package
zip -r deployment.zip .

# Deploy to AWS Lambda
aws lambda create-function \
  --function-name daily-food-costing \
  --runtime python3.11 \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-execution-role \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://deployment.zip \
  --timeout 60 \
  --memory-size 512 \
  --environment Variables="{
    INVENTORY_TABLE=daily-food-costing-inventory,
    BUCKET_NAME=costing-module-rohith,
    VITE_RISTA_API_KEY=your-key,
    VITE_RISTA_SECRET_KEY=your-secret
  }"
```

### 2. Create API Gateway Endpoint

1. Go to API Gateway Console
2. Create new REST API or add to existing
3. Create resource: `/daily-food-costing`
4. Create method: `POST`
5. Integration type: Lambda Function
6. Enable CORS
7. Deploy to stage

### 3. Update Frontend Configuration

Add to `.env`:
```
VITE_DASHBOARD_API=https://your-api-gateway-url.com/prod
```

### 4. Deploy Frontend

```bash
npm run build
# Deploy to your hosting service
```

---

## 🧪 Testing

### Test Lambda Function Locally

Create `test_event.json`:
```json
{
  "httpMethod": "POST",
  "body": "{\"userEmail\":\"test@example.com\",\"branch\":\"Main Kitchen\",\"branchId\":\"MK\",\"date\":\"2025-12-28\",\"closingInventory\":50000.00}"
}
```

Run test:
```bash
python -c "
import json
from lambda_function import lambda_handler

with open('test_event.json') as f:
    event = json.load(f)

result = lambda_handler(event, None)
print(json.dumps(result, indent=2))
"
```

### Test Frontend Component

1. Navigate to `/costing/daily-food-costing`
2. Select branch and date
3. Verify auto-fetched data loads
4. Enter closing inventory
5. Click "Calculate & Save"
6. Verify results display correctly
7. Check color indicators (green/red)

---

## 📊 DynamoDB Query Examples

### Get Yesterday's Closing Inventory
```python
from boto3.dynamodb.conditions import Key

table = dynamodb.Table('daily-food-costing-inventory')

response = table.get_item(
    Key={
        'branch_email': 'main_kitchen_user_at_example_dot_com',
        'date': '2025-12-27'
    }
)

if 'Item' in response:
    opening_inventory = float(response['Item']['closingInventoryValue'])
```

### Get Historical Data (Last 30 Days)
```python
from datetime import datetime, timedelta

end_date = datetime.now()
start_date = end_date - timedelta(days=30)

response = table.query(
    KeyConditionExpression=Key('branch_email').eq('main_kitchen_user_at_example_dot_com') & 
                          Key('date').between(
                              start_date.strftime('%Y-%m-%d'),
                              end_date.strftime('%Y-%m-%d')
                          ),
    ScanIndexForward=False  # Most recent first
)

history = response['Items']
```

---

## 🔍 Troubleshooting

### Issue: Opening Inventory Shows 0

**Cause**: No closing inventory recorded for yesterday

**Solution**: 
1. Manually enter yesterday's closing inventory via DynamoDB Console
2. Or accept 0 for first-time setup

### Issue: Purchases Not Fetching

**Cause**: 
- No invoices uploaded for the date
- S3 path format mismatch

**Solution**:
1. Check S3 bucket for invoice files
2. Verify invoice filenames match pattern: `invoice_{date}_{timestamp}.json`
3. Check Lambda CloudWatch logs for S3 errors

### Issue: Sales Data Not Loading

**Cause**:
- RISTA API credentials invalid
- Branch ID incorrect
- Network timeout

**Solution**:
1. Verify RISTA API credentials in Lambda environment
2. Test RISTA API with Postman/curl
3. Increase Lambda timeout if needed
4. Check CloudWatch logs for API errors

### Issue: Food Cost % Calculation Seems Wrong

**Cause**:
- Incorrect closing inventory entry
- Missing purchases
- Wrong channels included in sales

**Solution**:
1. Verify all input values
2. Check that only allowed channels are included
3. Review calculation breakdown in results panel

---

## 🎨 UI/UX Features

### Responsive Design
- Desktop: Two-column layout (input | results)
- Mobile: Stacked layout with collapsible sections

### Real-time Validation
- Required field indicators
- Number format validation
- Date range validation

### Loading States
- Skeleton loaders for auto-fetched data
- Button loading states during calculation
- Toast messages for success/error

### Visual Feedback
- Color-coded percentage (green ≤ 25%, red > 25%)
- Calculation breakdown with visual hierarchy
- Info cards with tips and channel information

---

## 📈 Future Enhancements

1. **Historical Trends**
   - Line chart showing Food Cost % over time
   - Weekly/Monthly averages
   - Comparison with previous periods

2. **Alerts & Notifications**
   - Email alert when Food Cost % exceeds threshold
   - Daily reminder to enter closing inventory
   - Weekly summary reports

3. **Analytics Dashboard**
   - Category-wise contribution to COGS
   - Vendor-wise purchase analysis
   - Channel-wise profitability

4. **Bulk Operations**
   - Import closing inventory from Excel
   - Export reports to CSV
   - Batch calculations for multiple branches

5. **Mobile App**
   - Quick entry of closing inventory on mobile
   - Push notifications for reminders
   - Offline mode with sync

---

## 🔐 Security Considerations

1. **Authentication**
   - User must be authenticated to access feature
   - Email verification for data access
   - Branch-level access control

2. **Data Privacy**
   - User data isolated in DynamoDB (partition key includes email)
   - S3 paths segregated by user
   - No cross-user data leakage

3. **API Security**
   - RISTA credentials stored in Lambda environment (encrypted)
   - API Gateway with throttling
   - CORS properly configured

---

## 📞 Support

For issues or questions:
- Check CloudWatch Logs for Lambda errors
- Review DynamoDB table structure
- Verify API Gateway configuration
- Test RISTA API connectivity

---

## 📄 License

This feature is part of the Swap Analytics Restaurant Management System.

---

**Last Updated**: December 28, 2025
**Version**: 1.0.0
