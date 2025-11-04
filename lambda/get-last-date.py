import json
import os
import boto3
import logging
from datetime import datetime, timedelta
import re

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')
BUCKET = "sale-dashboard-data"  # Correct bucket name used across the application

def _cors_response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
            "Access-Control-Allow-Headers": "Content-Type,Authorization"
        },
        "body": json.dumps(body)
    }

def _sanitize_email_for_key(email: str) -> str:
    """Convert email to S3-safe key format"""
    if not email:
        return "unknown"
    e = email.strip().lower()
    e = e.replace("@", "_at_")
    e = e.replace(".", "_dot_")
    import re
    e = re.sub(r"[^a-z0-9_\-]", "_", e)
    return e

def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")
    
    # Handle preflight (CORS)
    if event.get("httpMethod") == "OPTIONS":
        return _cors_response(200, {"message": "CORS preflight success"})
    
    try:
        # Extract restaurant ID and business email from request
        restaurant_id = None
        business_email = None
        
        # Try to get from query parameters first
        params = event.get("queryStringParameters") or {}
        restaurant_id = params.get("restaurantId")
        business_email = params.get("businessEmail") or params.get("business_email")
        
        # If not in query params, try request body
        if not restaurant_id:
            try:
                body = json.loads(event.get("body") or "{}")
                restaurant_id = body.get("restaurantId")
                if not business_email:
                    business_email = body.get("businessEmail") or body.get("business_email")
            except Exception:
                pass
        
        if not restaurant_id:
            return _cors_response(400, {
                "success": False,
                "error": "Missing restaurantId parameter"
            })
            
        if not business_email:
            return _cors_response(400, {
                "success": False,
                "error": "Missing businessEmail parameter"
            })
        
        logger.info(f"Searching for last date for restaurant: {restaurant_id}, user: {business_email}")
        
        # Use the correct S3 structure: users/{sanitized_email}/daily-insights/{restaurant_id}/
        user_folder = _sanitize_email_for_key(business_email)
        prefix = f"users/{user_folder}/daily-insights/{restaurant_id}/"
        
        logger.info(f"Using S3 prefix: {prefix}")
        
        # List objects to find the most recent date
        try:
            paginator = s3_client.get_paginator("list_objects_v2")
            pages = paginator.paginate(Bucket=BUCKET, Prefix=prefix)
            
            dates_found = []
            total_files = 0
            
            for page in pages:
                if "Contents" in page:
                    total_files += len(page["Contents"])
                    
                    for obj in page["Contents"]:
                        if not obj["Key"].endswith(".json"):
                            continue
                        
                        # Extract date from filename
                        filename = obj["Key"].split("/")[-1]  # Get just the filename
                        if filename.endswith(".json"):
                            try:
                                # Filename format should be YYYY-MM-DD.json
                                date_str = filename.replace(".json", "")
                                # Validate date format
                                datetime.strptime(date_str, "%Y-%m-%d")
                                dates_found.append(date_str)
                            except ValueError:
                                # Skip files that don't match expected date format
                                continue
            
            logger.info(f"Found {total_files} total files, {len(dates_found)} valid date files")
            
            if not dates_found:
                return _cors_response(200, {
                    "success": False,
                    "data": {
                        "message": f"No data files found for restaurant {restaurant_id}",
                        "restaurantId": restaurant_id,
                        "totalDatesFound": 0
                    }
                })
            
            # Sort dates and get the most recent
            dates_found.sort(reverse=True)  # Most recent first
            last_date = dates_found[0]
            
            logger.info(f"Last available date: {last_date}")
            
            return _cors_response(200, {
                "success": True,
                "data": {
                    "lastDate": last_date,
                    "restaurantId": restaurant_id,
                    "totalDatesFound": len(dates_found)
                }
            })
            
        except Exception as e:
            logger.error(f"Error accessing S3: {str(e)}")
            return _cors_response(500, {
                "success": False,
                "error": f"Error accessing data: {str(e)}"
            })
    
    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}", exc_info=True)
        return _cors_response(500, {
            "success": False,
            "error": "Internal server error"
        })