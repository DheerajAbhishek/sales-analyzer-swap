import json
import time
import jwt
import requests

API_KEY = '4b78002c-adc1-44b7-b588-7e1fec58d977'
SECRET_KEY = 'pcQmKBT39KtFVRwY8Vl3SSKNqL8Agdrk71id9OBB5uY'
BRANCH_ID = 'MN'
TEST_DATE = '2025-12-20'

payload = {
    'iss': API_KEY,
    'iat': int(time.time()),
    'jti': f'req_{int(time.time() * 1000)}_{TEST_DATE}_initial'
}
token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')

url = f'https://api.ristaapps.com/v1/sales/page?branch={BRANCH_ID}&day={TEST_DATE}'
headers = {
    'x-api-token': token,
    'x-api-key': API_KEY,
    'Content-Type': 'application/json'
}

response = requests.get(url, headers=headers, timeout=20)
data = response.json()

print('=== RESPONSE STRUCTURE ===')
print(f'Keys: {list(data.keys())}')
if 'data' in data and len(data['data']) > 0:
    print(f'\nTotal orders: {len(data["data"])}')
    print('\n=== SAMPLE ORDER (first) ===')
    sample = data['data'][0]
    print(json.dumps(sample, indent=2))
    
    # Look for takeaway orders
    takeaway_orders = [o for o in data['data'] if o.get('channel') == 'Take Away']
    if takeaway_orders:
        print(f'\n=== TAKEAWAY ORDERS COUNT: {len(takeaway_orders)} ===')
        print('\n=== SAMPLE TAKEAWAY ORDER ===')
        print(json.dumps(takeaway_orders[0], indent=2))
