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
        
        # Google OAuth specific fields (optional)
        google_id = body.get('googleId', '').strip()
        name = body.get('name', '').strip()
        picture = body.get('picture', '').strip()
        email_verified = body.get('emailVerified', False)
        force_link_account = body.get('forceLinkAccount', False)  # User confirmed they want to link
        
        # Determine if this is Google OAuth signup or traditional signup
        is_google_signup = bool(google_id)
        
        # For Google signup, use email as businessEmail if not provided
        if is_google_signup and not business_email:
            business_email = body.get('email', '').lower().strip()
        
        # Validation - different requirements for Google vs traditional signup
        if is_google_signup:
            # Google OAuth signup - password is now required for dual auth setup
            if not all([google_id, business_email, name, restaurant_name, phone_number, state, city]):
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
                        'message': 'All fields are required for Google signup'
                    })
                }
            
            # For Google signup, password is optional but if provided, validate it
            if password:
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
                # Hash the password for Google users who want dual auth
                password_hash = hashlib.sha256(password.encode()).hexdigest()
        else:
            # Traditional signup - password required
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
        
        # Validate password length (only for traditional signup)
        if not is_google_signup and len(password) < 8:
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
            existing_user = response['Item']
            
            # Handle Google signup with existing user
            if is_google_signup:
                # If user already has Google ID, prevent duplicate signup
                if existing_user.get('googleId'):
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
                            'message': 'This Google account is already registered. Please sign in instead.',
                            'errorType': 'GOOGLE_ACCOUNT_EXISTS'
                        })
                    }
                
                # If user doesn't have Google ID, offer to link accounts
                if not existing_user.get('googleId'):
                    # If user hasn't confirmed they want to link, ask for confirmation
                    if not force_link_account:
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
                                'message': f'An account with {business_email} already exists. Would you like to link your Google account to this existing account?',
                                'errorType': 'ACCOUNT_LINK_REQUIRED',
                                'existingUser': {
                                    'email': business_email,
                                    'restaurantName': existing_user.get('restaurantName'),
                                    'authMethod': existing_user.get('authMethod', 'traditional')
                                }
                            })
                        }
                    
                    # User confirmed they want to link - update existing account
                    update_expression = 'SET googleId = :gid, profilePicture = :pic, authMethod = :auth, updatedAt = :updated, #name = :name, emailVerified = :emailVerified'
                    expression_values = {
                        ':gid': google_id,
                        ':pic': picture,
                        ':auth': 'dual',  # Changed to 'dual' to indicate both methods
                        ':updated': datetime.utcnow().isoformat(),
                        ':name': name,
                        ':emailVerified': email_verified
                    }
                    expression_names = {
                        '#name': 'name'  # 'name' is a reserved keyword in DynamoDB
                    }
                    
                    # If user provided a password during linking, update it
                    if password:
                        update_expression += ', passwordHash = :passwordHash'
                        expression_values[':passwordHash'] = password_hash
                    
                    users_table.update_item(
                        Key={'businessEmail': business_email},
                        UpdateExpression=update_expression,
                        ExpressionAttributeValues=expression_values,
                        ExpressionAttributeNames=expression_names
                    )
                    
                    return {
                        'statusCode': 200,
                        'headers': {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                            'Access-Control-Allow-Methods': 'POST,OPTIONS'
                        },
                        'body': json.dumps({
                            'success': True,
                            'message': 'Google account successfully linked to your existing account!',
                            'user': {
                                'businessEmail': business_email,
                                'userId': existing_user['userId'],
                                'name': existing_user['restaurantName'],
                                'authMethod': 'dual'
                            }
                        })
                    }
            else:
                # Traditional signup - always prevent if user exists
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
                        'message': 'An account with this email already exists. Please sign in instead.',
                        'errorType': 'EMAIL_ALREADY_EXISTS'
                    })
                }
        
        # Hash the password (only for traditional signup)
        password_hash = None
        if not is_google_signup:
            password_hash = hashlib.sha256(password.encode()).hexdigest()
        
        # Generate unique user ID
        user_id = str(uuid.uuid4())
        
        # Create user record - different structure for Google vs traditional signup
        timestamp = datetime.utcnow().isoformat()
        user_item = {
            'businessEmail': business_email,
            'userId': user_id,
            'restaurantName': restaurant_name,
            'phoneNumber': phone_number,
            'state': state,
            'city': city,
            'createdAt': timestamp,
            'lastLogin': timestamp if is_google_signup else None,
            'isActive': True
        }
        
        # Add Google-specific fields
        if is_google_signup:
            user_item.update({
                'googleId': google_id,
                'profilePicture': picture,
                'authMethod': 'google',
                'name': name,
                'emailVerified': email_verified
            })
            
            # Add password hash if user provided a password for dual auth
            if password:
                user_item['passwordHash'] = password_hash
                user_item['authMethod'] = 'dual'  # User can use both Google and email/password
        else:
            # Add traditional signup fields
            user_item.update({
                'passwordHash': password_hash,
                'authMethod': 'traditional'
            })
        
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
                'message': 'Google account created successfully' if is_google_signup else 'Account created successfully',
                'user': {
                    'businessEmail': business_email,
                    'userId': user_id,
                    'name': restaurant_name,
                    'authMethod': 'google' if is_google_signup else 'traditional'
                } if is_google_signup else None
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