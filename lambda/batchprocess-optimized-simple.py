import json
import os
import boto3
import logging
import uuid
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')

PROCESSING_LAMBDA_NAME = os.environ.get("PROCESSING_LAMBDA_NAME")
JOBS_TABLE_NAME = os.environ.get("JOBS_TABLE_NAME")
MAX_WORKERS = int(os.environ.get('MAX_WORKERS', '20'))  # Concurrent invocations

# Thread-safe counter for logging
class Counter:
    def __init__(self):
        self.value = 0
        self.lock = Lock()
    
    def increment(self):
        with self.lock:
            self.value += 1
            return self.value


def invoke_lambda(filename, business_email, job_id, counter):
    """Invoke a single insights Lambda (thread-safe)"""
    try:
        qparams = {"filename": filename}
        if business_email:
            qparams["businessEmail"] = business_email

        payload = {
            "queryStringParameters": qparams,
            "requestContext": {"jobId": job_id}
        }
        
        lambda_client.invoke(
            FunctionName=PROCESSING_LAMBDA_NAME,
            InvocationType='Event',
            Payload=json.dumps(payload)
        )
        
        count = counter.increment()
        if count % 25 == 0:
            logger.info(f"✓ Invoked {count}/{len(files_to_process)} Lambdas...")
        
        return True
        
    except Exception as e:
        logger.error(f"Error invoking Lambda for {filename}: {str(e)}")
        return False


def lambda_handler(event, context):
    try:
        start_time = time.time()
        
        jobs_table = dynamodb.Table(JOBS_TABLE_NAME)
        data = json.loads(event.get("body", "{}"))
        global files_to_process  # For logging in worker function
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

        logger.info(f"🚀 Starting job {job_id} for {len(files_to_process)} files with {MAX_WORKERS} workers...")
        
        # CONCURRENT INVOCATIONS
        counter = Counter()
        
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = [
                executor.submit(invoke_lambda, filename, business_email, job_id, counter)
                for filename in files_to_process
            ]
            
            # Wait for all invocations to complete
            for future in as_completed(futures):
                future.result()
        
        elapsed = time.time() - start_time
        logger.info(f"✅ Job {job_id} complete: {len(files_to_process)} Lambdas invoked in {elapsed:.2f}s ({len(files_to_process)/elapsed:.1f} invocations/sec)")

        return {
            "statusCode": 202,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({
                "message": "Batch processing started.",
                "jobId": job_id,
                "totalFiles": len(files_to_process),
                "invocationTime": round(elapsed, 2),
                "invocationsPerSecond": round(len(files_to_process) / elapsed, 1)
            })
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
