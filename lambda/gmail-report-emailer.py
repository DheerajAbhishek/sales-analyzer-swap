"""
Report Emailer Lambda
Sends processed sales report back to user via email after batch processing completes.
Can use either AWS SES or Gmail API based on configuration.
"""

import json
import boto3
import os
import logging
import requests
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import base64

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
s3_client = boto3.client('s3')
ses_client = boto3.client('ses')
dynamodb = boto3.resource('dynamodb')

# Environment variables
USE_GMAIL = os.environ.get('USE_GMAIL_FOR_EMAIL', 'false').lower() == 'true'
TOKENS_TABLE = os.environ.get('TOKENS_TABLE', 'gmail_tokens')
FROM_EMAIL = os.environ.get('FROM_EMAIL', 'noreply@yourdomain.com')
S3_BUCKET = os.environ.get('S3_BUCKET_NAME', 'sale-dashboard-data')

tokens_table = dynamodb.Table(TOKENS_TABLE)


def send_email_via_ses(to_email, subject, body_html, body_text=None, attachments=None):
    """Send email using AWS SES"""
    try:
        # Create message
        msg = MIMEMultipart('mixed')
        msg['Subject'] = subject
        msg['From'] = FROM_EMAIL
        msg['To'] = to_email
        
        # Create HTML and plain text parts
        msg_body = MIMEMultipart('alternative')
        
        if body_text:
            text_part = MIMEText(body_text, 'plain', 'utf-8')
            msg_body.attach(text_part)
        
        html_part = MIMEText(body_html, 'html', 'utf-8')
        msg_body.attach(html_part)
        
        msg.attach(msg_body)
        
        # Add attachments if any
        if attachments:
            for attachment in attachments:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment['data'])
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename={attachment["filename"]}'
                )
                msg.attach(part)
        
        # Send via SES
        response = ses_client.send_raw_email(
            Source=FROM_EMAIL,
            Destinations=[to_email],
            RawMessage={'Data': msg.as_string()}
        )
        
        logger.info(f"✅ Email sent via SES to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email via SES: {e}")
        return False


def send_email_via_gmail(user_email, subject, body_html, body_text=None, attachments=None):
    """Send email using Gmail API (as the user)"""
    try:
        # Get user's Gmail access token
        response = tokens_table.get_item(Key={'user_email': user_email})
        
        if 'Item' not in response:
            logger.error(f"No Gmail tokens for {user_email}")
            return False
        
        access_token = response['Item'].get('access_token')
        
        # Create message
        msg = MIMEMultipart('mixed')
        msg['Subject'] = subject
        msg['From'] = user_email
        msg['To'] = user_email  # Send to self
        
        # Create HTML and plain text parts
        msg_body = MIMEMultipart('alternative')
        
        if body_text:
            text_part = MIMEText(body_text, 'plain', 'utf-8')
            msg_body.attach(text_part)
        
        html_part = MIMEText(body_html, 'html', 'utf-8')
        msg_body.attach(html_part)
        
        msg.attach(msg_body)
        
        # Add attachments if any
        if attachments:
            for attachment in attachments:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment['data'])
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename={attachment["filename"]}'
                )
                msg.attach(part)
        
        # Encode message for Gmail API
        raw_message = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
        
        # Send via Gmail API
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'raw': raw_message
        }
        
        response = requests.post(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
            headers=headers,
            json=payload
        )
        
        if response.status_code == 200:
            logger.info(f"✅ Email sent via Gmail to {user_email}")
            return True
        else:
            logger.error(f"Gmail API error: {response.text}")
            return False
        
    except Exception as e:
        logger.error(f"Failed to send email via Gmail: {e}")
        return False


