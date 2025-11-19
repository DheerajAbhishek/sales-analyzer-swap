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
        print(f"Login request received: {json.dumps(event, default=str)}")
        
        # Parse request body
        body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        business_email = body.get('businessEmail', '').lower().strip()
        password = body.get('password', '')
        
        print(f"Login attempt for email: {business_email}")
        
        if not business_email or not password:
            print("Missing email or password")
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
        print(f"Password hash generated for user: {business_email}")
        
        # Query DynamoDB for user
        print(f"Querying DynamoDB for user: {business_email}")
        response = users_table.get_item(
            Key={'businessEmail': business_email}
        )
        
        if 'Item' not in response:
            print(f"User not found: {business_email}")
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
        print(f"User found: {business_email}, authMethod: {user.get('authMethod', 'N/A')}")
        
        # Check if user has a password hash (for traditional or dual auth users)
        if 'passwordHash' not in user or user.get('passwordHash') is None:
            print(f"User {business_email} has no passwordHash - Google-only account")
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
                    'message': 'This account only supports Google sign-in. Please use "Continue with Google" to sign in.'
                })
            }
        
        # Verify password
        stored_password_hash = user.get('passwordHash', '')
        if stored_password_hash != password_hash:
            print(f"Password mismatch for user: {business_email}")
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
        
        print(f"Password verified for user: {business_email}")
        
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
        print(f"JWT token generated for user: {business_email}")
        
        # Update last login
        users_table.update_item(
            Key={'businessEmail': business_email},
            UpdateExpression='SET lastLogin = :timestamp',
            ExpressionAttributeValues={
                ':timestamp': datetime.utcnow().isoformat()
            }
        )
        
        print(f"Login successful for user: {business_email}")
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
        print(f"Login error: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
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