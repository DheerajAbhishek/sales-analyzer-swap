import json
import boto3
import urllib.parse
from datetime import datetime, timedelta
from collections import defaultdict

def lambda_handler(event, context):
    """
    Check for missing dates in S3 bucket for given restaurant and date range
    """
    try:
        # Parse input
        if event.get('httpMethod') == 'POST':
            body = json.loads(event['body'])
        else:
            body = event
            
        restaurant_id = body.get('restaurantId')
        start_date = body.get('startDate')  # YYYY-MM-DD
        end_date = body.get('endDate')      # YYYY-MM-DD
        business_email = body.get('businessEmail')
        
        if not all([restaurant_id, start_date, end_date]):
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'error': 'Missing required parameters: restaurantId, startDate, endDate'
                })
            }
        
        # Initialize S3 client
        s3_client = boto3.client('s3')
        bucket_name = 'sale-dashboard-data'
        
        # Sanitize email for S3 path
        if business_email:
            user_folder = business_email.replace('@', '_at_').replace('.', '_dot_')
            prefix = f"users/{user_folder}/daily-insights/{restaurant_id}/"
        else:
            prefix = f"daily-insights/{restaurant_id}/"
        
        print(f"Checking missing dates for restaurant {restaurant_id} from {start_date} to {end_date}")
        print(f"S3 prefix: {prefix}")
        
        # Generate expected date range
        expected_dates = []
        current_date = datetime.strptime(start_date, '%Y-%m-%d')
        end_date_obj = datetime.strptime(end_date, '%Y-%m-%d')
        
        while current_date <= end_date_obj:
            expected_dates.append(current_date.strftime('%Y-%m-%d'))
            current_date += timedelta(days=1)
        
        print(f"Expected dates: {len(expected_dates)} days from {start_date} to {end_date}")
        
        # List objects in S3 to find available dates
        available_dates = set()
        
        try:
            paginator = s3_client.get_paginator('list_objects_v2')
            page_iterator = paginator.paginate(
                Bucket=bucket_name, 
                Prefix=prefix,
                PaginationConfig={'MaxItems': 1000, 'PageSize': 100}  # Optimize pagination
            )
            
            for page in page_iterator:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        key = obj['Key']
                        # Extract date from filename like: users/email/daily-insights/12345/2024-01-15.json
                        if key.endswith('.json'):
                            filename = key.split('/')[-1]
                            date_part = filename.replace('.json', '')
                            
                            # Validate date format and check if it's in our date range
                            try:
                                date_obj = datetime.strptime(date_part, '%Y-%m-%d')
                                # Only include dates in our range to optimize
                                if start_date <= date_part <= end_date:
                                    available_dates.add(date_part)
                            except ValueError:
                                continue
            
            print(f"Found {len(available_dates)} available dates in S3 for date range")
            
        except Exception as e:
            print(f"Error listing S3 objects: {str(e)}")
            return {
                'statusCode': 500,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'error': f'Failed to scan S3 bucket: {str(e)}'
                })
            }
        
        # Find missing dates
        missing_dates = [date for date in expected_dates if date not in available_dates]
        available_dates_list = sorted(list(available_dates.intersection(set(expected_dates))))
        
        print(f"Missing dates: {len(missing_dates)}")
        print(f"Available dates in range: {len(available_dates_list)}")
        
        result = {
            'success': True,
            'data': {
                'restaurantId': restaurant_id,
                'dateRange': {
                    'startDate': start_date,
                    'endDate': end_date,
                    'totalDays': len(expected_dates)
                },
                'availableDates': available_dates_list,
                'missingDates': missing_dates,
                'summary': {
                    'totalDaysRequested': len(expected_dates),
                    'daysWithData': len(available_dates_list),
                    'daysMissing': len(missing_dates),
                    'dataCompleteness': round((len(available_dates_list) / len(expected_dates)) * 100, 2) if expected_dates else 0
                }
            }
        }
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        print(f"Error in lambda_handler: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'success': False,
                'error': f'Internal server error: {str(e)}'
            })
        }