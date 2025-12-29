#!/usr/bin/env python3
"""
Advanced script to upload files from S3 to Lambda with detailed tracking.
Includes options for batch processing and retry logic.
"""

import boto3
import json
import time
import os
from datetime import datetime
from botocore.exceptions import ClientError
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# AWS Configuration
S3_BUCKET = "my-project-uploadss"
S3_PREFIX = "uploads/"
LAMBDA_FUNCTION_NAME = "insights"
AWS_REGION = "ap-south-1"
MAX_WORKERS = 10  # Number of concurrent Lambda invocations
BATCH_SIZE = 50   # Files to process before reporting progress
RETRY_ATTEMPTS = 3
RETRY_DELAY = 1  # seconds

# Initialize AWS clients
s3_client = boto3.client("s3", region_name=AWS_REGION)
lambda_client = boto3.client("lambda", region_name=AWS_REGION)

# Thread-safe results tracking
upload_results = {
    "total_files": 0,
    "successful": 0,
    "failed": 0,
    "skipped": 0,
    "retried": 0,
    "start_time": datetime.now().isoformat(),
    "files": {},
    "failed_files": [],
    "statistics": {
        "total_size_bytes": 0,
        "avg_file_size": 0,
        "largest_file": None,
        "smallest_file": None
    }
}


def get_all_s3_files(bucket, prefix):
    """List all files in S3 bucket with prefix."""
    files = []
    paginator = s3_client.get_paginator('list_objects_v2')
    
    try:
        logger.info(f"Fetching file list from s3://{bucket}/{prefix}")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            if 'Contents' in page:
                for obj in page['Contents']:
                    if obj['Key'] != prefix:
                        files.append({
                            'key': obj['Key'],
                            'size': obj['Size'],
                            'modified': obj['LastModified'].isoformat()
                        })
    except ClientError as e:
        logger.error(f"Error listing S3 objects: {e}")
        return []
    
    return files


def invoke_lambda_with_file(file_key, attempt=1):
    """
    Invoke Lambda function with file information.
    Includes retry logic for transient failures.
    """
    try:
        # Create payload with queryStringParameters (as Lambda expects)
        payload = {
            "queryStringParameters": {
                "filename": file_key
            }
        }
        
        # Invoke Lambda function asynchronously
        response = lambda_client.invoke(
            FunctionName=LAMBDA_FUNCTION_NAME,
            InvocationType='Event',  # Asynchronous invocation
            Payload=json.dumps(payload)
        )
        
        return {
            "status": "success",
            "status_code": response['StatusCode'],
            "request_id": response.get('LogResult', 'N/A'),
            "attempt": attempt
        }
    except ClientError as e:
        error_code = e.response['Error']['Code']
        
        # Retry on throttling or service errors
        if error_code in ['ThrottlingException', 'ServiceException', 'TooManyRequestsException']:
            if attempt < RETRY_ATTEMPTS:
                logger.warning(f"Throttled for {file_key}, retrying in {RETRY_DELAY}s...")
                time.sleep(RETRY_DELAY)
                return invoke_lambda_with_file(file_key, attempt + 1)
        
        return {
            "status": "failed",
            "error": str(e),
            "error_code": error_code,
            "attempt": attempt
        }
    except Exception as e:
        return {
            "status": "failed",
            "error": str(e),
            "error_code": "UNKNOWN",
            "attempt": attempt
        }


def process_file_worker(file_info):
    """Worker function for concurrent file processing."""
    file_key = file_info['key']
    file_size = file_info['size']
    filename = file_key.split('/')[-1]
    
    result = invoke_lambda_with_file(file_key)
    
    return {
        "filename": filename,
        "key": file_key,
        "size": file_size,
        "result": result
    }


