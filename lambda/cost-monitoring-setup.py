"""
AWS Cost Monitoring and Billing Alerts Setup

This script helps set up comprehensive cost monitoring to prevent unexpected charges
and track the success of our optimizations.

MONITORING SETUP:
1. Billing alerts for different thresholds
2. Service-specific cost tracking
3. Daily cost reports
4. Optimization impact tracking
"""

import json
import boto3
from datetime import datetime, timedelta
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
cloudwatch = boto3.client('cloudwatch')
sns = boto3.client('sns')
ce = boto3.client('ce')  # Cost Explorer


def create_billing_alert(alert_name, threshold_usd, sns_topic_arn, comparison='GreaterThanThreshold'):
    """
    Create a CloudWatch billing alert
    """
    try:
        # Create alarm
        cloudwatch.put_metric_alarm(
            AlarmName=alert_name,
            ComparisonOperator=comparison,
            EvaluationPeriods=1,
            MetricName='EstimatedCharges',
            Namespace='AWS/Billing',
            Period=86400,  # 24 hours
            Statistic='Maximum',
            Threshold=threshold_usd,
            ActionsEnabled=True,
            AlarmActions=[sns_topic_arn],
            AlarmDescription=f'Alert when estimated charges exceed ${threshold_usd}',
            Unit='None',
            Dimensions=[
                {
                    'Name': 'Currency',
                    'Value': 'USD'
                }
            ]
        )
        
        logger.info(f"✅ Created billing alert: {alert_name} (${threshold_usd})")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to create billing alert {alert_name}: {e}")
        return False


def create_service_specific_alerts(sns_topic_arn):
    """
    Create alerts for specific AWS services we're optimizing
    """
    service_alerts = [
        {
            'name': 'S3-Requests-Alert',
            'namespace': 'AWS/S3',
            'metric': 'NumberOfObjects',
            'threshold': 100000,  # Alert if we exceed 100k requests
            'description': 'S3 request volume alert'
        },
        {
            'name': 'Secrets-Manager-Alert',
            'namespace': 'AWS/SecretsManager',
            'metric': 'SuccessfulRequestLatency',
            'threshold': 1,  # Alert if Secrets Manager is still being used
            'description': 'Secrets Manager usage alert (should be zero after migration)'
        }
    ]
    
    for alert in service_alerts:
        try:
            cloudwatch.put_metric_alarm(
                AlarmName=alert['name'],
                ComparisonOperator='GreaterThanThreshold',
                EvaluationPeriods=1,
                MetricName=alert['metric'],
                Namespace=alert['namespace'],
                Period=86400,
                Statistic='Sum',
                Threshold=alert['threshold'],
                ActionsEnabled=True,
                AlarmActions=[sns_topic_arn],
                AlarmDescription=alert['description'],
                Unit='None'
            )
            logger.info(f"✅ Created service alert: {alert['name']}")
        except Exception as e:
            logger.error(f"❌ Failed to create service alert {alert['name']}: {e}")


def create_sns_topic_for_alerts():
    """
    Create SNS topic for billing alerts
    """
    try:
        response = sns.create_topic(
            Name='aws-cost-alerts',
            Attributes={
                'DisplayName': 'AWS Cost Alerts',
                'DeliveryPolicy': json.dumps({
                    'http': {
                        'defaultHealthyRetryPolicy': {
                            'minDelayTarget': 20,
                            'maxDelayTarget': 20,
                            'numRetries': 3,
                            'numMaxDelayRetries': 0,
                            'numMinDelayRetries': 0,
                            'numNoDelayRetries': 0,
                            'backoffFunction': 'linear'
                        }
                    }
                })
            }
        )
        
        topic_arn = response['TopicArn']
        logger.info(f"✅ Created SNS topic: {topic_arn}")
        return topic_arn
        
    except Exception as e:
        logger.error(f"❌ Failed to create SNS topic: {e}")
        return None


def subscribe_email_to_topic(topic_arn, email_address):
    """
    Subscribe email to SNS topic for alerts
    """
    try:
        response = sns.subscribe(
            TopicArn=topic_arn,
            Protocol='email',
            Endpoint=email_address
        )
        
        logger.info(f"✅ Subscribed {email_address} to cost alerts")
        logger.info("📧 Check your email and confirm the subscription!")
        return response['SubscriptionArn']
        
    except Exception as e:
        logger.error(f"❌ Failed to subscribe email: {e}")
        return None


