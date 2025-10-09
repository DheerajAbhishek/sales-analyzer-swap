import json
import os
import boto3
import logging
import uuid
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')

PROCESSING_LAMBDA_NAME = os.environ.get("PROCESSING_LAMBDA_NAME")
JOBS_TABLE_NAME = os.environ.get("JOBS_TABLE_NAME")

def lambda_handler(event, context):
    try:
        jobs_table = dynamodb.Table(JOBS_TABLE_NAME)
        data = json.loads(event.get("body", "{}"))
        files_to_process = data.get("files", [])
        business_email = data.get("businessEmail") or data.get("business_email")

        if not files_to_process:
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": json.dumps({"error": "No files provided."})
            }

        job_id = str(uuid.uuid4())
        jobs_table.put_item(Item={
            'jobId': job_id,
            'totalFiles': len(files_to_process),
            'processedCount': 0,
            'status': 'IN_PROGRESS',
            'startTime': int(time.time())
        })

        logger.info(f"Starting job {job_id} for {len(files_to_process)} files.")

        for filename in files_to_process:
            qparams = {"filename": filename}
            if business_email:
                qparams["businessEmail"] = business_email

            payload = {
                "queryStringParameters": qparams,
                "requestContext": {"jobId": job_id}  # Pass Job ID to worker
            }
            lambda_client.invoke(
                FunctionName=PROCESSING_LAMBDA_NAME,
                InvocationType='Event',
                Payload=json.dumps(payload)
            )

        return {
            "statusCode": 202,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({"message": "Batch processing started.", "jobId": job_id})
        }
    except Exception as e:
        logger.error(f"Error starting batch process: {e}")
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({"error": "Failed to start batch process."})
        }