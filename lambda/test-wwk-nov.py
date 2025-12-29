"""
Test rista-fetch-sales Lambda function locally for WWK Nov 1-30
"""
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the Lambda function
import sys
import importlib.util
spec = importlib.util.spec_from_file_location("rista_fetch_sales", "rista-fetch-sales.py")
rista_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rista_module)
lambda_handler = rista_module.lambda_handler

# Create test event
event = {
    "body": json.dumps({
        "branchId": "WWR",
        "startDate": "2025-11-01",
        "endDate": "2025-11-30",
        "channelName": "takeaway",
        "groupBy": "total"
    })
}

# Mock context
class Context:
    def __init__(self):
        self.function_name = "rista-fetch-sales"
        self.memory_limit_in_mb = 128
        self.invoked_function_arn = "arn:aws:lambda:local:test"
        self.aws_request_id = "test-request-id"

context = Context()

# Set environment variables if not already set
if not os.environ.get("VITE_RISTA_API_KEY"):
    print("⚠️  Warning: VITE_RISTA_API_KEY not found in environment")
if not os.environ.get("VITE_RISTA_SECRET_KEY"):
    print("⚠️  Warning: VITE_RISTA_SECRET_KEY not found in environment")

print(f"{'='*60}")
print(f"🧪 Testing Lambda Function Locally")
print(f"📅 Branch: WWR (WeWork Roshini)")
print(f"📅 Date Range: 2025-11-01 to 2025-11-30")
print(f"📦 Channel: takeaway")
print(f"{'='*60}\n")

# Execute the Lambda function
try:
    response = lambda_handler(event, context)
    
    print(f"\n{'='*60}")
    print(f"✅ Status Code: {response['statusCode']}")
    print(f"{'='*60}\n")
    
    # Parse and save the response
    if response['statusCode'] == 200:
        body = json.loads(response['body'])
        
        # Save to file
        with open('wwk-nov-response.json', 'w', encoding='utf-8') as f:
            json.dump(body, f, indent=2, ensure_ascii=False)
        
        print(f"📊 Response saved to: wwk-nov-response.json\n")
        
        # Print summary
        if 'body' in body and 'consolidatedInsights' in body['body']:
            insights = body['body']['consolidatedInsights']
            print("📈 Summary:")
            print(f"   Orders: {insights.get('noOfOrders', 0)}")
            print(f"   Gross Sale: ₹{insights.get('grossSale', 0):,.2f}")
            print(f"   GST: ₹{insights.get('gstOnOrder', 0):,.2f}")
            print(f"   Discounts: ₹{insights.get('discounts', 0):,.2f}")
            print(f"   Net Sale: ₹{insights.get('netSale', 0):,.2f}")
            print(f"   Payout: ₹{insights.get('payout', 0):,.2f}")
            
            if 'dataCoverage' in body:
                print(f"\n   Data Coverage: {body['dataCoverage']}")
            if 'missingDates' in body and body['missingDates']:
                print(f"   Missing Dates: {', '.join(body['missingDates'][:5])}")
                if len(body['missingDates']) > 5:
                    print(f"   ... and {len(body['missingDates']) - 5} more")
        
    else:
        print(f"❌ Error: {response.get('body', 'Unknown error')}")
        
except Exception as e:
    print(f"❌ Error executing Lambda function: {str(e)}")
    import traceback
    traceback.print_exc()
