import os
import json
from lambda.fetch_sales_data import lambda_handler # Import the actual handler

# --- Mock Environment Variables ---
# IMPORTANT: Replace with your actual Rista API credentials and URL
os.environ['VITE_RISTA_API_KEY'] = 'YOUR_API_KEY'
os.environ['VITE_RISTA_SECRET_KEY'] = 'YOUR_SECRET_KEY'
os.environ['VITE_RISTA_API_URL'] = 'https://api.ristaapps.com/v1'

# --- Sample API Gateway Event ---
# This simulates the event structure from API Gateway when using query string parameters
sample_event = {
    "queryStringParameters": {
        "branchId": "WWK", # Replace with a branch ID that has data (e.g., from your get-branches.js output)
        "startDate": "2025-10-03",
        "endDate": "2025-10-03"
    },
    # Other potential fields in a real API Gateway event are usually not
    # strictly necessary for this specific handler's logic:
    # "httpMethod": "GET",
    # "path": "/get-consolidated-insights",
    # "headers": { ... },
    # "requestContext": { ... }
}

# --- Invoke the Lambda Handler ---
print("Invoking lambda_handler with sample event...")
response = lambda_handler(sample_event, None) # context is usually not used in simple cases

print("\n--- Lambda Response ---")
print(f"Status Code: {response.get('statusCode')}")
print("Headers:", response.get('headers'))

# Try to pretty-print the body if it's JSON
try:
    body = json.loads(response.get('body'))
    print("Body:", json.dumps(body, indent=2))
except json.JSONDecodeError:
    print("Body:", response.get('body'))

print("-----------------------")

# Basic checks
if response.get('statusCode') == 200:
    print("\n✅ Lambda invoked successfully!")
else:
    print("\n❌ Lambda invocation failed or returned an error.")