def generate_report_html(user_email, report_data, processing_summary):
    """Generate HTML email body for the report"""
    
    total_files = processing_summary.get('total_files', 0)
    successful = processing_summary.get('successful', 0)
    failed = processing_summary.get('failed', 0)
    processing_time = processing_summary.get('processing_time_seconds', 0)
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
            }}
            .header {{
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                border-radius: 10px 10px 0 0;
                text-align: center;
            }}
            .content {{
                background: #f8f9fa;
                padding: 30px;
                border-radius: 0 0 10px 10px;
            }}
            .summary {{
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 20px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }}
            .stat {{
                display: inline-block;
                margin: 10px 20px;
                text-align: center;
            }}
            .stat-value {{
                font-size: 32px;
                font-weight: bold;
                color: #667eea;
            }}
            .stat-label {{
                font-size: 14px;
                color: #666;
                margin-top: 5px;
            }}
            .success {{
                color: #28a745;
            }}
            .failed {{
                color: #dc3545;
            }}
            .footer {{
                text-align: center;
                margin-top: 30px;
                color: #666;
                font-size: 12px;
            }}
            .button {{
                display: inline-block;
                padding: 12px 24px;
                background: #667eea;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                margin-top: 20px;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📊 Your Sales Report is Ready!</h1>
            <p>Processed from your {processing_summary.get('sender', 'Zomato/Swiggy')} emails</p>
        </div>
        
        <div class="content">
            <div class="summary">
                <h2>Processing Summary</h2>
                <div class="stat">
                    <div class="stat-value">{total_files}</div>
                    <div class="stat-label">Total Files</div>
                </div>
                <div class="stat">
                    <div class="stat-value success">{successful}</div>
                    <div class="stat-label">Successful</div>
                </div>
                {f'<div class="stat"><div class="stat-value failed">{failed}</div><div class="stat-label">Failed</div></div>' if failed > 0 else ''}
                <div class="stat">
                    <div class="stat-value">{processing_time:.1f}s</div>
                    <div class="stat-label">Processing Time</div>
                </div>
            </div>
            
            <div class="summary">
                <h2>What's Next?</h2>
                <p>Your sales data has been processed and is ready to view in your dashboard.</p>
                <p>You can now:</p>
                <ul>
                    <li>View detailed sales analytics</li>
                    <li>Compare performance across time periods</li>
                    <li>Download detailed reports</li>
                    <li>Track your profitability metrics</li>
                </ul>
                <a href="https://yourdashboard.com/dashboard" class="button">View Dashboard</a>
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated email from your Sales Dashboard</p>
            <p>Processed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
        </div>
    </body>
    </html>
    """
    
    return html


def lambda_handler(event, context):
    """
    Main handler to send report emails after processing
    
    Expected event:
    {
        "userEmail": "user@example.com",
        "reportData": {...},
        "processingSummary": {
            "total_files": 10,
            "successful": 9,
            "failed": 1,
            "processing_time_seconds": 45.2,
            "sender": "billing@zomato.com"
        }
    }
    """
    try:
        user_email = event.get('userEmail')
        report_data = event.get('reportData', {})
        processing_summary = event.get('processingSummary', {})
        
        if not user_email:
            logger.error("userEmail is required")
            return {'success': False, 'message': 'userEmail required'}
        
        logger.info(f"📧 Sending report email to {user_email}")
        
        # Generate email content
        subject = f"📊 Your Sales Report is Ready - {processing_summary.get('total_files', 0)} files processed"
        body_html = generate_report_html(user_email, report_data, processing_summary)
        body_text = f"""
Your Sales Report is Ready!

Processing Summary:
- Total Files: {processing_summary.get('total_files', 0)}
- Successful: {processing_summary.get('successful', 0)}
- Failed: {processing_summary.get('failed', 0)}
- Processing Time: {processing_summary.get('processing_time_seconds', 0):.1f}s

Visit your dashboard to view the detailed reports.

Processed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}
        """
        
        # Send email
        if USE_GMAIL:
            success = send_email_via_gmail(user_email, subject, body_html, body_text)
        else:
            success = send_email_via_ses(user_email, subject, body_html, body_text)
        
        if success:
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'success': True,
                    'message': f'Report email sent to {user_email}',
                    'method': 'gmail' if USE_GMAIL else 'ses'
                })
            }
        else:
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'success': False,
                    'message': 'Failed to send email'
                })
            }
        
    except Exception as e:
        logger.error(f"Error sending report email: {e}")
        import traceback
        traceback.print_exc()
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'message': str(e)
            })
        }
