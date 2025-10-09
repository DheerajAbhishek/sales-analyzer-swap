import json
import os
import re
import boto3

# It's good practice to initialize the client and environment variables
# outside the handler for performance reasons (re-use across invocations).
s3 = boto3.client("s3")
BUCKET = os.environ.get("BUCKET_NAME")


def _sanitize_email_for_key(email: str) -> str:
    """Make a filesystem/s3-safe folder name from an email address.
    Keeps it deterministic and reversible-enough for partitioning.
    """
    if not email:
        return "unknown"
    e = email.strip().lower()
    # replace @ and dots and any non-alnum with underscores
    e = e.replace("@", "_at_")
    e = e.replace(".", "_dot_")
    e = re.sub(r"[^a-z0-9_\-]", "_", e)
    return e


def lambda_handler(event, context):
    """
    Handles API Gateway requests to generate a presigned S3 URL for file uploads.
    Includes robust CORS header handling for both success and error responses.
    """
    # --- THIS IS THE KEY ---
    # Define the CORS headers in one place so they can be used in both the
    # success and error responses. This ensures the browser always gets
    # the headers it needs.
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    }

    try:
        # Check for bucket configuration first
        if not BUCKET:
            # Raising an exception is cleaner and will be caught by the except block
            raise ValueError("Configuration error: BUCKET_NAME environment variable is not set.")

        body = json.loads(event.get("body") or "{}")
        filename = body.get("filename")
        if not filename:
             raise ValueError("Validation error: 'filename' is required in the request body.")

        business_email = body.get("businessEmail") or body.get("business_email")

        # Determine the S3 key based on whether an email is provided
        if business_email:
            user_folder = _sanitize_email_for_key(business_email)
            key = f"users/{user_folder}/uploads/{filename}"
        else:
            key = f"uploads/{filename}"

        print(f"Generating presigned URL for Bucket: {BUCKET}, Key: {key}")

        # Use a presigned POST (url + fields) so the frontend can upload via FormData (avoids CORS preflight)
        content_type = body.get("contentType", "application/octet-stream")
        # You can add conditions here if you want (e.g., content-length-range)
        post_fields = {"key": key}
        # If you want to enforce content type, include it in fields and conditions
        # but many clients omit content-type in form uploads; we'll allow any content-type

        presigned_post = s3.generate_presigned_post(
            Bucket=BUCKET,
            Key=key,
            ExpiresIn=900
        )

        print(f"Successfully generated presigned POST.")

        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({"url": presigned_post.get("url"), "fields": presigned_post.get("fields"), "key": key})
        }
    except Exception as e:
        # Log the actual error to CloudWatch for easier debugging
        print(f"An error occurred: {e}")

        # --- THE FIX ---
        # Return a 500 status code BUT INCLUDE THE CORS HEADERS.
        # Without this, the browser will show a CORS error instead of the real error.
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": str(e)})
        }
