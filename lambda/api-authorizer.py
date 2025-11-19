"""
AWS Lambda Authorizer for API Gateway
Validates API keys and JWT tokens for secure API access
"""

import json
import os
import jwt
from datetime import datetime

# Get expected API keys from environment variables
MAIN_API_KEY = os.environ.get('MAIN_API_KEY', '')
THRESHOLD_API_KEY = os.environ.get('THRESHOLD_API_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', '')

def lambda_handler(event, context):
    """
    Lambda authorizer handler
    Returns IAM policy allowing or denying API Gateway execution
    """
    
    print(f"Authorization request for: {event['methodArn']}")
    
    try:
        # Get headers (case-insensitive)
        headers = {k.lower(): v for k, v in event['headers'].items()}
        
        # Extract API key and Authorization token
        api_key = headers.get('x-api-key', '')
        auth_header = headers.get('authorization', '')
        user_email = headers.get('x-user-email', '')
        
        # Determine which API is being accessed
        method_arn = event['methodArn']
        is_threshold_api = 'threshold-settings' in method_arn
        
        # Validate API key
        expected_key = THRESHOLD_API_KEY if is_threshold_api else MAIN_API_KEY
        
        if not api_key or api_key != expected_key:
            print(f"Invalid API key for {'threshold' if is_threshold_api else 'main'} API")
            raise Exception('Unauthorized: Invalid API key')
        
        # For authenticated endpoints, also validate JWT token
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            
            try:
                # Decode and validate JWT token
                payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
                
                # Check token expiration
                if payload.get('exp') and payload['exp'] < datetime.utcnow().timestamp():
                    raise Exception('Token expired')
                
                # Validate user email matches if provided
                if user_email and payload.get('email') != user_email:
                    raise Exception('Email mismatch')
                
                principal_id = payload.get('sub') or payload.get('email') or 'user'
                
            except jwt.ExpiredSignatureError:
                print("JWT token expired")
                raise Exception('Unauthorized: Token expired')
            except jwt.InvalidTokenError as e:
                print(f"Invalid JWT token: {str(e)}")
                raise Exception('Unauthorized: Invalid token')
        else:
            # No JWT token provided - use email as principal
            principal_id = user_email or 'anonymous'
        
        # Generate allow policy
        policy = generate_policy(principal_id, 'Allow', event['methodArn'])
        
        print(f"Authorization granted for: {principal_id}")
        return policy
        
    except Exception as e:
        print(f"Authorization failed: {str(e)}")
        # Return deny policy
        raise Exception('Unauthorized')


def generate_policy(principal_id, effect, resource):
    """
    Generate IAM policy document
    """
    auth_response = {
        'principalId': principal_id
    }
    
    if effect and resource:
        policy_document = {
            'Version': '2012-10-17',
            'Statement': [
                {
                    'Action': 'execute-api:Invoke',
                    'Effect': effect,
                    'Resource': resource
                }
            ]
        }
        auth_response['policyDocument'] = policy_document
    
    # Optional: Add context data to pass to backend
    auth_response['context'] = {
        'principalId': principal_id,
        'authorizedAt': str(datetime.utcnow().isoformat())
    }
    
    return auth_response


def generate_deny_policy(principal_id, resource):
    """
    Generate deny policy
    """
    return generate_policy(principal_id, 'Deny', resource)
