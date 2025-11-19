"""
Lambda function: auth-check-user
Purpose: Check if a user exists in DynamoDB and return their authentication status
Method: GET
Query Parameters: email (required)
"""

import json
import boto3
import os

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
users_table = dynamodb.Table(os.environ.get('USERS_TABLE', 'sales-dashboard-users'))

def lambda_handler(event, context):
    try:
        # Get email from query parameters
        email = None
        if event.get('queryStringParameters'):
            email = event['queryStringParameters'].get('email', '').lower().strip()
        
        if not email:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'Email parameter is required'
                })
            }
        
        # Query DynamoDB for user
        response = users_table.get_item(
            Key={'businessEmail': email}
        )
        
        if 'Item' in response:
            user = response['Item']
            
            # Return user existence info without sensitive data
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                'body': json.dumps({
                    'success': True,
                    'exists': True,
                    'authMethod': user.get('authMethod', 'traditional'),
                    'hasGoogleId': bool(user.get('googleId')),
                    'hasPassword': bool(user.get('passwordHash')),
                    'restaurantName': user.get('restaurantName'),
                    'isActive': user.get('isActive', True)
                })
            }
        else:
            # User doesn't exist
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                'body': json.dumps({
                    'success': True,
                    'exists': False
                })
            }
        
    except Exception as e:
        print(f"Error checking user existence: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps({
                'success': False,
                'message': 'Internal server error'
            })
        }
