import json
import boto3
import hashlib
import uuid
import os
import re
from datetime import datetime

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
users_table = dynamodb.Table(os.environ.get('USERS_TABLE', 'sales-dashboard-users'))

def lambda_handler(event, context):
    try:
        # Parse request body
        body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        
        restaurant_name = body.get('restaurantName', '').strip()
        business_email = body.get('businessEmail', '').lower().strip()
        phone_number = body.get('phoneNumber', '').strip()
        state = body.get('state', '').strip()
        city = body.get('city', '').strip()
        password = body.get('password', '')
        
        # Validation
        if not all([restaurant_name, business_email, phone_number, state, city, password]):
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'All fields are required'
                })
            }
        
        # Validate email format
        email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_regex, business_email):
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'Invalid email format'
                })
            }
        
        # Validate phone number (10 digits)
        if not re.match(r'^\d{10}$', phone_number):
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'Phone number must be 10 digits'
                })
            }
        
        # Validate password length
        if len(password) < 8:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'Password must be at least 8 characters long'
                })
            }
        
        # Check if user already exists
        response = users_table.get_item(
            Key={'businessEmail': business_email}
        )
        
        if 'Item' in response:
            return {
                'statusCode': 409,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'An account with this email already exists'
                })
            }
        
        # Hash the password
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        
        # Generate unique user ID
        user_id = str(uuid.uuid4())
        
        # Create user record
        timestamp = datetime.utcnow().isoformat()
        user_item = {
            'businessEmail': business_email,
            'userId': user_id,
            'restaurantName': restaurant_name,
            'phoneNumber': phone_number,
            'state': state,
            'city': city,
            'passwordHash': password_hash,
            'createdAt': timestamp,
            'lastLogin': None,
            'isActive': True
        }
        
        # Save to DynamoDB
        users_table.put_item(Item=user_item)
        
        return {
            'statusCode': 201,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({
                'success': True,
                'message': 'Account created successfully'
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({
                'success': False,
                'message': 'Internal server error'
            })
        }