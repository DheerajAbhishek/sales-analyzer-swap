import React, { useState } from 'react'
import { formatValue } from '../../utils/helpers'
import DiscountBreakdownModal from './DiscountBreakdownModal'

const SummaryCards = ({ data, selections, discountBreakdown, thresholds }) => {
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

    const cardData = [
        { label: "Gross Sale", value: data.grossSale, type: 'currency' },
        { label: "Gross Sale After GST", value: data.grossSaleAfterGST, type: 'currency' },
        { label: "Net Sale", value: data.netSale, type: 'currency' },
        { label: "NBV", value: data.nbv, type: 'currency' },
        { label: "No. of Orders", value: data.noOfOrders, type: 'number' },
        {
            label: "Discounts",
            value: data.discounts,
            type: 'currency',
            hasBreakdown: true,
            percentage: data.discountPercent,
            threshold: thresholds?.discount
        },
        { label: "Commission & Taxes", value: data.commissionAndTaxes, type: 'currency' },
        {
            label: "Ads",
            value: data.ads,
            type: 'currency',
            percentage: data.adsPercent,
            threshold: thresholds?.ads
        },
        { label: "Packings", value: data.packings, type: 'currency' },
        { label: "GST on Order", value: data.gstOnOrder, type: 'currency' }
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
            alert('Discount breakdown is only available for Swiggy channel with single restaurant selection')
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
                                    ({item.percentage.toFixed(2)}% of Gross Sale After GST)
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

export default SummaryCards