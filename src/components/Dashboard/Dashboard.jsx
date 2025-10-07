import React, { useState, useEffect } from 'react'
import SummaryCards from './SummaryCards.jsx'
import ChartsGrid from '../Charts/ChartsGrid.jsx'
import ExpensesSection from '../PnL/ExpensesSection.jsx'
import { isFullMonthSelection } from '../../utils/helpers'

const Dashboard = ({ data }) => {
    const { results, details, selections, groupBy, thresholds } = data
    const [processedData, setProcessedData] = useState(null)
    const [showPnL, setShowPnL] = useState(false)

    useEffect(() => {
        if (groupBy === 'total') {
            const processed = processTotalSummary(results, details)
            setProcessedData(processed)

            // Check if P&L should be shown
            const { restaurants, channels, startDate, endDate } = selections
            const shouldShowPnL = restaurants.length === 1 &&
                channels.length === 4 &&
                isFullMonthSelection(startDate, endDate)
            setShowPnL(shouldShowPnL)
        } else {
            const processed = processTimeSeries(results, details)
            setProcessedData(processed)
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

    const processTimeSeries = (results, details) => {
        const timeSeries = {}
        results.forEach((data, index) => {
            const platform = details[index].platform
            const timeData = data.body?.timeSeriesData || data.timeSeriesData || []
            timeData.forEach(periodData => {
                const period = periodData.period
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

    const { startDate, endDate } = selections
    const title = groupBy === 'total'
        ? `Consolidated Report (${startDate} to ${endDate})`
        : `Trend Report by ${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} (${startDate} to ${endDate})`

    return (
        <div className="card">
            <h1 className="dashboard-title">{title}</h1>

            {processedData.type === 'total' && (
                <>
                    <SummaryCards
                        data={processedData.combinedData}
                        selections={selections}
                        discountBreakdown={processedData.discountBreakdown}
                        thresholds={thresholds}
                    />
                    <ChartsGrid
                        type="comparison"
                        data={processedData.individualData}
                    />
                    {showPnL && (
                        <ExpensesSection
                            selections={selections}
                            grossSale={processedData.combinedData.grossSale}
                            grossSaleAfterGST={processedData.combinedData.grossSaleAfterGST}
                            netSale={processedData.combinedData.netSale}
                        />
                    )}
                </>
            )}

            {processedData.type === 'timeSeries' && (
                <ChartsGrid
                    type="timeSeries"
                    data={processedData.timeSeriesData}
                />
            )}
        </div>
    )
}

export default Dashboard