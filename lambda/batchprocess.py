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
        logger.info("=" * 80)
        logger.info("🚀 BATCH PROCESSOR STARTED")
        logger.info("=" * 80)
        
        jobs_table = dynamodb.Table(JOBS_TABLE_NAME)
        data = json.loads(event.get("body", "{}"))
        files_to_process = data.get("files", [])
        business_email = data.get("businessEmail") or data.get("business_email")

        logger.info(f"Business Email: {business_email}")
        logger.info(f"Files to process: {len(files_to_process)}")
        logger.info(f"Processing Lambda: {PROCESSING_LAMBDA_NAME}")
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

        logger.info(f"Starting job {job_id} for {len(files_to_process)} files.")

        # Invoke Lambda functions in batches to avoid timeout
        successful_invocations = 0
        failed_invocations = 0
        timeout_reached = False
        
        # Log progress every 25 files
        for i, filename in enumerate(files_to_process):
            # Check remaining time every 10 invocations to avoid timeout
            if i % 10 == 0 and context:
                remaining_time = context.get_remaining_time_in_millis()
                if remaining_time < 5000:  # Less than 5 seconds remaining
                    logger.warning(f"⏰ Timeout approaching ({remaining_time}ms), processed {i}/{len(files_to_process)} files")
                    timeout_reached = True
                    break
            
            # Log progress every 25 files
            if i > 0 and i % 25 == 0:
                logger.info(f"Progress: {i}/{len(files_to_process)} files invoked ({(i/len(files_to_process)*100):.1f}%)")
            
            try:
                qparams = {"filename": filename}
                if business_email:
                    qparams["businessEmail"] = business_email

                payload = {
                    "queryStringParameters": qparams,
                    "requestContext": {"jobId": job_id}  # Pass Job ID to worker
                }
                
                response = lambda_client.invoke(
                    FunctionName=PROCESSING_LAMBDA_NAME,
                    InvocationType='Event',
                    Payload=json.dumps(payload)
                )
                
                if response['StatusCode'] in [200, 202]:
                    successful_invocations += 1
                else:
                    failed_invocations += 1
                    logger.error(f"Failed to invoke for {filename}: {response.get('FunctionError', 'Unknown error')}")
                    
            except Exception as e:
                failed_invocations += 1
                logger.error(f"Error invoking Lambda for {filename}: {str(e)}")

        # Build comprehensive status message
        status_msg = f"✅ Job {job_id} invocations complete: {successful_invocations} successful, {failed_invocations} failed"
        if timeout_reached:
            not_processed = len(files_to_process) - successful_invocations - failed_invocations
            status_msg += f" (⏰ timeout reached, {not_processed} files not processed)"
        
        logger.info("=" * 80)
        logger.info(status_msg)
        logger.info(f"Summary: Total={len(files_to_process)}, Success={successful_invocations}, Failed={failed_invocations}")
        logger.info(f"Success Rate: {(successful_invocations/len(files_to_process)*100):.1f}%")
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
                "timeoutReached": timeout_reached
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