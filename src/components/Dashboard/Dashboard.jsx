import React, { useState, useEffect } from 'react'
import SummaryCards from './SummaryCards.jsx'
import ChartsGrid from '../Charts/ChartsGrid.jsx'
import ExpensesSection from '../PnL/ExpensesSection.jsx'
import MissingDatesIndicator from './MissingDatesIndicator.jsx'
import { isFullMonthSelection } from '../../utils/helpers'

const Dashboard = ({ data, user }) => {
    const { results, details, selections, groupBy, thresholds } = data
    const [processedData, setProcessedData] = useState(null)
    const [monthlyData, setMonthlyData] = useState(null)
    const [showPnL, setShowPnL] = useState(false)

    useEffect(() => {
        console.log('🔍 RAW API DATA:', { 
            groupBy, 
            results: results,
            details: details,
            selections: selections,
            resultsLength: results?.length,
            detailsLength: details?.length
        })
        
        // Log each result individually to see the structure
        results?.forEach((result, index) => {
            console.log(`📦 Result ${index}:`, result)
            console.log(`📋 Detail ${index}:`, details[index])
        })
        
        if (groupBy === 'total') {
            const processed = processTotalSummary(results, details)
            setProcessedData(processed)

            // Process monthly data for comparison
            const monthly = processMonthlyData(results, details)
            setMonthlyData(monthly)

            // Check if P&L should be shown
            const { restaurants, channels, startDate, endDate } = selections
            const shouldShowPnL = restaurants.length === 1 &&
                channels.length === 4 &&
                isFullMonthSelection(startDate, endDate)
            setShowPnL(shouldShowPnL)
        } else {
            const processed = processTimeSeries(results, details)
            setProcessedData(processed)

            // Process monthly data even for weekly/monthly views
            const monthly = processMonthlyData(results, details)
            console.log('Dashboard monthly data:', monthly)
            console.log('Dashboard monthly data length:', Object.keys(monthly || {}).length)
            setMonthlyData(monthly)
            setShowPnL(false)
        }
    }, [data])

    const processTotalSummary = (results, details) => {
        const individualRestaurantData = []
        const combinedData = {
            noOfOrders: 0, grossSale: 0, gstOnOrder: 0, discounts: 0, packings: 0,
            ads: 0, commissionAndTaxes: 0, payout: 0, netSale: 0, nbv: 0
        }
        let discountBreakdownData = null

        // Get selected channels from selections to map to results
        const selectedChannels = selections.channels || []
        console.log('🎯 Selected channels:', selectedChannels)

        // Process each API result and selected channel
        selectedChannels.forEach((channel, index) => {
            const apiResult = results[index]
            const detail = details[index]
            
            // Check if this result has data
            if (!apiResult || apiResult.message || !apiResult.consolidatedInsights) {
                console.log(`⚠️ No data for ${channel} - adding zero values`)
                
                // Add zero values for channels with no data
                individualRestaurantData.push({
                    name: `${detail?.name || 'Restaurant'} (${channel})`,
                    platform: channel,
                    metrics: {
                        noOfOrders: 0, grossSale: 0, gstOnOrder: 0, discounts: 0, packings: 0,
                        ads: 0, commissionAndTaxes: 0, payout: 0, netSale: 0, nbv: 0,
                        grossSaleAfterGST: 0, commissionPercent: 0, discountPercent: 0, adsPercent: 0
                    }
                })
                return
            }

            const insights = apiResult.consolidatedInsights
            console.log(`✅ Found data for ${channel}:`, insights)

            // Add this channel's data to individual results
            const grossSaleAfterGST = insights.grossSale - (insights.gstOnOrder || 0)
            individualRestaurantData.push({
                name: `${detail.name} (${channel})`,
                platform: channel,
                metrics: {
                    ...insights,
                    grossSaleAfterGST,
                    commissionPercent: insights.nbv > 0 ? (insights.commissionAndTaxes / insights.nbv * 100) : 0,
                    discountPercent: grossSaleAfterGST > 0 ? (insights.discounts / grossSaleAfterGST * 100) : 0,
                    adsPercent: grossSaleAfterGST > 0 ? (insights.ads / grossSaleAfterGST * 100) : 0
                }
            })

            // Add to combined totals (only for channels with data)
            Object.keys(combinedData).forEach(key => {
                combinedData[key] += (insights[key] || 0)
            })

            // Get discount breakdown if available
            if (apiResult.discountBreakdown) {
                discountBreakdownData = {
                    ...apiResult.discountBreakdown,
                    platform: channel
                }
            }
        })

        // Calculate combined percentages
        const combinedGrossSaleAfterGST = combinedData.grossSale - combinedData.gstOnOrder
        combinedData.grossSaleAfterGST = combinedGrossSaleAfterGST
        combinedData.commissionPercent = combinedData.nbv > 0 ? (combinedData.commissionAndTaxes / combinedData.nbv * 100) : 0
        combinedData.discountPercent = combinedGrossSaleAfterGST > 0 ? (combinedData.discounts / combinedGrossSaleAfterGST * 100) : 0
        combinedData.adsPercent = combinedGrossSaleAfterGST > 0 ? (combinedData.ads / combinedGrossSaleAfterGST * 100) : 0

        console.log('📊 Final individual data:', individualRestaurantData)
        console.log('📊 Final combined data:', combinedData)

        return {
            type: 'total',
            combinedData,
            individualData: individualRestaurantData,
            discountBreakdown: discountBreakdownData
        }
    }

    const processMonthlyData = (results, details) => {
        const monthlyData = {}
        const keysToSum = [
            "noOfOrders", "grossSale", "gstOnOrder", "discounts", "packings",
            "ads", "commissionAndTaxes", "payout", "netSale", "nbv"
        ]

        console.log('Processing monthly data from results:', results)

        results.forEach((data, index) => {
            // Log the data being processed
            console.log('Processing result:', index, data)

            const timeSeriesData = data.body?.timeSeriesData || data.timeSeriesData || []
            console.log('Time series data:', timeSeriesData)

            if (groupBy === 'total') {
                // For total view, process from time series data
                timeSeriesData.forEach(periodData => {
                    const period = periodData.period
                    const monthKey = period.substring(0, 7) // Gets YYYY-MM

                    if (!monthlyData[monthKey]) {
                        monthlyData[monthKey] = {}
                        keysToSum.forEach(key => monthlyData[monthKey][key] = 0)
                    }

                    // Sum data from all platforms for this period
                    const platforms = ['zomato', 'swiggy', 'takeaway', 'subs']
                    platforms.forEach(platform => {
                        const platformData = periodData[platform] || {}
                        keysToSum.forEach(key => {
                            if (platformData[key] && typeof platformData[key] === 'number') {
                                monthlyData[monthKey][key] += platformData[key]
                            }
                        })
                    })
                })
            } else {
                // For weekly/monthly view, process from consolidated insights
                const insights = data.body?.consolidatedInsights || data.consolidatedInsights || {}
                if (Object.keys(insights).length > 0) {
                    const yearMonth = selections.startDate.substring(0, 7)  // Use the selected month
                    if (!monthlyData[yearMonth]) {
                        monthlyData[yearMonth] = {}
                        keysToSum.forEach(key => monthlyData[yearMonth][key] = 0)
                    }
                    keysToSum.forEach(key => {
                        if (insights[key] && typeof insights[key] === 'number') {
                            monthlyData[yearMonth][key] += insights[key]
                        }
                    })
                }
            }
        })

        // Calculate derived metrics for each month
        Object.keys(monthlyData).forEach(month => {
            const data = monthlyData[month]
            data.grossSaleAfterGST = data.grossSale - (data.gstOnOrder || 0)
            data.commissionPercent = data.nbv > 0 ? (data.commissionAndTaxes / data.nbv * 100) : 0
            data.discountPercent = data.grossSaleAfterGST > 0 ? (data.discounts / data.grossSaleAfterGST * 100) : 0
            data.adsPercent = data.grossSaleAfterGST > 0 ? (data.ads / data.grossSaleAfterGST * 100) : 0
        })

        // Return monthly data regardless of the number of months
        return monthlyData
    }

    const processTimeSeries = (results, details) => {
        const timeSeries = {}
        results.forEach((data, index) => {
            const platform = details[index].platform
            const timeData = data.body?.timeSeriesData || data.timeSeriesData || []
            timeData.forEach(periodData => {
                let period = periodData.period
                if (groupBy === 'month') {
                    period = period.substring(0, 7) // "YYYY-MM-DD" -> "YYYY-MM"
                }

                if (!timeSeries[period]) timeSeries[period] = {}

                const platformData = periodData[platform] || {}
                if (!timeSeries[period][platform]) {
                    timeSeries[period][platform] = platformData
                } else {
                    for (const key in platformData) {
                        if (typeof platformData[key] === 'number') {
                            timeSeries[period][platform][key] += platformData[key]
                        }
                    }
                }
            })
        })

        return {
            type: 'timeSeries',
            timeSeriesData: timeSeries
        }
    }

    if (!processedData) {
        return (
            <div className="card">
                <div className="status loading">
                    Processing data...
                </div>
            </div>
        )
    }

    // Calculate total summary from time series data when in weekly/monthly view
    const calculateSummaryFromTimeSeries = (timeSeriesData) => {
        const summary = {
            combinedData: {
                noOfOrders: 0, grossSale: 0, gstOnOrder: 0, discounts: 0,
                packings: 0, ads: 0, commissionAndTaxes: 0, payout: 0,
                netSale: 0, nbv: 0
            },
            individualData: []
        }

        // Initialize restaurant-wise data
        const restaurantData = {}

        // Sum up all metrics for each period
        Object.values(timeSeriesData).forEach(periodData => {
            Object.entries(periodData).forEach(([platform, metrics]) => {
                // Add to combined totals
                Object.keys(summary.combinedData).forEach(key => {
                    if (typeof metrics[key] === 'number') {
                        summary.combinedData[key] += metrics[key]
                    }
                })

                // Accumulate restaurant-wise data
                if (!restaurantData[platform]) {
                    restaurantData[platform] = {
                        noOfOrders: 0, grossSale: 0, gstOnOrder: 0, discounts: 0,
                        packings: 0, ads: 0, commissionAndTaxes: 0, payout: 0,
                        netSale: 0, nbv: 0
                    }
                }
                Object.keys(restaurantData[platform]).forEach(key => {
                    if (typeof metrics[key] === 'number') {
                        restaurantData[platform][key] += metrics[key]
                    }
                })
            })
        })

        // Calculate percentages for combined data
        const grossSaleAfterGST = summary.combinedData.grossSale - (summary.combinedData.gstOnOrder || 0)
        summary.combinedData.grossSaleAfterGST = grossSaleAfterGST
        summary.combinedData.commissionPercent = summary.combinedData.nbv > 0
            ? (summary.combinedData.commissionAndTaxes / summary.combinedData.nbv * 100)
            : 0
        summary.combinedData.discountPercent = grossSaleAfterGST > 0
            ? (summary.combinedData.discounts / grossSaleAfterGST * 100)
            : 0
        summary.combinedData.adsPercent = grossSaleAfterGST > 0
            ? (summary.combinedData.ads / grossSaleAfterGST * 100)
            : 0

        // Process individual restaurant data
        Object.entries(restaurantData).forEach(([platform, metrics]) => {
            const grossSaleAfterGST = metrics.grossSale - (metrics.gstOnOrder || 0)
            summary.individualData.push({
                name: platform,
                platform,
                metrics: {
                    ...metrics,
                    grossSaleAfterGST,
                    commissionPercent: metrics.nbv > 0 ? (metrics.commissionAndTaxes / metrics.nbv * 100) : 0,
                    discountPercent: grossSaleAfterGST > 0 ? (metrics.discounts / grossSaleAfterGST * 100) : 0,
                    adsPercent: grossSaleAfterGST > 0 ? (metrics.ads / grossSaleAfterGST * 100) : 0
                }
            })
        })

        return summary
    }

    // Get the appropriate summary data based on groupBy
    const totalSummary = groupBy === 'total'
        ? processedData
        : processedData.type === 'timeSeries'
            ? calculateSummaryFromTimeSeries(processedData.timeSeriesData)
            : null

    const { startDate, endDate } = selections

    // Generate restaurant names prefix for title
    let restaurantPrefix = ''
    let fullRestaurantList = ''
    let shouldShowHover = false

    if (details && details.length > 0) {
        // Create display names that include both name and ID when available
        const displayNames = details.map(detail => {
            const hasRealName = detail.name && !detail.name.startsWith('Restaurant ')
            if (hasRealName) {
                return `${detail.name} (${detail.id})`
            } else {
                return detail.id
            }
        })

        // Create full list for hover tooltip
        fullRestaurantList = displayNames.join(', ')

        if (displayNames.length === 1) {
            restaurantPrefix = `${displayNames[0]} - `
        } else if (displayNames.length <= 2) {
            restaurantPrefix = `${displayNames.join(', ')} - `
        } else {
            restaurantPrefix = `${displayNames.slice(0, 2).join(', ')} & ${displayNames.length - 2} more - `
            shouldShowHover = true
        }
    }

    const title = `${restaurantPrefix}${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} Report (${startDate} to ${endDate})`

    if (!totalSummary) {
        return (
            <div className="card">
                <div className="status loading">
                    Processing summary data...
                </div>
            </div>
        )
    }

    return (
        <div className="card">
            <h1 className="dashboard-title" title={shouldShowHover ? `All restaurants: ${fullRestaurantList}` : undefined}>
                {title}
            </h1>

            {/* Show missing dates indicator for any data type */}
            {processedData && selections?.startDate && selections?.endDate && (
                <>
                    {console.log('🚀 Rendering MissingDatesIndicator with:', {
                        type: processedData.type,
                        timeSeriesData: processedData.timeSeriesData,
                        selections
                    })}
                    <MissingDatesIndicator
                        timeSeriesData={processedData.timeSeriesData}
                        selections={selections}
                        dataType={processedData.type}
                        user={user}
                    />
                </>
            )}

            {totalSummary.combinedData && (
                <>
                    <SummaryCards
                        data={totalSummary.combinedData}
                        selections={selections}
                        discountBreakdown={totalSummary.discountBreakdown}
                        thresholds={thresholds}
                        monthlyData={monthlyData}
                        groupBy={groupBy}
                    />

                    {/* Only show comparison charts for total view */}
                    {groupBy === 'total' && (
                        <>
                            <ChartsGrid
                                type="comparison"
                                data={totalSummary.individualData}
                            />
                            {showPnL && (
                                <ExpensesSection
                                    selections={selections}
                                    grossSale={totalSummary.combinedData.grossSale}
                                    grossSaleAfterGST={totalSummary.combinedData.grossSaleAfterGST}
                                    netSale={totalSummary.combinedData.netSale}
                                />
                            )}
                        </>
                    )}

                    {/* Show time series charts for monthly or weekly grouping */}
                    {processedData.type === 'timeSeries' && (
                        <>
                            {console.log('🚀 Passing to ChartsGrid:', {
                                type: 'timeSeries',
                                data: processedData.timeSeriesData,
                                groupBy: groupBy,
                                samplePeriod: Object.keys(processedData.timeSeriesData)[0],
                                sampleData: processedData.timeSeriesData[Object.keys(processedData.timeSeriesData)[0]]
                            })}
                            <ChartsGrid
                                type="timeSeries"
                                data={processedData.timeSeriesData}
                                groupBy={groupBy}
                            />
                        </>
                    )}
                </>
            )}
        </div>
    )
}

export default Dashboard