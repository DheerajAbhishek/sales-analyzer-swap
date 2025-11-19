import json
import jwt
import os
from datetime import datetime

# JWT secret key (in production, use AWS Secrets Manager)
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')

def lambda_handler(event, context):
    try:
        # Get token from Authorization header
        auth_header = event.get('headers', {}).get('Authorization', '')
        
        if not auth_header.startswith('Bearer '):
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
                    'message': 'Authorization header missing or invalid'
                })
            }
        
        token = auth_header.split(' ')[1]
        
        try:
            # Decode and verify JWT token
            payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            
            # Check if token is expired
            if datetime.utcnow().timestamp() > payload.get('exp', 0):
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
                        'message': 'Token has expired'
                    })
                }
            
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
                        'businessEmail': payload.get('businessEmail'),
                        'restaurantName': payload.get('restaurantName'),
                        'phoneNumber': payload.get('phoneNumber'),
                        'state': payload.get('state'),
                        'city': payload.get('city'),
                        'userId': payload.get('userId')
                    }
                })
            }
            
        except jwt.InvalidTokenError:
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
                    'message': 'Invalid token'
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