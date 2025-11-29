import { dateService } from './dateService.js'
import { reportService } from './api.js'
import { RESTAURANT_ID_MAP } from '../utils/constants.js'

export const autoLoadService = {
    async loadLastMonthData() {
        try {
            console.log('🚀 Auto-load: Starting last month data fetch')

            // Calculate last month date range (full month from 1st to last day)
            const today = new Date()
            console.log(`🗓️ Today is: ${today.toDateString()}`)

            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1) // First day of last month
            const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0) // Last day of last month

            console.log(`🗓️ Last month start: ${lastMonth.toDateString()}`)
            console.log(`🗓️ Last month end: ${lastMonthEnd.toDateString()}`)

            // API seems to have off-by-one error, so adjust the request dates
            // Request one day later for start and one day later for end to get the correct month
            const apiStartDate = new Date(lastMonth)
            apiStartDate.setDate(apiStartDate.getDate() + 1) // Start from 2nd to get 1st

            const apiEndDate = new Date(lastMonthEnd)
            apiEndDate.setDate(apiEndDate.getDate() + 1) // End on next day to get last day

            const startDate = apiStartDate.toISOString().split('T')[0]
            const endDate = apiEndDate.toISOString().split('T')[0]

            // But keep the display dates as the actual month dates
            const displayStartDate = lastMonth.toISOString().split('T')[0]
            const displayEndDate = lastMonthEnd.toISOString().split('T')[0]

            console.log(`📅 Auto-load: Requesting API dates ${startDate} to ${endDate} (adjusted for API quirk)`)
            console.log(`📅 Auto-load: Will display as ${displayStartDate} to ${displayEndDate}`)
            console.log(`📅 Auto-load: Last month was ${lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`)

            // Get all available restaurant platform IDs
            const availableRestaurantIds = this.getAllAvailableRestaurantIds()

            if (availableRestaurantIds.length === 0) {
                console.log('❌ Auto-load: No restaurant IDs available')
                return null
            }

            console.log(`🎲 Auto-load: Found ${availableRestaurantIds.length} available restaurant platform combinations`)

            // Shuffle the array and try restaurants randomly, but limit to first 5 to avoid endless calls
            const shuffledIds = this.shuffleArray([...availableRestaurantIds]).slice(0, 5)
            console.log(`🔍 Auto-load: Will check first ${shuffledIds.length} restaurants`)

            // Try each restaurant to find one with recent data
            for (const restaurantInfo of shuffledIds) {
                console.log(`🔍 Auto-load: Trying to fetch data for ${restaurantInfo.name} (${restaurantInfo.platform}) - ${restaurantInfo.id}`)

                try {
                    // Skip getLastDate check and directly try to fetch dashboard data
                    console.log(`📊 Auto-load: Directly fetching dashboard data for ${restaurantInfo.name} (${restaurantInfo.platform})`)

                    // Fetch consolidated insights for this restaurant with timeout
                    const dashboardTimeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Dashboard fetch timeout')), 15000) // 15 second timeout
                    )

                    console.log(`📊 Auto-load: Calling API with dates: ${startDate} to ${endDate}`)

                    const dashboardData = await Promise.race([
                        reportService.getConsolidatedInsights(
                            restaurantInfo.id,
                            startDate,
                            endDate,
                            'day' // Use daily grouping for auto-load
                        ),
                        dashboardTimeoutPromise
                    ])

                    // If dashboard fetch failed, try next restaurant
                    if (!dashboardData) {
                        console.log(`⚠️ Auto-load: Failed to fetch dashboard data for ${restaurantInfo.name} (${restaurantInfo.platform}), trying next restaurant`)
                        continue // Try next restaurant
                    }

                    // Parse the response
                    let parsedData
                    if (typeof dashboardData.body === 'string') {
                        parsedData = JSON.parse(dashboardData.body)
                    } else {
                        parsedData = dashboardData
                    }

                    // Check if parsed data has actual insights
                    const insights = parsedData.body?.consolidatedInsights || parsedData.consolidatedInsights
                    if (!insights) {
                        console.log(`⚠️ Auto-load: No consolidatedInsights found for ${restaurantInfo.name} (${restaurantInfo.platform}), trying next restaurant`)
                        continue // Try next restaurant
                    }

                    // Check if the insights have meaningful data (not empty)
                    if (!insights.grossSale || insights.grossSale === 0) {
                        console.log(`⚠️ Auto-load: Empty/zero gross sale for ${restaurantInfo.name} (${restaurantInfo.platform}), trying next restaurant`)
                        continue // Try next restaurant
                    }

                    console.log(`🎉 Auto-load: Found valid data for ${restaurantInfo.name} (${restaurantInfo.platform})`)
                    console.log(`📊 Auto-load: Data structure:`, {
                        hasBody: !!parsedData.body,
                        hasConsolidatedInsights: !!insights,
                        grossSale: insights.grossSale,
                        structure: Object.keys(parsedData)
                    })

                    // Structure the response to match what the Dashboard expects
                    const enhancedData = {
                        results: [parsedData], // Keep the original structure
                        details: [{
                            id: restaurantInfo.id,
                            name: `${restaurantInfo.name} (Auto-loaded)`,
                            platform: restaurantInfo.platform,
                            key: restaurantInfo.key
                        }],
                        selections: {
                            restaurants: [restaurantInfo.key],
                            channels: [restaurantInfo.platform],
                            startDate: displayStartDate, // Use the display dates (2025-10-01)
                            endDate: displayEndDate,     // Use the display dates (2025-10-31)
                            groupBy: 'total'
                        },
                        groupBy: 'total',
                        isAutoLoaded: true,
                        excludedChannels: []
                    }

                    console.log(`🎉 Auto-load: Successfully loaded data for ${restaurantInfo.name} (${restaurantInfo.platform}) with gross sale: ${insights.grossSale}`)
                    console.log(`📋 Auto-load: Setting selections with dates:`, {
                        startDate: displayStartDate,
                        endDate: displayEndDate
                    })
                    console.log(`📋 Auto-load: Full enhanced data:`, enhancedData)
                    return enhancedData

                } catch (error) {
                    console.warn(`⚠️ Auto-load: Error fetching data for ${restaurantInfo.name} (${restaurantInfo.platform}): ${error.message}, trying next restaurant`)
                    continue // Try next restaurant on any error
                }
            }

            console.log('ℹ️ Auto-load: No recent data found for any restaurant')
            return null

        } catch (error) {
            console.error('❌ Auto-load: Error loading last month data:', error)
            return null
        }
    },

    // Get all available restaurant platform IDs from constants
    getAllAvailableRestaurantIds() {
        const availableIds = []

        Object.entries(RESTAURANT_ID_MAP).forEach(([key, restaurant]) => {
            // Add each platform that has an ID
            if (restaurant.zomato && restaurant.zomato.trim() !== '') {
                availableIds.push({
                    id: restaurant.zomato,
                    name: restaurant.name,
                    platform: 'zomato',
                    key: key
                })
            }

            if (restaurant.swiggy && restaurant.swiggy.trim() !== '') {
                availableIds.push({
                    id: restaurant.swiggy,
                    name: restaurant.name,
                    platform: 'swiggy',
                    key: key
                })
            }

            if (restaurant.takeaway && restaurant.takeaway.trim() !== '') {
                availableIds.push({
                    id: restaurant.takeaway,
                    name: restaurant.name,
                    platform: 'takeaway',
                    key: key
                })
            }

            if (restaurant.subs && restaurant.subs.trim() !== '') {
                availableIds.push({
                    id: restaurant.subs,
                    name: restaurant.name,
                    platform: 'subs',
                    key: key
                })
            }
        })

        return availableIds
    },

    // Shuffle array to randomize restaurant selection
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]
        }
        return array
    }
}