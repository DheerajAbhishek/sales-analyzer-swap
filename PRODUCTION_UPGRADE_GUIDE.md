# Production Upgrade Guide: Auto-Load, Missing Dates & Percentage Features

This document outlines all the changes needed to upgrade the production dashboard with auto-loading functionality, missing dates detection, and percentage displays in summary cards.

## 🎯 Features to Implement

1. **Auto-Load Service**: Automatically load last month's data for existing users on login
2. **Missing Dates Detection**: Show users which dates have missing data in their selected periods
3. **Percentage Displays**: Add percentage calculations to all summary cards relative to gross sale after GST
4. **Dashboard Data Persistence**: Persist manually fetched dashboard data across page reloads

## 📋 Prerequisites

The production project should already have:
- ✅ `get-last-date` lambda function and API endpoint
- ✅ Basic dashboard functionality
- ✅ User authentication and restaurant management

## 🚀 Implementation Steps

### Step 1: Create Auto-Load Service

**File: `src/services/autoLoadService.js`** (NEW FILE)
```javascript
import { dateService } from './dateService.js'
import { restaurantService } from './api.js'

export const autoLoadService = {
    async loadLastMonthData(userRestaurants, userEmail) {
        try {
            console.log('🚀 Auto-load: Starting last month data fetch for user')
            
            if (!userRestaurants || userRestaurants.length === 0) {
                console.log('❌ Auto-load: No restaurants available')
                return null
            }

            // Calculate last month date range
            const today = new Date()
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
            const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
            
            const startDate = lastMonth.toISOString().split('T')[0]
            const endDate = lastMonthEnd.toISOString().split('T')[0]
            
            console.log(`📅 Auto-load: Fetching data for ${startDate} to ${endDate}`)

            // Get restaurant names for proper display
            const restaurantNames = await this.getRestaurantNames(userRestaurants, userEmail)
            
            // Try each restaurant to find one with data
            for (const restaurant of userRestaurants) {
                console.log(`🔍 Auto-load: Checking restaurant ${restaurant.id} (${restaurantNames[restaurant.id] || 'Unknown'})`)
                
                // Check if this restaurant has data for the period
                const lastDateResult = await dateService.getLastAvailableDate(restaurant.id, userEmail)
                
                if (lastDateResult.success && lastDateResult.lastAvailableDate) {
                    const lastAvailable = new Date(lastDateResult.lastAvailableDate)
                    const periodStart = new Date(startDate)
                    
                    if (lastAvailable >= periodStart) {
                        console.log(`✅ Auto-load: Found data for ${restaurant.id}, fetching dashboard data`)
                        
                        // Import dashboard service dynamically to avoid circular imports
                        const { dashboardService } = await import('./api.js')
                        
                        const dashboardData = await dashboardService.fetchData({
                            restaurants: [restaurant.id],
                            channels: ['Zomato', 'Swiggy', 'Dineout', 'Direct'],
                            startDate,
                            endDate,
                            groupBy: 'total'
                        }, userEmail)
                        
                        if (dashboardData.success) {
                            // Add restaurant names to the response
                            const enhancedData = {
                                ...dashboardData,
                                restaurantNames,
                                isAutoLoaded: true
                            }
                            
                            console.log(`🎉 Auto-load: Successfully loaded data for ${restaurantNames[restaurant.id]}`)
                            return enhancedData
                        }
                    }
                }
            }
            
            console.log('ℹ️ Auto-load: No recent data found for any restaurant')
            return null
            
        } catch (error) {
            console.error('❌ Auto-load: Error loading last month data:', error)
            return null
        }
    },

    async getRestaurantNames(userRestaurants, userEmail) {
        try {
            const restaurantNames = {}
            
            for (const restaurant of userRestaurants) {
                try {
                    const metadata = await restaurantService.getMetadata(restaurant.id, userEmail)
                    if (metadata.success && metadata.data) {
                        restaurantNames[restaurant.id] = metadata.data.restaurantName || `Restaurant ${restaurant.id}`
                    } else {
                        restaurantNames[restaurant.id] = `Restaurant ${restaurant.id}`
                    }
                } catch (error) {
                    console.warn(`⚠️ Auto-load: Could not get name for restaurant ${restaurant.id}:`, error)
                    restaurantNames[restaurant.id] = `Restaurant ${restaurant.id}`
                }
            }
            
            return restaurantNames
        } catch (error) {
            console.error('❌ Auto-load: Error fetching restaurant names:', error)
            return {}
        }
    }
}
```

