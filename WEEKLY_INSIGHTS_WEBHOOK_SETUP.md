# Automatic Weekly Insights Email with n8n

This document explains how to set up automatic weekly insights emails when users upload sales data.

## Overview

Simple automatic system:
1. **User uploads sales data** → `insights-with-webhook.py` processes it
2. **When a week is complete** (≥4 days of data) → Automatically sends webhook to n8n
3. **n8n receives webhook** → Sends email using your template

## Architecture

```
Sales Data Upload → insights-with-webhook.py → Daily Insights (S3)
                                           ↓ (when week complete)
                                    n8n Webhook → Your Email Template → Send Email
```

## Lambda Function

### insights-with-webhook.py
This replaces your current `insights.py` and adds automatic weekly insights:

- **Processes daily sales data** (same as before)
- **Stores daily insights in S3** (same as before)  
- **NEW**: Automatically checks if a week is complete (≥4 days of data)
- **NEW**: Sends webhook to n8n when week is complete

**Environment Variables:**
- `BUCKET_NAME` - S3 bucket for storing insights
- `JOBS_TABLE_NAME` - DynamoDB table for job tracking
- `N8N_WEBHOOK_URL` - Your n8n webhook URL for email automation

## Simple Webhook Payload

The webhook sent to n8n contains just email and insights:

```json
{
  "email": "user@example.com",
  "insights": {
    "restaurantId": "12345",
    "weekStartDate": "2024-01-01",
    "weekEndDate": "2024-01-07",
    "daysWithData": 6,
    "summary": {
      "totalOrders": 150,
      "grossSale": 25000.50,
      "gstOnOrder": 2500.05,
      "discounts": 1500.00,
      "packings": 300.00,
      "commissionAndTaxes": 3750.75,
      "payout": 17200.00,
      "ads": 500.00,
      "netSale": 16700.00,
      "nbv": 1000.05,
      "platform": "zomato",
      "dailyBreakdown": [
        {
          "date": "2024-01-01",
          "orders": 25,
          "grossSale": 4200.00,
          "netSale": 2800.00,
          "payout": 2900.00
        }
      ],
      "discountBreakdown": {
        "65": {
          "orders": 50,
          "discount": 750.00
        }
      }
    },
    "generatedAt": "2024-01-08T10:30:00Z"
  }
}
```

## n8n Workflow Setup

### 1. Create Webhook Node
- Set up a webhook node in n8n to receive the POST request
- Configure the webhook URL and provide it as `N8N_WEBHOOK_URL` environment variable

### 2. Use Your Email Template
- The webhook sends simple data: `email` and `insights`
- Use your existing email template with the insights data
- Send to the `email` from the webhook payload

## Deployment Steps

### 1. Replace Your Current insights.py
- Replace your current `insights.py` with `insights-with-webhook.py`
- Or rename `insights-with-webhook.py` to `insights.py`

### 2. Add Environment Variable
Add the n8n webhook URL to your Lambda function:

```bash
aws lambda update-function-configuration --function-name your-insights-function \
  --environment Variables='{
    "BUCKET_NAME":"your-existing-s3-bucket",
    "JOBS_TABLE_NAME":"your-existing-jobs-table",
    "N8N_WEBHOOK_URL":"https://your-n8n-instance.com/webhook/weekly-insights"
  }'
```

### 3. Set up n8n Webhook
1. Create a webhook node in n8n
2. Configure it to receive POST requests with JSON payload
3. Use your existing email template with the insights data
4. Test with sample data

That's it! No additional API endpoints or scheduling needed.

## How It Works

### Automatic Flow
1. **User uploads sales data** via your existing system
2. **insights-with-webhook.py processes it** (same as before)
3. **After processing each day**, it checks: "Do we have ≥4 days for this week?"
4. **If yes**: Automatically sends webhook to n8n with email + insights
5. **n8n receives webhook**: Uses your template to send email

### What Gets Checked
- **Week completion**: Monday-Sunday, needs ≥4 days of data
- **Only new weeks**: Won't send duplicate emails for same week
- **Per restaurant**: Each restaurant gets separate weekly insights

## Simple Setup

### Step 1: Replace insights.py
```bash
# Rename your current insights function
mv insights.py insights-old.py
mv insights-with-webhook.py insights.py
```

### Step 2: Add webhook URL
Just add one environment variable: `N8N_WEBHOOK_URL=https://your-n8n-webhook-url`

### Step 3: Done!
Weekly insights will now happen automatically when users upload data.

## Webhook Payload You'll Receive

```json
{
  "email": "restaurant@example.com",
  "insights": {
    "restaurantId": "12345",
    "weekStartDate": "2024-01-01", 
    "weekEndDate": "2024-01-07",
    "daysWithData": 6,
    "summary": { /* all the weekly data */ }
  }
}
```

Use `insights.summary` in your email template - it has all the weekly totals, daily breakdown, and discount breakdown.