def process_all_files_concurrent():
    """Process all S3 files with concurrent Lambda invocations."""
    print("=" * 100)
    print(f"S3 to Lambda Batch Upload - CONCURRENT MODE")
    print(f"S3 Bucket: {S3_BUCKET}/{S3_PREFIX}")
    print(f"Lambda Function: {LAMBDA_FUNCTION_NAME}")
    print(f"Region: {AWS_REGION}")
    print(f"Concurrent Workers: {MAX_WORKERS}")
    print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 100)
    
    # Get all files from S3
    files = get_all_s3_files(S3_BUCKET, S3_PREFIX)
    
    if not files:
        print("❌ No files found in S3 bucket!")
        return
    
    upload_results["total_files"] = len(files)
    
    # Calculate statistics
    for f in files:
        upload_results["statistics"]["total_size_bytes"] += f['size']
        if upload_results["statistics"]["largest_file"] is None or f['size'] > upload_results["statistics"]["largest_file"]['size']:
            upload_results["statistics"]["largest_file"] = {'name': f['key'].split('/')[-1], 'size': f['size']}
        if upload_results["statistics"]["smallest_file"] is None or f['size'] < upload_results["statistics"]["smallest_file"]['size']:
            upload_results["statistics"]["smallest_file"] = {'name': f['key'].split('/')[-1], 'size': f['size']}
    
    upload_results["statistics"]["avg_file_size"] = upload_results["statistics"]["total_size_bytes"] / len(files)
    
    print(f"\n📊 File Statistics:")
    print(f"  Total Files: {len(files)}")
    print(f"  Total Size: {upload_results['statistics']['total_size_bytes']:,} bytes ({upload_results['statistics']['total_size_bytes']/1024/1024:.2f} MB)")
    print(f"  Average Size: {upload_results['statistics']['avg_file_size']:,.0f} bytes")
    print(f"  Largest File: {upload_results['statistics']['largest_file']['name']} ({upload_results['statistics']['largest_file']['size']:,} bytes)")
    print(f"  Smallest File: {upload_results['statistics']['smallest_file']['name']} ({upload_results['statistics']['smallest_file']['size']:,} bytes)")
    print()
    
    # Process files with ThreadPoolExecutor
    processed = 0
    start_batch = datetime.now()
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_file_worker, f): f for f in files}
        
        for future in as_completed(futures):
            file_info = future.result()
            file_key = file_info['key']
            filename = file_info['filename']
            result = file_info['result']
            processed += 1
            
            # Track result
            if result['status'] == 'success':
                upload_results["successful"] += 1
                status_icon = "✓"
            else:
                upload_results["failed"] += 1
                upload_results["failed_files"].append(filename)
                status_icon = "✗"
            
            # Store detailed result
            upload_results["files"][file_key] = {
                "filename": filename,
                "size": file_info['size'],
                "status": result['status'],
                "details": result,
                "timestamp": datetime.now().isoformat()
            }
            
            # Progress report every BATCH_SIZE files
            if processed % BATCH_SIZE == 0:
                elapsed = (datetime.now() - start_batch).total_seconds()
                rate = BATCH_SIZE / elapsed if elapsed > 0 else 0
                print(f"  [{processed}/{upload_results['total_files']}] Processed {BATCH_SIZE} files in {elapsed:.1f}s ({rate:.1f} files/sec)")
                start_batch = datetime.now()
    
    # Print summary
    print_summary()
    
    # Save detailed report
    save_report()


def print_summary():
    """Print upload summary."""
    print("\n" + "=" * 100)
    print("📋 UPLOAD SUMMARY")
    print("=" * 100)
    print(f"Total Files:        {upload_results['total_files']}")
    print(f"Successful:         {upload_results['successful']} ✓ ({upload_results['successful']/upload_results['total_files']*100:.1f}%)")
    print(f"Failed:             {upload_results['failed']} ✗ ({upload_results['failed']/upload_results['total_files']*100:.1f}%)")
    print(f"Skipped:            {upload_results['skipped']}")
    print(f"Total Size Sent:    {upload_results['statistics']['total_size_bytes']:,} bytes ({upload_results['statistics']['total_size_bytes']/1024/1024:.2f} MB)")
    print(f"End Time:           {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 100)
    
    # Show failed files if any
    if upload_results['failed'] > 0:
        print(f"\n⚠️  {upload_results['failed']} Failed Files:")
        print("-" * 100)
        for file_key, details in upload_results['files'].items():
            if details['status'] == 'failed':
                print(f"  • {details['filename']}")
                print(f"    Error: {details['details'].get('error', 'Unknown')}")
                print(f"    Code: {details['details'].get('error_code', 'N/A')}")


def save_report():
    """Save detailed report to JSON file."""
    upload_results["end_time"] = datetime.now().isoformat()
    
    report_filename = f"upload_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    try:
        with open(report_filename, 'w') as f:
            json.dump(upload_results, f, indent=2)
        print(f"\n✅ Detailed report saved to: {report_filename}")
        
        # Also create a CSV summary for easy viewing
        csv_filename = f"upload_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        with open(csv_filename, 'w') as f:
            f.write("Filename,Key,Size,Status,Error\n")
            for file_key, details in upload_results['files'].items():
                error = details['details'].get('error', '')
                f.write(f'"{details["filename"]}","{file_key}",{details["size"]},{details["status"]},"{error}"\n')
        print(f"✅ Summary CSV saved to: {csv_filename}")
        
    except Exception as e:
        logger.error(f"Error saving report: {e}")


if __name__ == "__main__":
    try:
        process_all_files_concurrent()
        print("\n✅ Upload process completed!")
    except KeyboardInterrupt:
        print("\n⚠️  Process interrupted by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        print(f"\n❌ Fatal error: {e}")
