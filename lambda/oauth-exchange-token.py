import json
import boto3
import urllib.request
import urllib.parse
import urllib.error
from botocore.exceptions import ClientError

def get_secret():
    """Retrieve Google OAuth client secret from AWS Secrets Manager"""
    secret_name = "google-oauth-credentials"
    region_name = "ap-south-1"
    
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )
    
    try:
        get_secret_value_response = client.get_secret_value(SecretId=secret_name)
        secret = json.loads(get_secret_value_response['SecretString'])
        return secret
    except ClientError as e:
        print(f"Error retrieving secret: {e}")
        raise e

def lambda_handler(event, context):
    """
    Exchange OAuth authorization code for tokens securely on backend
    This prevents exposing client_secret in frontend code
    """
    
    # Enable CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    }
    
    # Handle preflight OPTIONS request
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        code = body.get('code')
        redirect_uri = body.get('redirect_uri')
        
        if not code:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Authorization code is required'
                })
            }
        
        if not redirect_uri:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Redirect URI is required'
                })
            }
        
        # Get client secret from Secrets Manager
        secrets = get_secret()
        client_id = secrets.get('client_id')
        client_secret = secrets.get('client_secret')
        
        if not client_id or not client_secret:
            raise Exception('Missing OAuth credentials in Secrets Manager')
        
        # Exchange code for tokens
        token_url = 'https://oauth2.googleapis.com/token'
        
        params = {
            'client_id': client_id,
            'client_secret': client_secret,
            'code': code,
            'grant_type': 'authorization_code',
            'redirect_uri': redirect_uri
        }
        
        data = urllib.parse.urlencode(params).encode('utf-8')
        
        req = urllib.request.Request(
            token_url,
            data=data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                token_data = json.loads(response.read().decode('utf-8'))
                
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps({
                        'success': True,
                        'tokens': {
                            'access_token': token_data.get('access_token'),
                            'refresh_token': token_data.get('refresh_token'),
                            'id_token': token_data.get('id_token'),
                            'expires_in': token_data.get('expires_in'),
                            'token_type': token_data.get('token_type', 'Bearer')
                        }
                    })
                }
                
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            error_data = json.loads(error_body)
            
            print(f"Token exchange error: {error_data}")
            
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': f"Token exchange failed: {error_data.get('error_description', error_data.get('error'))}"
                })
            }
    
    except Exception as e:
        print(f"Lambda error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'message': f'Internal server error: {str(e)}'
            })
        }
