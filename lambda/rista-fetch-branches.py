import json
import time
import jwt
import requests

def lambda_handler(event, context):
    """
    Lambda function to fetch branches from Rista API.
    Expects apiKey and secretKey in the request body.
    """
    print(f"Received event: {json.dumps(event)}")
    
    # CORS headers
    cors_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
    }
    
    # Handle OPTIONS preflight request
    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({"message": "OK"})
        }
    
    try:
        # Parse request body
        body = event.get("body", "{}")
        if isinstance(body, str):
            body = json.loads(body)
        
        api_key = body.get("apiKey")
        secret_key = body.get("secretKey")
        
        if not api_key or not secret_key:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "Missing apiKey or secretKey"})
            }
        
        # Generate JWT token
        payload = {
            "iss": api_key,
            "iat": int(time.time()),
            "jti": f"req_{int(time.time() * 1000)}"
        }
        token = jwt.encode(payload, secret_key, algorithm="HS256")
        
        # Call Rista API
        headers = {
            "x-api-token": token,
            "x-api-key": api_key,
            "Content-Type": "application/json"
        }
        
        response = requests.get(
            "https://api.ristaapps.com/v1/branch/list",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            return {
                "statusCode": response.status_code,
                "headers": cors_headers,
                "body": json.dumps({
                    "error": f"Rista API error: {response.status_code}",
                    "details": response.text
                })
            }
        
        branches_data = response.json()
        
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps(branches_data)
        }
        
    except json.JSONDecodeError as e:
        return {
            "statusCode": 400,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Invalid JSON: {str(e)}"})
        }
    except requests.exceptions.RequestException as e:
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Request failed: {str(e)}"})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"})
        }
