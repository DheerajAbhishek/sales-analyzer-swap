import json
import boto3
from botocore.exceptions import ClientError

ssm_client = boto3.client('ssm', region_name='ap-south-1')

def lambda_handler(event, context):
    """
    Lambda function to manage Rista API credentials in SSM Parameter Store.
    GET: Retrieve credentials for a user
    POST: Save credentials for a user
    """
    print(f"Received event: {json.dumps(event)}")
    
    # CORS headers
    cors_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,business-email",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
    }
    
    # Handle OPTIONS preflight request
    http_method = event.get("httpMethod", "")
    if http_method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({"message": "OK"})
        }
    
    try:
        # Get business email from headers or query params
        headers = event.get("headers", {}) or {}
        query_params = event.get("queryStringParameters", {}) or {}
        
        # Case-insensitive header lookup
        business_email = None
        for key, value in headers.items():
            if key.lower() == "business-email":
                business_email = value
                break
        
        if not business_email:
            business_email = query_params.get("businessEmail")
        
        if not business_email:
            return {
                "statusCode": 400,
                "headers": cors_headers,
                "body": json.dumps({"error": "business-email header or businessEmail query param required"})
            }
        
        # Sanitize email for parameter name (replace @ and . with _)
        safe_email = business_email.replace("@", "_at_").replace(".", "_")
        param_name_api_key = f"/sales-dashboard/rista/{safe_email}/api-key"
        param_name_secret = f"/sales-dashboard/rista/{safe_email}/api-secret"
        
        if http_method == "GET":
            # Retrieve credentials
            try:
                api_key_response = ssm_client.get_parameter(
                    Name=param_name_api_key,
                    WithDecryption=True
                )
                secret_response = ssm_client.get_parameter(
                    Name=param_name_secret,
                    WithDecryption=True
                )
                
                return {
                    "statusCode": 200,
                    "headers": cors_headers,
                    "body": json.dumps({
                        "success": True,
                        "hasCredentials": True,
                        "apiKey": api_key_response["Parameter"]["Value"],
                        "apiSecret": secret_response["Parameter"]["Value"]
                    })
                }
            except ssm_client.exceptions.ParameterNotFound:
                return {
                    "statusCode": 200,
                    "headers": cors_headers,
                    "body": json.dumps({
                        "success": True,
                        "hasCredentials": False
                    })
                }
        
        elif http_method == "POST":
            # Save credentials
            body = event.get("body", "{}")
            if isinstance(body, str):
                body = json.loads(body)
            
            api_key = body.get("apiKey")
            api_secret = body.get("apiSecret")
            
            if not api_key or not api_secret:
                return {
                    "statusCode": 400,
                    "headers": cors_headers,
                    "body": json.dumps({"error": "apiKey and apiSecret are required"})
                }
            
            # Store API key (SecureString)
            ssm_client.put_parameter(
                Name=param_name_api_key,
                Value=api_key,
                Type="SecureString",
                Overwrite=True,
                Description=f"Rista API Key for {business_email}"
            )
            
            # Store API secret (SecureString)
            ssm_client.put_parameter(
                Name=param_name_secret,
                Value=api_secret,
                Type="SecureString",
                Overwrite=True,
                Description=f"Rista API Secret for {business_email}"
            )
            
            return {
                "statusCode": 200,
                "headers": cors_headers,
                "body": json.dumps({
                    "success": True,
                    "message": "Credentials saved successfully"
                })
            }
        
        else:
            return {
                "statusCode": 405,
                "headers": cors_headers,
                "body": json.dumps({"error": f"Method {http_method} not allowed"})
            }
    
    except ClientError as e:
        print(f"AWS Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": f"AWS error: {str(e)}"})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"})
        }
