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
MAX_WORKERS = int(os.environ.get('MAX_WORKERS', '20'))  # Concurrent Lambda invocations

# Thread-safe counter
class InvocationCounter:
    def __init__(self):
        self.successful = 0
        self.failed = 0
        self.lock = Lock()
    
    def increment_success(self):
        with self.lock:
            self.successful += 1
            return self.successful
    
    def increment_failure(self):
        with self.lock:
            self.failed += 1
            return self.failed
    
    def get_counts(self):
        with self.lock:
            return self.successful, self.failed


def invoke_single_lambda(filename, business_email, job_id, counter):
    """Invoke a single insights Lambda (thread-safe)"""
    try:
        qparams = {"filename": filename}
        if business_email:
            qparams["businessEmail"] = business_email

        payload = {
            "queryStringParameters": qparams,
            "requestContext": {"jobId": job_id}
        }
        
        response = lambda_client.invoke(
            FunctionName=PROCESSING_LAMBDA_NAME,
            InvocationType='Event',
            Payload=json.dumps(payload)
        )
        
        if response['StatusCode'] in [200, 202]:
            count = counter.increment_success()
            if count % 25 == 0:
                logger.info(f"✓ Successfully invoked {count} Lambdas...")
            return True
        else:
            counter.increment_failure()
            logger.error(f"Failed to invoke for {filename}: {response.get('FunctionError', 'Unknown error')}")
            return False
            
    except Exception as e:
        counter.increment_failure()
        logger.error(f"Error invoking Lambda for {filename}: {str(e)}")
        return False


def lambda_handler(event, context):
    try:
        start_time = time.time()
        
        logger.info("=" * 80)
        logger.info("🚀 BATCH PROCESSOR (OPTIMIZED) STARTED")
        logger.info("=" * 80)
        
        jobs_table = dynamodb.Table(JOBS_TABLE_NAME)
        data = json.loads(event.get("body", "{}"))
        files_to_process = data.get("files", [])
        business_email = data.get("businessEmail") or data.get("business_email")

        logger.info(f"Business Email: {business_email}")
        logger.info(f"Files to process: {len(files_to_process)}")
        logger.info(f"Processing Lambda: {PROCESSING_LAMBDA_NAME}")
        logger.info(f"Max Workers: {MAX_WORKERS}")
        logger.info(f"Jobs Table: {JOBS_TABLE_NAME}")
        
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

        logger.info(f"📋 Starting job {job_id} for {len(files_to_process)} files.")
        
        # CONCURRENT INVOCATIONS - Invoke Lambdas in parallel
        logger.info(f"⚡ Starting concurrent invocations with {MAX_WORKERS} workers...")
        invocation_start = time.time()
        
        counter = InvocationCounter()
        timeout_reached = False
        
        # Use ThreadPoolExecutor for concurrent Lambda invocations
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # Submit all invocation tasks
            future_to_file = {
                executor.submit(
                    invoke_single_lambda,
                    filename,
                    business_email,
                    job_id,
                    counter
                ): filename
                for filename in files_to_process
            }
            
            # Process results as they complete
            for i, future in enumerate(as_completed(future_to_file)):
                try:
                    future.result()
                    
                    # Check timeout every 10 completions
                    if i % 10 == 0 and context:
                        remaining_time = context.get_remaining_time_in_millis()
                        if remaining_time < 5000:  # Less than 5 seconds remaining
                            logger.warning(f"⏰ Timeout approaching ({remaining_time}ms)")
                            timeout_reached = True
                            executor.shutdown(wait=False, cancel_futures=True)
                            break
                            
                except Exception as e:
                    logger.error(f"Error in concurrent invocation: {str(e)}")
        
        successful_invocations, failed_invocations = counter.get_counts()
        invocation_time = time.time() - invocation_start
        total_time = time.time() - start_time
        
        # Build comprehensive status message
        status_msg = f"✅ Job {job_id} invocations complete: {successful_invocations} successful, {failed_invocations} failed"
        if timeout_reached:
            not_processed = len(files_to_process) - successful_invocations - failed_invocations
            status_msg += f" (⏰ timeout reached, {not_processed} files not processed)"
        
        logger.info("=" * 80)
        logger.info(status_msg)
        logger.info(f"📊 Summary:")
        logger.info(f"   Total files: {len(files_to_process)}")
        logger.info(f"   Successful: {successful_invocations}")
        logger.info(f"   Failed: {failed_invocations}")
        logger.info(f"   Success Rate: {(successful_invocations/len(files_to_process)*100):.1f}%")
        logger.info(f"⚡ Performance:")
        logger.info(f"   Invocation time: {invocation_time:.2f}s")
        logger.info(f"   Total time: {total_time:.2f}s")
        logger.info(f"   Invocation speed: {(len(files_to_process)/invocation_time):.1f} files/second")
        logger.info("=" * 80)

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
                "successfulInvocations": successful_invocations,
                "failedInvocations": failed_invocations,
                "timeoutReached": timeout_reached,
                "performance": {
                    "invocation_time_seconds": round(invocation_time, 2),
                    "total_time_seconds": round(total_time, 2),
                    "invocations_per_second": round(len(files_to_process) / invocation_time, 1)
                }
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
