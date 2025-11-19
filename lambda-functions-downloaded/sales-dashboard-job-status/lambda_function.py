import json
import os
import boto3
from decimal import Decimal

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            # Preserve numeric values as int when possible
            try:
                return int(obj)
            except Exception:
                return float(obj)
        return super(DecimalEncoder, self).default(obj)

# Use the same JOBS_TABLE_NAME env var used elsewhere in the lambdas
JOBS_TABLE_NAME = os.environ.get("JOBS_TABLE_NAME")
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(JOBS_TABLE_NAME)

# Always return these headers so API Gateway / browser CORS checks succeed
CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
}

def lambda_handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        job_id = params.get("jobId")
        if not job_id:
            return {"statusCode": 400, "headers": CORS_HEADERS, "body": json.dumps({"error": "Missing jobId"})}

        # Log jobId for debugging
        print(f"jobStatus.py: Received jobId={job_id}")

        response = table.get_item(Key={'jobId': job_id})
        print(f"jobStatus.py: DynamoDB response={response}")
        item = response.get('Item', {})

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps(item, cls=DecimalEncoder)
        }
    except Exception as e:
        # Log error for debugging
        print(f"jobStatus.py: Exception={str(e)}")
        # Ensure CORS headers are present even on error paths
        return {"statusCode": 500, "headers": CORS_HEADERS, "body": json.dumps({"error": str(e)})}
