import React, { useState } from 'react'
import { formatValue } from '../../utils/helpers'
import DiscountBreakdownModal from './DiscountBreakdownModal'

const SummaryCards = ({ data, selections, discountBreakdown, thresholds, monthlyData, groupBy }) => {
    const [discountModalOpen, setDiscountModalOpen] = useState({ isOpen: false, position: null })

    // Check if single channel is selected for threshold monitoring
    const isSingleChannelSelected = selections?.channels?.length === 1

    // Helper function to get color based on threshold
    const getThresholdColor = (percentage, threshold) => {
        if (!isSingleChannelSelected || !thresholds || threshold === undefined) {
            return '#6b7280' // Default gray color
        }
        return percentage > threshold ? '#dc2626' : '#16a34a' // Red if exceeded, green if within
    }

    // Map summary card labels to chart metric keys
    const labelToMetricMap = {
        "Gross Sale": "grossSale",
        "Gross Sale After GST": "grossSaleAfterGST",
        "Net Sale": "netSale",
        "NBV": "nbv",
        "No. of Orders": "noOfOrders",
        "Discounts": "discounts",
        "Commission & Taxes": "commissionAndTaxes",
        "Ads": "ads",
        "Packings": "packings",
        "GST on Order": "gstOnOrder"
    }

    // Helper function to calculate percentage relative to gross sale after GST
    const calculatePercentage = (value, grossSaleAfterGST) => {
        if (!grossSaleAfterGST || grossSaleAfterGST === 0) return 0
        return Math.abs((value / grossSaleAfterGST) * 100)
    }

    const cardData = [
        { label: "Gross Sale", value: data.grossSale, type: 'currency' },
        { label: "Gross Sale After GST", value: data.grossSaleAfterGST, type: 'currency' },
        {
            label: "Net Sale",
            value: data.netSale,
            type: 'currency',
            percentage: calculatePercentage(data.netSale, data.grossSaleAfterGST)
        },
        {
            label: "NBV",
            value: data.nbv,
            type: 'currency',
            percentage: calculatePercentage(data.nbv, data.grossSaleAfterGST)
        },
        { label: "No. of Orders", value: data.noOfOrders, type: 'number' },
        {
            label: "Discounts",
            value: data.discounts,
            type: 'currency',
            hasBreakdown: true,
            percentage: data.discountPercent || calculatePercentage(data.discounts, data.grossSaleAfterGST),
            threshold: thresholds?.discount
        },
        {
            label: "Commission & Taxes",
            value: data.commissionAndTaxes,
            type: 'currency',
            percentage: calculatePercentage(data.commissionAndTaxes, data.grossSaleAfterGST)
        },
        {
            label: "Ads",
            value: data.ads,
            type: 'currency',
            percentage: data.adsPercent || calculatePercentage(data.ads, data.grossSaleAfterGST),
            threshold: thresholds?.ads
        },
        {
            label: "Packings",
            value: data.packings,
            type: 'currency',
            percentage: calculatePercentage(data.packings, data.grossSaleAfterGST)
        },
        {
            label: "GST on Order",
            value: data.gstOnOrder,
            type: 'currency',
            percentage: calculatePercentage(data.gstOnOrder, data.grossSaleAfterGST)
        }
    ]

    const scrollToChart = (label) => {
        const metricKey = labelToMetricMap[label]
        if (metricKey) {
            const chartElement = document.getElementById(`chart-${metricKey}`)
            if (chartElement) {
                chartElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                })

                // Add a highlight effect
                chartElement.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease'
                chartElement.style.transform = 'scale(1.02)'
                chartElement.style.boxShadow = '0 25px 50px -12px rgba(99, 102, 241, 0.4)'

                // Remove highlight after animation
                setTimeout(() => {
                    chartElement.style.transform = ''
                    chartElement.style.boxShadow = ''
                }, 800)
            }
        }
    }

    const handleDiscountBreakdown = (e) => {
        e.stopPropagation() // Prevent card click from triggering

        if (!discountBreakdown) {
            alert('Discount breakdown is available for Swiggy, Zomato, and Subscription channels')
            return
        }

        // Get the button position to position modal nearby
        const buttonRect = e.target.getBoundingClientRect()
        const modalPosition = {
            top: buttonRect.bottom + window.scrollY + 10,
            left: buttonRect.left + window.scrollX
        }

        setDiscountModalOpen({ isOpen: true, position: modalPosition })
    }

    return (
        <>
            {isSingleChannelSelected && thresholds && (
                <div style={{
                    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                    border: '1px solid #0ea5e9',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span style={{ fontSize: '1.2em' }}>📊</span>
                    <div>
                        <p style={{ margin: 0, fontWeight: '600', color: '#0369a1', fontSize: '0.9rem' }}>
                            Threshold Monitoring Active
                        </p>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#0284c7' }}>
                            Discount: {thresholds.discount}% | Ads: {thresholds.ads}%
                            <span style={{ marginLeft: '8px', fontStyle: 'italic' }}>
                                (🔴 = Exceeded, 🟢 = Within limits)
                            </span>
                        </p>
                    </div>
                </div>
            )}

            <div className="summary-grid">
                {cardData.map((item, index) => (
                    <div
                        key={index}
                        className="summary-card clickable-card"
                        onClick={() => scrollToChart(item.label)}
                        title={`Click to view ${item.label} chart`}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <h3 style={{ margin: 0 }}>{item.label}</h3>
                            {item.hasBreakdown && discountBreakdown && (
                                <button
                                    className="breakdown-btn"
                                    onClick={handleDiscountBreakdown}
                                    title="View detailed discount breakdown"
                                    style={{ marginLeft: '8px' }}
                                >
                                    <span></span>
                                    Breakdown
                                </button>
                            )}
                        </div>
                        <p>{formatValue(item.value, item.type)}</p>
                        {item.percentage !== undefined && (
                            <div>
                                <p style={{
                                    fontSize: '0.9em',
                                    color: getThresholdColor(item.percentage, item.threshold),
                                    margin: '4px 0 0 0',
                                    fontWeight: item.threshold !== undefined && isSingleChannelSelected ? '600' : 'normal'
                                }}>
                                    ({item.percentage.toFixed(1)}% of Gross Sale After GST)
                                </p>
                                {item.threshold !== undefined && isSingleChannelSelected && (
                                    <p style={{
                                        fontSize: '0.75em',
                                        color: getThresholdColor(item.percentage, item.threshold),
                                        margin: '2px 0 0 0',
                                        fontStyle: 'italic',
                                        fontWeight: '500'
                                    }}>
                                        Threshold: {item.threshold}% {item.percentage > item.threshold ? '⚠️ Exceeded' : '✅ Within limit'}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {groupBy === 'month' && (
                <MonthlyComparisonView
                    monthlyData={monthlyData}
                    scrollToChart={scrollToChart}
                />
            )}

            <DiscountBreakdownModal
                isOpen={discountModalOpen.isOpen}
                onClose={() => setDiscountModalOpen({ isOpen: false, position: null })}
                discountBreakdown={discountBreakdown}
                isLoading={false}
                position={discountModalOpen.position}
            />
        </>
    )
}

// Monthly Comparison Component
const MonthlyComparisonView = ({ monthlyData, scrollToChart }) => {
    if (!monthlyData || Object.keys(monthlyData).length === 0) {
        return (
            <div style={{
                textAlign: 'center',
                padding: '2rem',
                color: '#64748b',
                fontStyle: 'italic'
            }}>
                No monthly data available for comparison
            </div>
        )
    }

    const months = Object.keys(monthlyData).sort()
    const metrics = [
        { key: 'grossSale', label: 'Gross Sale', type: 'currency' },
        { key: 'grossSaleAfterGST', label: 'Gross Sale After GST', type: 'currency' },
        { key: 'netSale', label: 'Net Sale', type: 'currency' },
        { key: 'nbv', label: 'NBV', type: 'currency' },
        { key: 'noOfOrders', label: 'No. of Orders', type: 'number' },
        { key: 'discounts', label: 'Discounts', type: 'currency' },
        { key: 'commissionAndTaxes', label: 'Commission & Taxes', type: 'currency' },
        { key: 'ads', label: 'Ads', type: 'currency' },
        { key: 'packings', label: 'Packings', type: 'currency' },
        { key: 'gstOnOrder', label: 'GST on Order', type: 'currency' }
    ]

    return (
        <div>
            <h3 style={{
                marginBottom: '1.5rem',
                color: '#334155',
                fontSize: '1.2rem',
                textAlign: 'center'
            }}>
                📅 Month-on-Month Comparison ({months.length} months)
            </h3>

            <div style={{ display: 'grid', gap: '1.5rem' }}>
                {metrics.map(metric => (
                    <div
                        key={metric.key}
                        className="monthly-comparison-card"
                        onClick={() => scrollToChart(metric.label)}
                        title={`Click to view ${metric.label} chart`}
                    >
                        <h4 className="monthly-metric-title">{metric.label}</h4>

                        <div className="monthly-data-grid">
                            {months.map(month => {
                                const value = monthlyData[month][metric.key] || 0
                                return (
                                    <div key={month} className="monthly-data-item">
                                        <div className="monthly-data-month">
                                            {formatMonthDisplay(month)}
                                        </div>
                                        <div className="monthly-data-value">
                                            {formatValue(value, metric.type)}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Show growth/decline if there are multiple months */}
                        {months.length > 1 && (
                            <MonthlyGrowthIndicator
                                months={months}
                                monthlyData={monthlyData}
                                metricKey={metric.key}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

// Growth Indicator Component
const MonthlyGrowthIndicator = ({ months, monthlyData, metricKey }) => {
    const firstMonth = months[0]
    const lastMonth = months[months.length - 1]
    const firstValue = monthlyData[firstMonth][metricKey] || 0
    const lastValue = monthlyData[lastMonth][metricKey] || 0

    if (firstValue === 0) return null

    const growthPercent = ((lastValue - firstValue) / firstValue) * 100
    const isPositive = growthPercent > 0
    const isNegative = growthPercent < 0

    const className = `monthly-growth-indicator ${isPositive ? 'growth-positive' : isNegative ? 'growth-negative' : ''}`

    return (
        <div className={className}>
            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                {isPositive ? '📈' : isNegative ? '📉' : '➡️'}
                {' '}
                {Math.abs(growthPercent).toFixed(1)}%
                {isPositive ? ' growth' : isNegative ? ' decline' : ' no change'}
            </span>
            <span style={{ color: '#64748b', marginLeft: '0.5rem', fontSize: '0.85rem' }}>
                ({formatMonthDisplay(firstMonth)} → {formatMonthDisplay(lastMonth)})
            </span>
        </div>
    )
}

// Helper function to format month display
const formatMonthDisplay = (monthString) => {
    // Assuming monthString is in YYYY-MM format
    const [year, month] = monthString.split('-')
    const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ]
    return `${monthNames[parseInt(month) - 1]} ${year}`
}

export default SummaryCards