### Step 2: Update Date Service for Missing Dates

**File: `src/services/dateService.js`** (UPDATE EXISTING)

Add this method to the existing `dateService` object:

```javascript
async checkMissingDates(restaurantId, startDate, endDate, businessEmail = null) {
    try {
        const requestBody = { 
            restaurantId, 
            startDate, 
            endDate 
        }
        if (businessEmail) {
            requestBody.businessEmail = businessEmail
        }
        
        const response = await fetch(`${API_BASE_URL}/check-missing-dates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error checking missing dates:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
```

### Step 3: Create Missing Dates Component

**File: `src/components/Dashboard/MissingDatesIndicator.jsx`** (NEW FILE)
```javascript
import React, { useState, useEffect } from 'react'
import { dateService } from '../../services/dateService'

const MissingDatesIndicator = ({ timeSeriesData, selections, dataType, user }) => {
    const [showDetails, setShowDetails] = useState(false)
    const [missingDates, setMissingDates] = useState([])
    const [loading, setLoading] = useState(false)

    console.log('🔍 MissingDatesIndicator props:', { timeSeriesData, selections, dataType })

    // Function to generate all dates in range
    const generateDateRange = (startDate, endDate) => {
        const dates = []
        const current = new Date(startDate)
        const end = new Date(endDate)
        
        while (current <= end) {
            dates.push(current.toISOString().split('T')[0])
            current.setDate(current.getDate() + 1)
        }
        
        console.log('📅 Generated date range:', { startDate, endDate, totalDates: dates.length })
        return dates
    }

    // Function to find missing dates from time series data
    const findMissingDatesFromTimeSeries = () => {
        if (!timeSeriesData || !selections?.startDate || !selections?.endDate) {
            console.log('❌ Missing required data for missing dates check:', { 
                hasTimeSeriesData: !!timeSeriesData, 
                hasStartDate: !!selections?.startDate, 
                hasEndDate: !!selections?.endDate 
            })
            return []
        }

        // Get all expected dates in range
        const expectedDates = generateDateRange(selections.startDate, selections.endDate)
        
        // Get actual dates that have data
        const actualDates = Object.keys(timeSeriesData)
        console.log('📊 Actual dates with data:', actualDates)
        
        // Find missing dates
        const missing = expectedDates.filter(date => !actualDates.includes(date))
        
        console.log('⚠️ Missing dates found:', missing)
        return missing
    }

    // For total summary data, we need to check each date individually using API
    useEffect(() => {
        if (dataType === 'timeSeries') {
            // Use time series data directly
            const missing = findMissingDatesFromTimeSeries()
            setMissingDates(missing)
        } else if (dataType === 'total' && selections?.startDate && selections?.endDate) {
            // For total summary, use API to check missing dates
            console.log('📊 Total summary mode - checking missing dates via API')
            setLoading(true)
            
            // Get the first restaurant ID from the dashboard data
            const restaurantId = selections?.restaurants?.[0] // Assuming first restaurant
            
            if (restaurantId) {
                const businessEmail = user?.businessEmail || user?.email
                console.log('📧 Using business email for missing dates check:', businessEmail)
                
                dateService.checkMissingDates(
                    restaurantId, 
                    selections.startDate, 
                    selections.endDate,
                    businessEmail
                ).then(result => {
                    if (result.success) {
                        console.log('✅ Missing dates API result:', result.data)
                        setMissingDates(result.data.missingDates || [])
                    } else {
                        console.log('❌ Failed to get missing dates:', result.error)
                        setMissingDates([])
                    }
                    setLoading(false)
                }).catch(error => {
                    console.error('❌ Error calling missing dates API:', error)
                    setMissingDates([])
                    setLoading(false)
                })
            } else {
                console.log('❌ No restaurant ID available for missing dates check')
                setLoading(false)
            }
        }
    }, [timeSeriesData, selections, dataType, user])

    // Show loading state
    if (loading) {
        return (
            <div style={{
                background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                border: '1px solid #9ca3af',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2em' }}>🔍</span>
                    <p style={{ margin: 0, fontWeight: '600', color: '#374151', fontSize: '0.9rem' }}>
                        Checking for missing data periods...
                    </p>
                </div>
            </div>
        )
    }

    const calculatedMissingDates = missingDates

    // For total summary, check if we have results from API
    if (dataType === 'total') {
        const daysDiff = Math.ceil((new Date(selections.endDate) - new Date(selections.startDate)) / (1000 * 60 * 60 * 24))
        
        // If we have missing dates from API, show them
        if (calculatedMissingDates.length > 0) {
            // Continue to show the missing dates UI below
        } else {
            // Show data coverage info
            return (
                <div style={{
                    background: 'linear-gradient(135deg, #e0f2fe 0%, #b3e5fc 100%)',
                    border: '1px solid #0288d1',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    marginBottom: '16px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2em' }}>📊</span>
                        <div>
                            <p style={{ margin: 0, fontWeight: '600', color: '#01579b', fontSize: '0.9rem' }}>
                                Complete Data Coverage
                            </p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#0277bd' }}>
                                All {daysDiff + 1} day{daysDiff !== 0 ? 's' : ''} have data available
                            </p>
                        </div>
                    </div>
                </div>
            )
        }
    }
    
    console.log('🎯 MissingDatesIndicator render:', { 
        missingDatesCount: calculatedMissingDates.length, 
        willRender: calculatedMissingDates.length > 0,
        dataType 
    })
    
    // Don't show anything if no missing dates
    if (calculatedMissingDates.length === 0) {
        console.log('✅ No missing dates - component hidden')
        return null
    }

    // Format date for display
    const formatDate = (dateStr) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString('en-IN', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
        })
    }

    // Group consecutive dates
    const groupConsecutiveDates = (dates) => {
        if (dates.length === 0) return []
        
        const groups = []
        let currentGroup = [dates[0]]
        
        for (let i = 1; i < dates.length; i++) {
            const current = new Date(dates[i])
            const previous = new Date(dates[i-1])
            const dayDiff = (current - previous) / (1000 * 60 * 60 * 24)
            
            if (dayDiff === 1) {
                currentGroup.push(dates[i])
            } else {
                groups.push(currentGroup)
                currentGroup = [dates[i]]
            }
        }
        groups.push(currentGroup)
        
        return groups
    }

    const dateGroups = groupConsecutiveDates(calculatedMissingDates)
    
    // Format date groups for display
    const formatDateGroups = (groups) => {
        return groups.map(group => {
            if (group.length === 1) {
                return formatDate(group[0])
            } else {
                return `${formatDate(group[0])} - ${formatDate(group[group.length - 1])}`
            }
        })
    }

    const formattedGroups = formatDateGroups(dateGroups)

    return (
        <div style={{
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            border: '1px solid #f59e0b',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '16px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1.2em' }}>⚠️</span>
                <div>
                    <p style={{ margin: 0, fontWeight: '600', color: '#92400e', fontSize: '0.9rem' }}>
                        Missing Data Periods
                    </p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#a16207' }}>
                        {calculatedMissingDates.length} {calculatedMissingDates.length === 1 ? 'date' : 'dates'} with no data found in selected period
                    </p>
                </div>
                <button
                    onClick={() => setShowDetails(!showDetails)}
                    style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: '1px solid #f59e0b',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        color: '#92400e',
                        cursor: 'pointer',
                        fontWeight: '500'
                    }}
                >
                    {showDetails ? 'Hide' : 'Show'} Details
                </button>
            </div>
            
            {showDetails && (
                <div style={{
                    background: 'rgba(255, 255, 255, 0.5)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    color: '#78350f'
                }}>
                    <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>Missing dates:</p>
                    <p style={{ margin: 0, lineHeight: '1.4' }}>
                        {formattedGroups.join(', ')}
                    </p>
                </div>
            )}
        </div>
    )
}