def get_current_month_costs():
    """
    Get current month's costs broken down by service
    """
    try:
        # Get current month's costs
        start_date = datetime.now().replace(day=1).strftime('%Y-%m-%d')
        end_date = datetime.now().strftime('%Y-%m-%d')
        
        response = ce.get_cost_and_usage(
            TimePeriod={
                'Start': start_date,
                'End': end_date
            },
            Granularity='MONTHLY',
            Metrics=['BlendedCost'],
            GroupBy=[
                {
                    'Type': 'DIMENSION',
                    'Key': 'SERVICE'
                }
            ]
        )
        
        costs = {}
        total_cost = 0
        
        for result in response['ResultsByTime']:
            for group in result['Groups']:
                service_name = group['Keys'][0]
                cost = float(group['Metrics']['BlendedCost']['Amount'])
                costs[service_name] = cost
                total_cost += cost
        
        return {
            'total_cost': total_cost,
            'service_costs': costs,
            'period': f"{start_date} to {end_date}"
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to get current costs: {e}")
        return None


def create_cost_report():
    """
    Generate a detailed cost report
    """
    costs = get_current_month_costs()
    
    if not costs:
        return "❌ Could not generate cost report"
    
    report = f"""
📊 **AWS Cost Report** 
📅 Period: {costs['period']}
💰 Total Cost: ${costs['total_cost']:.2f}

🔍 **Service Breakdown:**
"""
    
    # Sort services by cost (highest first)
    sorted_services = sorted(
        costs['service_costs'].items(), 
        key=lambda x: x[1], 
        reverse=True
    )
    
    for service, cost in sorted_services:
        if cost > 0:
            report += f"  • {service}: ${cost:.4f}\n"
    
    # Add optimization insights
    s3_cost = costs['service_costs'].get('Amazon Simple Storage Service', 0)
    secrets_cost = costs['service_costs'].get('AWS Secrets Manager', 0)
    
    report += f"""
🎯 **Optimization Impact:**
  • S3 Costs: ${s3_cost:.4f} (Target: <${0.05:.2f} with caching)
  • Secrets Manager: ${secrets_cost:.4f} (Target: $0.00 with Parameter Store)
  
💡 **Potential Monthly Savings:**
  • S3 Optimization: ~${max(0, s3_cost - 0.05):.4f}
  • Parameter Store Migration: ~${secrets_cost:.4f}
  • Total Monthly Savings: ~${max(0, s3_cost - 0.05) + secrets_cost:.4f}
"""
    
    return report


def lambda_handler(event, context):
    """
    Lambda function to set up cost monitoring
    """
    try:
        # Get configuration from event
        email_for_alerts = event.get('email', 'your-email@example.com')
        setup_alerts = event.get('setup_alerts', True)
        generate_report = event.get('generate_report', True)
        
        results = {
            'timestamp': datetime.utcnow().isoformat(),
            'actions_completed': [],
            'errors': []
        }
        
        if setup_alerts:
            # Create SNS topic
            topic_arn = create_sns_topic_for_alerts()
            
            if topic_arn:
                # Subscribe email
                subscription_arn = subscribe_email_to_topic(topic_arn, email_for_alerts)
                
                if subscription_arn:
                    results['actions_completed'].append(f"Email {email_for_alerts} subscribed to alerts")
                
                # Create billing alerts
                alert_thresholds = [1.0, 5.0, 10.0, 25.0]  # Dollar amounts
                
                for threshold in alert_thresholds:
                    alert_name = f"billing-alert-{threshold:.0f}usd"
                    success = create_billing_alert(alert_name, threshold, topic_arn)
                    
                    if success:
                        results['actions_completed'].append(f"Created billing alert for ${threshold}")
                    else:
                        results['errors'].append(f"Failed to create billing alert for ${threshold}")
                
                # Create service-specific alerts
                create_service_specific_alerts(topic_arn)
                results['actions_completed'].append("Created service-specific alerts")
        
        if generate_report:
            # Generate cost report
            cost_report = create_cost_report()
            results['cost_report'] = cost_report
            results['actions_completed'].append("Generated cost report")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(results, indent=2)
        }
        
    except Exception as e:
        logger.error(f"❌ Error setting up cost monitoring: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': str(e),
                'timestamp': datetime.utcnow().isoformat()
            })
        }


def setup_cost_monitoring_cli():
    """
    CLI version for manual setup
    """
    print("🚀 Setting up AWS Cost Monitoring...")
    
    # Get user input
    email = input("📧 Enter your email for cost alerts: ")
    
    if not email:
        print("❌ Email is required for alerts")
        return
    
    # Create SNS topic
    topic_arn = create_sns_topic_for_alerts()
    
    if not topic_arn:
        print("❌ Failed to create SNS topic")
        return
    
    # Subscribe email
    subscription_arn = subscribe_email_to_topic(topic_arn, email)
    
    # Create billing alerts
    thresholds = [1.0, 5.0, 10.0, 25.0]
    
    print("\n🔔 Creating billing alerts...")
    for threshold in thresholds:
        alert_name = f"billing-alert-{threshold:.0f}usd"
        create_billing_alert(alert_name, threshold, topic_arn)
    
    # Create service alerts
    print("\n📊 Creating service-specific alerts...")
    create_service_specific_alerts(topic_arn)
    
    # Generate report
    print("\n📋 Generating cost report...")
    report = create_cost_report()
    print(report)
    
    print("\n✅ Cost monitoring setup complete!")
    print("📧 Don't forget to confirm your email subscription!")


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Set up AWS cost monitoring')
    parser.add_argument('--email', required=True, help='Email for cost alerts')
    parser.add_argument('--report-only', action='store_true', help='Generate report only')
    
    args = parser.parse_args()
    
    if args.report_only:
        report = create_cost_report()
        print(report)
    else:
        # Simulate Lambda event
        event = {
            'email': args.email,
            'setup_alerts': True,
            'generate_report': True
        }
        
        result = lambda_handler(event, None)
        print(json.dumps(json.loads(result['body']), indent=2))