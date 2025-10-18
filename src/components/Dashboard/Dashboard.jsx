import React, { useState, useEffect } from 'react'
import SummaryCards from './SummaryCards.jsx'
import ChartsGrid from '../Charts/ChartsGrid.jsx'
import ExpensesSection from '../PnL/ExpensesSection.jsx'
import { isFullMonthSelection } from '../../utils/helpers'

const Dashboard = ({ data }) => {
    const { results, details, selections, groupBy, thresholds } = data
    const [processedData, setProcessedData] = useState(null)
    const [monthlyData, setMonthlyData] = useState(null)
    const [showPnL, setShowPnL] = useState(false)

    useEffect(() => {
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
        let individualRestaurantData = []
        let combinedData = null
        let discountBreakdownData = null

        const keysToSum = [
            "noOfOrders", "grossSale", "gstOnOrder", "discounts", "packings",
            "ads", "commissionAndTaxes", "payout", "netSale", "nbv"
        ]

        results.forEach((data, index) => {
            const insights = data.body?.consolidatedInsights || data.consolidatedInsights || {}
            if (Object.keys(insights).length === 0) return

            const detail = details[index]

            // Calculate percentages for individual restaurant using gross sale after GST
            const restaurantMetrics = { ...insights }
            const grossSaleAfterGST = restaurantMetrics.grossSale - (restaurantMetrics.gstOnOrder || 0)
            restaurantMetrics.grossSaleAfterGST = grossSaleAfterGST
            restaurantMetrics.commissionPercent = restaurantMetrics.nbv > 0 ? (restaurantMetrics.commissionAndTaxes / restaurantMetrics.nbv * 100) : 0
            restaurantMetrics.discountPercent = grossSaleAfterGST > 0 ? (restaurantMetrics.discounts / grossSaleAfterGST * 100) : 0
            restaurantMetrics.adsPercent = grossSaleAfterGST > 0 ? (restaurantMetrics.ads / grossSaleAfterGST * 100) : 0

            individualRestaurantData.push({
                name: `${detail.name} (${detail.platform})`,
                metrics: restaurantMetrics,
                platform: detail.platform
            })

            // Extract discount breakdown from Swiggy or Zomato data
            if ((detail.platform === 'swiggy' || detail.platform === 'zomato') && data.body?.discountBreakdown) {
                discountBreakdownData = {
                    ...data.body.discountBreakdown,
                    platform: detail.platform
                }
            }

            if (!combinedData) {
                combinedData = {}
                keysToSum.forEach(k => combinedData[k] = 0)
            }
            keysToSum.forEach(key => {
                combinedData[key] += (insights[key] || 0)
            })
        })

        if (!combinedData) return null

        // Calculate percentages and derived values
        combinedData.grossSaleAfterGST = combinedData.grossSale - (combinedData.gstOnOrder || 0)
        combinedData.commissionPercent = combinedData.nbv > 0 ? (combinedData.commissionAndTaxes / combinedData.nbv * 100) : 0
        combinedData.discountPercent = combinedData.grossSaleAfterGST > 0 ? (combinedData.discounts / combinedData.grossSaleAfterGST * 100) : 0
        combinedData.adsPercent = combinedData.grossSaleAfterGST > 0 ? (combinedData.ads / combinedData.grossSaleAfterGST * 100) : 0

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
        console.log('🔍 Processing Time Series Data:', { results, details, groupBy })

        results.forEach((data, index) => {
            const platform = details[index].platform
            const timeData = data.body?.timeSeriesData || data.timeSeriesData || []

            console.log(`📊 Restaurant ${index}:`, {
                platform,
                timeDataLength: timeData.length,
                samplePeriod: timeData[0]
            })

            timeData.forEach(periodData => {
                let period = periodData.period
                if (groupBy === 'month') {
                    period = period.substring(0, 7) // "YYYY-MM-DD" -> "YYYY-MM"
                }

                if (!timeSeries[period]) timeSeries[period] = {}

                // For 'auto' platform, try to detect actual platform from data
                let actualPlatform = platform
                if (platform === 'auto') {
                    // Check which platform key exists in periodData
                    const availablePlatforms = ['zomato', 'swiggy', 'takeaway', 'subs']
                    const detectedPlatform = availablePlatforms.find(p => periodData[p])
                    if (detectedPlatform) {
                        actualPlatform = detectedPlatform
                        console.log(`✅ Detected platform: ${detectedPlatform} for period ${period}`)
                    }
                }

                const platformData = periodData[actualPlatform] || {}
                console.log(`📈 Period ${period}, Platform ${actualPlatform}:`, platformData)

                if (!timeSeries[period][actualPlatform]) {
                    timeSeries[period][actualPlatform] = platformData
                } else {
                    for (const key in platformData) {
                        if (typeof platformData[key] === 'number') {
                            timeSeries[period][actualPlatform][key] += platformData[key]
                        }
                    }
                }
            })
        })

        console.log('✨ Final Time Series:', timeSeries)

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
                    restaurantData[platform] = { ...summary.combinedData }
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
    const title = `${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} Report (${startDate} to ${endDate})`

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
            <h1 className="dashboard-title">{title}</h1>

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
                        <ChartsGrid
                            type="timeSeries"
                            data={processedData.timeSeriesData}
                            groupBy={groupBy}
                        />
                    )}
                </>
            )}
        </div>
    )
}

export default Dashboard