export default MissingDatesIndicator
```

### Step 4: Update Summary Cards with Percentages

**File: `src/components/Dashboard/SummaryCards.jsx`** (UPDATE EXISTING)

Add this function and modify the rendering logic:

```javascript
// Add this function inside the SummaryCards component
const calculatePercentage = (value, grossSaleAfterGST) => {
    if (!grossSaleAfterGST || grossSaleAfterGST === 0) return 0
    return Math.abs((value / grossSaleAfterGST) * 100)
}

// Update the card rendering to include percentages
// For each card except "Gross Sale", add percentage display:

// Example for Discounts card:
{
    title: "Discounts",
    value: formatCurrency(breakdown.discounts),
    percentage: `${calculatePercentage(breakdown.discounts, breakdown.grossSaleAfterGST).toFixed(1)}%`,
    color: getColorBasedOnThreshold(breakdown.discounts, thresholds?.discounts, 'discounts'),
    icon: "💸"
}

// Apply this pattern to: discounts, packings, ads, commissionAndTaxes, netSale, nbv
// DO NOT add percentage to grossSale and grossSaleAfterGST cards
```

### Step 5: Update Dashboard Component

**File: `src/components/Dashboard/Dashboard.jsx`** (UPDATE EXISTING)

1. Import the MissingDatesIndicator:
```javascript
import MissingDatesIndicator from './MissingDatesIndicator.jsx'
```

2. Update component props:
```javascript
const Dashboard = ({ data, user }) => {
```

3. Add MissingDatesIndicator to the render:
```javascript
// Add this after the console.log and before other dashboard content
{processedData && (
    <>
        <MissingDatesIndicator 
            timeSeriesData={processedData.timeSeriesData}
            selections={selections}
            dataType={processedData.type}
            user={user}
        />
    </>
)}
```

### Step 6: Update App.jsx for Auto-Loading & Data Persistence

**File: `src/App.jsx`** (UPDATE EXISTING)

1. Import auto-load service:
```javascript
import { autoLoadService } from './services/autoLoadService'
```

2. Add state for auto-load tracking:
```javascript
const [autoLoadAttempted, setAutoLoadAttempted] = useState(() => {
    return localStorage.getItem('autoLoadAttempted') === 'true'
})
```

3. Add dashboard data persistence function:
```javascript
const updateDashboardData = (data, isManual = false) => {
    setDashboardData(data)

    if (data) {
        const dataToSave = { ...data, isManuallyFetched: isManual }
        localStorage.setItem('dashboardData', JSON.stringify(dataToSave))
        console.log(isManual ? '💾 Persisted manual dashboard data' : '💾 Persisted auto-loaded dashboard data')
    } else {
        localStorage.removeItem('dashboardData')
        console.log('🗑️ Cleared persisted dashboard data')
    }
}
```

4. Add auto-load useEffect:
```javascript
// Auto-load data for existing users
useEffect(() => {
    const attemptAutoLoad = async () => {
        if (!user || !userRestaurants || autoLoadAttempted) {
            return
        }

        const savedData = localStorage.getItem('dashboardData')
        if (savedData) {
            try {
                const parsedData = JSON.parse(savedData)
                if (parsedData.isManuallyFetched) {
                    console.log('📋 Manual data found in localStorage, skipping auto-load')
                    setDashboardData(parsedData)
                    setAutoLoadAttempted(true)
                    localStorage.setItem('autoLoadAttempted', 'true')
                    return
                }
            } catch (error) {
                console.warn('⚠️ Error parsing saved dashboard data:', error)
            }
        }

        console.log('🚀 Attempting auto-load for existing user...')
        setLoading(true)

        try {
            const email = user.businessEmail || user.email
            const autoLoadedData = await autoLoadService.loadLastMonthData(userRestaurants, email)
            
            if (autoLoadedData) {
                updateDashboardData(autoLoadedData, false)
                console.log('✅ Auto-load successful')
            } else {
                console.log('ℹ️ No data available for auto-load')
            }
        } catch (error) {
            console.error('❌ Auto-load failed:', error)
        } finally {
            setLoading(false)
            setAutoLoadAttempted(true)
            localStorage.setItem('autoLoadAttempted', 'true')
        }
    }

    attemptAutoLoad()
}, [user, userRestaurants, autoLoadAttempted])
```

5. Update Dashboard component usage:
```javascript
<Dashboard
    data={dashboardData}
    user={user}
/>
```

6. Update logout function:
```javascript
const handleLogout = () => {
    authService.logout()
    setUser(null)
    setUserRestaurants(null)
    setDashboardData(null)
    // Clear auto-load tracking
    localStorage.removeItem('autoLoadAttempted')
    localStorage.removeItem('dashboardData')
    navigate('/')
}
```

### Step 7: Create Missing Dates Lambda Function

**File: `lambda/check-missing-dates.py`** (NEW FILE)
```python
import json
import boto3
import urllib.parse
from datetime import datetime, timedelta
from collections import defaultdict

def lambda_handler(event, context):
    """
    Check for missing dates in S3 bucket for given restaurant and date range
    """
    try:
        # Parse input
        if event.get('httpMethod') == 'POST':
            body = json.loads(event['body'])
        else:
            body = event
            
        restaurant_id = body.get('restaurantId')
        start_date = body.get('startDate')  # YYYY-MM-DD
        end_date = body.get('endDate')      # YYYY-MM-DD
        business_email = body.get('businessEmail')
        
        if not all([restaurant_id, start_date, end_date]):
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'error': 'Missing required parameters: restaurantId, startDate, endDate'
                })
            }
        
        # Initialize S3 client
        s3_client = boto3.client('s3')
        bucket_name = 'sale-dashboard-data'
        
        # Sanitize email for S3 path
        if business_email:
            user_folder = business_email.replace('@', '_at_').replace('.', '_dot_')
            prefix = f"users/{user_folder}/daily-insights/{restaurant_id}/"
        else:
            prefix = f"daily-insights/{restaurant_id}/"
        
        print(f"Checking missing dates for restaurant {restaurant_id} from {start_date} to {end_date}")
        print(f"S3 prefix: {prefix}")
        
        # Generate expected date range
        expected_dates = []
        current_date = datetime.strptime(start_date, '%Y-%m-%d')
        end_date_obj = datetime.strptime(end_date, '%Y-%m-%d')
        
        while current_date <= end_date_obj:
            expected_dates.append(current_date.strftime('%Y-%m-%d'))
            current_date += timedelta(days=1)
        
        print(f"Expected dates: {len(expected_dates)} days from {start_date} to {end_date}")
        
        # List objects in S3 to find available dates
        available_dates = set()
        
        try:
            paginator = s3_client.get_paginator('list_objects_v2')
            page_iterator = paginator.paginate(
                Bucket=bucket_name, 
                Prefix=prefix,
                PaginationConfig={'MaxItems': 1000, 'PageSize': 100}  # Optimize pagination
            )
            
            for page in page_iterator:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        key = obj['Key']
                        # Extract date from filename like: users/email/daily-insights/12345/2024-01-15.json
                        if key.endswith('.json'):
                            filename = key.split('/')[-1]
                            date_part = filename.replace('.json', '')
                            
                            # Validate date format and check if it's in our date range
                            try:
                                date_obj = datetime.strptime(date_part, '%Y-%m-%d')
                                # Only include dates in our range to optimize
                                if start_date <= date_part <= end_date:
                                    available_dates.add(date_part)
                            except ValueError:
                                continue
            
            print(f"Found {len(available_dates)} available dates in S3 for date range")
            
        except Exception as e:
            print(f"Error listing S3 objects: {str(e)}")
            return {
                'statusCode': 500,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'error': f'Failed to scan S3 bucket: {str(e)}'
                })
            }
        
        # Find missing dates
        missing_dates = [date for date in expected_dates if date not in available_dates]
        available_dates_list = sorted(list(available_dates.intersection(set(expected_dates))))
        
        print(f"Missing dates: {len(missing_dates)}")
        print(f"Available dates in range: {len(available_dates_list)}")
        
        result = {
            'success': True,
            'data': {
                'restaurantId': restaurant_id,
                'dateRange': {
                    'startDate': start_date,
                    'endDate': end_date,
                    'totalDays': len(expected_dates)
                },
                'availableDates': available_dates_list,
                'missingDates': missing_dates,
                'summary': {
                    'totalDaysRequested': len(expected_dates),
                    'daysWithData': len(available_dates_list),
                    'daysMissing': len(missing_dates),
                    'dataCompleteness': round((len(available_dates_list) / len(expected_dates)) * 100, 2) if expected_dates else 0
                }
            }
        }
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        print(f"Error in lambda_handler: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'success': False,
                'error': f'Internal server error: {str(e)}'
            })
        }
