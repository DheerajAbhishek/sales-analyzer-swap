import json
import boto3
import hashlib
import jwt
import os
from datetime import datetime, timedelta
from boto3.dynamodb.conditions import Key

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
users_table = dynamodb.Table(os.environ.get('USERS_TABLE', 'sales-dashboard-users'))

# JWT secret key (in production, use AWS Secrets Manager)
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')

def lambda_handler(event, context):
    try:
        # Parse request body
        body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        business_email = body.get('businessEmail', '').lower().strip()
        password = body.get('password', '')
        
        if not business_email or not password:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'Business email and password are required'
                })
            }
        
        # Hash the password
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        
        # Query DynamoDB for user
        response = users_table.get_item(
            Key={'businessEmail': business_email}
        )
        
        if 'Item' not in response:
            return {
                'statusCode': 401,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'Invalid email or password'
                })
            }
        
        user = response['Item']
        
        # Verify password
        if user['passwordHash'] != password_hash:
            return {
                'statusCode': 401,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'Invalid email or password'
                })
            }
        
        # Generate JWT token
        payload = {
            'businessEmail': user['businessEmail'],
            'userId': user['userId'],
            'restaurantName': user['restaurantName'],
            'phoneNumber': user['phoneNumber'],
            'state': user['state'],
            'city': user['city'],
            'exp': datetime.utcnow() + timedelta(days=7)  # Token expires in 7 days
        }
        
        token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
        
        # Update last login
        users_table.update_item(
            Key={'businessEmail': business_email},
            UpdateExpression='SET lastLogin = :timestamp',
            ExpressionAttributeValues={
                ':timestamp': datetime.utcnow().isoformat()
            }
        )
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({
                'success': True,
                'user': {
                    'businessEmail': user['businessEmail'],
                    'restaurantName': user['restaurantName'],
                    'phoneNumber': user['phoneNumber'],
                    'state': user['state'],
                    'city': user['city'],
                    'userId': user['userId']
                },
                'token': token
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-API-Key,X-User-Email,X-Request-Timestamp,X-Request-Signature,business-email,businessEmail,Accept,Accept-Language,Content-Language',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({
                'success': False,
                'message': 'Internal server error'
            })
        }