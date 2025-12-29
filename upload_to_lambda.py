#!/usr/bin/env python3
"""
Script to upload all files from S3 bucket to AWS Lambda function.
Tracks the status of each upload attempt.
"""

import boto3
import json
import time
from datetime import datetime
from botocore.exceptions import ClientError

# AWS Configuration
S3_BUCKET = "my-project-uploadss"
S3_PREFIX = "uploads/"
LAMBDA_FUNCTION_NAME = "insights"
AWS_REGION = "ap-south-1"

# Initialize AWS clients
s3_client = boto3.client("s3", region_name=AWS_REGION)
lambda_client = boto3.client("lambda", region_name=AWS_REGION)

# Track results
upload_results = {
    "total_files": 0,
    "successful": 0,
    "failed": 0,
    "skipped": 0,
    "start_time": datetime.now().isoformat(),
    "files": {}
}


def get_all_s3_files(bucket, prefix):
    """List all files in S3 bucket with prefix."""
    files = []
    paginator = s3_client.get_paginator('list_objects_v2')
    
    try:
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            if 'Contents' in page:
                for obj in page['Contents']:
                    # Skip the prefix itself (empty file marker)
                    if obj['Key'] != prefix:
                        files.append({
                            'key': obj['Key'],
                            'size': obj['Size'],
                            'modified': obj['LastModified'].isoformat()
                        })
    except ClientError as e:
        print(f"Error listing S3 objects: {e}")
        return []
    
    return files


def invoke_lambda_with_file(file_key):
    """
    Invoke Lambda function with file information.
    The Lambda function will read the file from S3.
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
            "request_id": response.get('LogResult', 'N/A')
        }
    except ClientError as e:
        return {
            "status": "failed",
            "error": str(e),
            "error_code": e.response['Error']['Code']
        }
    except Exception as e:
        return {
            "status": "failed",
            "error": str(e),
            "error_code": "UNKNOWN"
        }


def process_all_files():
    """Main function to process all S3 files."""
    print("=" * 80)
    print(f"Starting S3 to Lambda Upload Process")
    print(f"S3 Bucket: {S3_BUCKET}/{S3_PREFIX}")
    print(f"Lambda Function: {LAMBDA_FUNCTION_NAME}")
    print(f"Region: {AWS_REGION}")
    print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    # Get all files from S3
    print("\nFetching file list from S3...")
    files = get_all_s3_files(S3_BUCKET, S3_PREFIX)
    
    if not files:
        print("No files found in S3 bucket!")
        return
    
    upload_results["total_files"] = len(files)
    print(f"Found {len(files)} files to process\n")
    
    # Process each file
    for idx, file_info in enumerate(files, 1):
        file_key = file_info['key']
        file_size = file_info['size']
        
        # Extract filename from key
        filename = file_key.split('/')[-1]
        
        # Show progress
        print(f"[{idx}/{len(files)}] Processing: {filename} ({file_size:,} bytes)")
        
        # Invoke Lambda for this file
        result = invoke_lambda_with_file(file_key)
        
        # Track result
        if result['status'] == 'success':
            upload_results["successful"] += 1
            status_msg = f"✓ SUCCESS (Status: {result['status_code']})"
            print(f"  {status_msg}")
        else:
            upload_results["failed"] += 1
            error_msg = result.get('error', 'Unknown error')
            error_code = result.get('error_code', 'UNKNOWN')
            status_msg = f"✗ FAILED - {error_code}: {error_msg}"
            print(f"  {status_msg}")
        
        # Store detailed result
        upload_results["files"][file_key] = {
            "filename": filename,
            "size": file_size,
            "status": result['status'],
            "details": result,
            "timestamp": datetime.now().isoformat()
        }
        
        # Add small delay to avoid rate limiting
        time.sleep(0.1)
    
    # Print summary
    print("\n" + "=" * 80)
    print("UPLOAD SUMMARY")
    print("=" * 80)
    print(f"Total Files:     {upload_results['total_files']}")
    print(f"Successful:      {upload_results['successful']} ✓")
    print(f"Failed:          {upload_results['failed']} ✗")
    print(f"Skipped:         {upload_results['skipped']}")
    print(f"Success Rate:    {(upload_results['successful']/upload_results['total_files']*100):.1f}%")
    print(f"End Time:        {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    # Save detailed report
    save_report()


def save_report():
    """Save detailed report to JSON file."""
    upload_results["end_time"] = datetime.now().isoformat()
    
    report_filename = f"upload_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    try:
        with open(report_filename, 'w') as f:
            json.dump(upload_results, f, indent=2)
        print(f"\nDetailed report saved to: {report_filename}")
    except Exception as e:
        print(f"Error saving report: {e}")
    
    # Also print failed files if any
    if upload_results['failed'] > 0:
        print("\nFailed Files:")
        print("-" * 80)
        for file_key, details in upload_results['files'].items():
            if details['status'] == 'failed':
                print(f"  • {details['filename']}")
                print(f"    Error: {details['details'].get('error', 'Unknown')}")


if __name__ == "__main__":
    process_all_files()