```

## 🔧 AWS Configuration

### Lambda Function Setup
1. **Create Lambda Function**: `check-missing-dates`
2. **Runtime**: Python 3.12
3. **Timeout**: 30 seconds (important!)
4. **Memory**: 256 MB
5. **IAM Permissions**: S3 read access to `sale-dashboard-data` bucket

### API Gateway Setup
1. **Create Method**: POST `/check-missing-dates`
2. **Integration**: Lambda Proxy Integration
3. **CORS**: Enable with proper headers
4. **Deploy**: Deploy to your stage

### Lambda IAM Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket",
                "s3:GetObject"
            ],
            "Resource": [
                "arn:aws:s3:::sale-dashboard-data",
                "arn:aws:s3:::sale-dashboard-data/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        }
    ]
}
```

## 🎯 Expected User Experience

### For Existing Users (Login):
1. ✅ Automatically loads last month's data
2. ✅ Shows restaurant name in dashboard title
3. ✅ Data persists across page reloads
4. ✅ Missing dates detection shows data gaps
5. ✅ Percentage displays on all summary cards

### For New Users (Signup):
1. ✅ Shows empty dashboard (as before)
2. ✅ No auto-load attempted
3. ✅ All other features work when they fetch data

## 🚀 Testing Checklist

- [ ] Auto-load works for users with existing data
- [ ] Auto-load skips for new users
- [ ] Missing dates component shows correctly
- [ ] Percentage displays work on summary cards
- [ ] Dashboard data persists across navigation
- [ ] Lambda function processes requests within timeout
- [ ] API Gateway endpoint responds correctly

## 📝 Notes

1. **S3 Path Structure**: Ensure your production S3 bucket follows the `users/{email}/daily-insights/{restaurant_id}/` structure
2. **Business Email**: The system uses `user.businessEmail || user.email` for S3 path generation
3. **Auto-Load Logic**: Only attempts once per session, skips if manual data exists
4. **Performance**: Lambda is optimized with pagination and date range filtering

This upgrade will significantly improve the user experience by providing immediate value on login while maintaining all existing functionality.