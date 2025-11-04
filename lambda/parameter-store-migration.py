"""
Parameter Store Migration Helper

This script helps migrate Google OAuth credentials from AWS Secrets Manager 
to Systems Manager Parameter Store to save $0.40/month.

COST SAVINGS:
- Secrets Manager: $0.40/month per secret
- Parameter Store: FREE for standard parameters (up to 10,000)

Usage:
1. Run this script to migrate credentials
2. Update Lambda functions to use the new parameter store functions
3. Delete the old secret from Secrets Manager
"""

import json
import boto3
import os

def migrate_oauth_credentials():
    """
    Migrate Google OAuth credentials from Secrets Manager to Parameter Store
    """
    # AWS clients
    secrets_client = boto3.client('secretsmanager')
    ssm_client = boto3.client('ssm')
    
    secret_name = "google-oauth-credentials"
    
    try:
        # 1. Get existing credentials from Secrets Manager
        print(f"📥 Reading credentials from Secrets Manager: {secret_name}")
        response = secrets_client.get_secret_value(SecretId=secret_name)
        credentials = json.loads(response['SecretString'])
        
        # 2. Store in Parameter Store as individual parameters
        parameter_prefix = "/sales-dashboard/google-oauth"
        
        parameters_to_create = [
            {
                'name': f"{parameter_prefix}/client-id",
                'value': credentials.get('client_id', ''),
                'description': 'Google OAuth Client ID'
            },
            {
                'name': f"{parameter_prefix}/client-secret",
                'value': credentials.get('client_secret', ''),
                'description': 'Google OAuth Client Secret',
                'secure': True  # Use SecureString for sensitive data
            },
            {
                'name': f"{parameter_prefix}/redirect-uri",
                'value': credentials.get('redirect_uri', ''),
                'description': 'Google OAuth Redirect URI'
            },
            {
                'name': f"{parameter_prefix}/auth-uri",
                'value': credentials.get('auth_uri', 'https://accounts.google.com/o/oauth2/auth'),
                'description': 'Google OAuth Authorization URI'
            },
            {
                'name': f"{parameter_prefix}/token-uri",
                'value': credentials.get('token_uri', 'https://oauth2.googleapis.com/token'),
                'description': 'Google OAuth Token URI'
            }
        ]
        
        for param in parameters_to_create:
            if not param['value']:
                print(f"⚠️  Skipping empty parameter: {param['name']}")
                continue
                
            parameter_type = 'SecureString' if param.get('secure') else 'String'
            
            print(f"📤 Creating parameter: {param['name']} (type: {parameter_type})")
            
            ssm_client.put_parameter(
                Name=param['name'],
                Value=param['value'],
                Type=parameter_type,
                Description=param['description'],
                Overwrite=True,  # Allow updates
                Tier='Standard'  # Free tier
            )
            
        print("✅ Migration completed successfully!")
        print("\n📋 Next steps:")
        print("1. Update your Lambda functions to use the new get_oauth_credentials_from_parameter_store() function")
        print("2. Test the Lambda functions")
        print("3. Delete the old secret from Secrets Manager using: delete_old_secret()")
        print(f"4. This will save you $0.40/month!")
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False


def delete_old_secret():
    """
    Delete the old secret from Secrets Manager (run this AFTER testing the migration)
    """
    secrets_client = boto3.client('secretsmanager')
    secret_name = "google-oauth-credentials"
    
    try:
        print(f"🗑️  Deleting secret: {secret_name}")
        
        # Delete immediately (no recovery period)
        secrets_client.delete_secret(
            SecretId=secret_name,
            ForceDeleteWithoutRecovery=True
        )
        
        print("✅ Secret deleted successfully!")
        print("💰 You will now save $0.40/month!")
        
    except Exception as e:
        print(f"❌ Failed to delete secret: {e}")


def get_oauth_credentials_from_parameter_store():
    """
    New function to replace get_google_oauth_credentials() in your Lambda functions
    
    Use this function in your Lambda code instead of the Secrets Manager version.
    """
    ssm_client = boto3.client('ssm')
    parameter_prefix = "/sales-dashboard/google-oauth"
    
    try:
        # Get all parameters at once
        response = ssm_client.get_parameters(
            Names=[
                f"{parameter_prefix}/client-id",
                f"{parameter_prefix}/client-secret",
                f"{parameter_prefix}/redirect-uri",
                f"{parameter_prefix}/auth-uri",
                f"{parameter_prefix}/token-uri"
            ],
            WithDecryption=True  # Decrypt SecureString parameters
        )
        
        # Convert to dictionary format expected by existing code
        credentials = {}
        
        for param in response['Parameters']:
            name = param['Name'].split('/')[-1]  # Get the last part (e.g., 'client-id')
            key = name.replace('-', '_')  # Convert to underscore format
            credentials[key] = param['Value']
        
        # Set defaults if missing
        credentials.setdefault('auth_uri', 'https://accounts.google.com/o/oauth2/auth')
        credentials.setdefault('token_uri', 'https://oauth2.googleapis.com/token')
        
        return credentials
        
    except Exception as e:
        print(f"Error retrieving OAuth credentials from Parameter Store: {e}")
        return None


def verify_migration():
    """
    Verify that the migration was successful by reading from Parameter Store
    """
    print("🔍 Verifying migration...")
    
    credentials = get_oauth_credentials_from_parameter_store()
    
    if credentials:
        print("✅ Migration verification successful!")
        print("📋 Available credentials:")
        for key, value in credentials.items():
            if 'secret' in key.lower():
                print(f"  {key}: {'*' * 10} (hidden)")
            else:
                print(f"  {key}: {value}")
        return True
    else:
        print("❌ Migration verification failed!")
        return False


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Migrate Google OAuth credentials to Parameter Store')
    parser.add_argument('--migrate', action='store_true', help='Migrate credentials to Parameter Store')
    parser.add_argument('--verify', action='store_true', help='Verify migration')
    parser.add_argument('--delete-secret', action='store_true', help='Delete old secret (run after testing!)')
    
    args = parser.parse_args()
    
    if args.migrate:
        migrate_oauth_credentials()
    elif args.verify:
        verify_migration()
    elif args.delete_secret:
        delete_old_secret()
    else:
        print("Usage:")
        print("  python parameter_store_migration.py --migrate     # Migrate credentials")
        print("  python parameter_store_migration.py --verify      # Verify migration")
        print("  python parameter_store_migration.py --delete-secret  # Delete old secret")