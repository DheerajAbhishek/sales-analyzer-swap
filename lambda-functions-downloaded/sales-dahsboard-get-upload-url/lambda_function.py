import json
import os
import re
import boto3

# Get the region from environment or use default
REGION = os.environ.get("AWS_REGION", "us-east-1")  # ← Add this
s3 = boto3.client("s3", region_name=REGION)  # ← Specify region
BUCKET = os.environ.get("BUCKET_NAME")

def _sanitize_email_for_key(email: str) -> str:
    """Make a filesystem/s3-safe folder name from an email address."""
    if not email:
        return "unknown"
    e = email.strip().lower()
    e = e.replace("@", "_at_")
    e = e.replace(".", "_dot_")
    e = re.sub(r"[^a-z0-9_\-]", "_", e)
    return e

def lambda_handler(event, context):
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    }
    
    try:
        if not BUCKET:
            raise ValueError("Configuration error: BUCKET_NAME environment variable is not set.")
        
        body = json.loads(event.get("body") or "{}")
        filename = body.get("filename")
        if not filename:
            raise ValueError("Validation error: 'filename' is required in the request body.")
        
        business_email = body.get("businessEmail") or body.get("business_email")
        
        if business_email:
            user_folder = _sanitize_email_for_key(business_email)
            key = f"users/{user_folder}/uploads/{filename}"
        else:
            key = f"uploads/{filename}"
        
        print(f"Generating presigned URL for Bucket: {BUCKET}, Key: {key}")
        
        # Generate presigned POST with explicit region
        presigned_post = s3.generate_presigned_post(
            Bucket=BUCKET,
            Key=key,
            ExpiresIn=900
        )
        
        # ← THE FIX: Ensure the URL uses the regional endpoint
        # The boto3 client should already return the correct URL, but we can verify
        url = presigned_post.get("url")
        
        # If it's using the global endpoint, replace with regional
        if ".s3.amazonaws.com" in url and f".s3.{REGION}.amazonaws.com" not in url:
            url = url.replace(".s3.amazonaws.com", f".s3.{REGION}.amazonaws.com")
        
        print(f"Successfully generated presigned POST with URL: {url}")
        
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({
                "url": url,  # ← Use the corrected URL
                "fields": presigned_post.get("fields"),
                "key": key
            })
        }
    except Exception as e:
        print(f"An error occurred: {e}")
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": str(e)})
        }