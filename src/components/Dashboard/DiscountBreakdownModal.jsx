import React from 'react'
import { formatValue } from '../../utils/helpers'

const DiscountBreakdownModal = ({ isOpen, onClose, discountBreakdown, isLoading, position }) => {
    if (!isOpen) return null

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }

    // Calculate modal position
    const getModalStyle = () => {
        if (!position) {
            return {}
        }

        return {
            position: 'absolute',
            left: '188px',
            top: '47.162px',
            transform: 'none'
        }
    }

    // Detect the format of the discount data
    const isNewZomatoFormat = discountBreakdown && Object.values(discountBreakdown).some(item =>
        item && typeof item === 'object' && 'totalDiscount' in item && 'avgDiscountPerOrder' in item
    )
    const isZomatoData = discountBreakdown?.platform === 'zomato' || isNewZomatoFormat

    const formatDiscountShare = (key) => {
        if (key === 'TOTAL') return 'Total'
        if (key === 'Undefined') return isZomatoData ? 'Undefined' : 'Undefined%'
        if (isZomatoData) return key // For Zomato, show the full promo text
        return `${key}%` // For Swiggy, show percentage
    }

    const getDiscountShareDescription = (key, data) => {
        if (key === 'TOTAL') return 'Total discount across all categories'
        if (key === 'Undefined') {
            return isZomatoData ? 'Promotions without specific details' : 'Discount share percentage not defined'
        }
        if (isNewZomatoFormat) {
            if (data.valueRealizationPercentage !== null && data.valueRealizationPercentage !== undefined) {
                return `Restaurant shares ${data.valueRealizationPercentage?.toFixed(2)}% of this promotion`
            }
            return `Promotion details`
        }
        if (isZomatoData) {
            const sharePercent = data.Swap_share_percentage
            return sharePercent ? `Restaurant shares ${sharePercent}% of this promotion` : 'Promotion details'
        }
        return `${key}% of discount shared by restaurant`
    }

    const getDiscountAmount = (data) => {
        if (isNewZomatoFormat) {
            return data.totalDiscount || 0
        }
        if (isZomatoData) {
            return data.totalDiscountPromo || 0
        }
        return data.discount || 0
    }

    const getAdditionalMetrics = (data) => {
        if (isNewZomatoFormat) {
            const metrics = []
            if (data.avgDiscountPerOrder !== null && data.avgDiscountPerOrder !== undefined) {
                metrics.push({
                    label: 'Avg Discount/Order',
                    value: formatValue(data.avgDiscountPerOrder, 'currency')
                })
            }
            if (data.valueRealizationPercentage !== null && data.valueRealizationPercentage !== undefined) {
                metrics.push({
                    label: 'Discount Share',
                    value: `${data.valueRealizationPercentage?.toFixed(2)}%`
                })
            }
            return metrics
        }

        if (!isZomatoData) return []

        const metrics = []
        // if (data.extractedValue) {
        //     metrics.push({
        //         label: 'Max Discount',
        //         value: formatValue(data.extractedValue, 'currency')
        //     })
        // }
        if (data.Swap_share_percentage !== null && data.Swap_share_percentage !== undefined) {
            metrics.push({
                label: 'Restaurant Share',
                value: `${data.Swap_share_percentage}%`
            })
        }
        return metrics
    }

    return (
        <div className="modal-overlay positioned-modal" onClick={handleOverlayClick}>
            <div className="modal-content discount-breakdown-modal" style={getModalStyle()}>
                <div className="modal-header">
                    <h2>Discount Breakdown</h2>
                    <button className="modal-close-btn" onClick={onClose}>
                        <span>&times;</span>
                    </button>
                </div>

                <div className="modal-body">
                    {isLoading ? (
                        <div className="loading-state">
                            <div className="loading-spinner"></div>
                            <p>Loading discount breakdown...</p>
                        </div>
                    ) : discountBreakdown ? (
                        <div className="breakdown-grid">
                            {Object.entries(discountBreakdown)
                                .filter(([key]) => key !== 'TOTAL' && key !== 'platform')
                                .map(([key, data]) => {
                                    const additionalMetrics = getAdditionalMetrics(data)
                                    return (
                                        <div key={key} className="breakdown-card">
                                            <div className="breakdown-header">
                                                <h3>{formatDiscountShare(key)}</h3>
                                                <p className="breakdown-description">
                                                    {getDiscountShareDescription(key, data)}
                                                </p>
                                            </div>
                                            <div className="breakdown-metrics">
                                                <div className="metric">
                                                    <span className="metric-label">Orders</span>
                                                    <span className="metric-value">{formatValue(data.orders, 'number')}</span>
                                                </div>
                                                <div className="metric">
                                                    <span className="metric-label">
                                                        {key === 'Other Discounts (BOGO, Freebies, etc.)' ? 'Discount' :
                                                            isNewZomatoFormat ? 'Promo Discount' :
                                                                isZomatoData ? 'Promo Discount' : 'Discount Amount'}
                                                    </span>
                                                    <span className="metric-value">{formatValue(getDiscountAmount(data), 'currency')}</span>
                                                </div>
                                                {additionalMetrics.map((metric, idx) => (
                                                    <div key={idx} className="metric">
                                                        <span className="metric-label">{metric.label}</span>
                                                        <span className="metric-value">{metric.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}

                            {discountBreakdown.TOTAL && (
                                <div className="breakdown-card total-card">
                                    <div className="breakdown-header">
                                        <h3>Total</h3>
                                        <p className="breakdown-description">
                                            Combined totals across all discount categories
                                        </p>
                                    </div>
                                    <div className="breakdown-metrics">
                                        <div className="metric">
                                            <span className="metric-label">Total Orders</span>
                                            <span className="metric-value">{formatValue(discountBreakdown.TOTAL.orders, 'number')}</span>
                                        </div>
                                        <div className="metric">
                                            <span className="metric-label">{isNewZomatoFormat ? 'Total Discount' : isZomatoData ? 'Total Promo Discount' : 'Total Discount'}</span>
                                            <span className="metric-value">{formatValue(isNewZomatoFormat ? discountBreakdown.TOTAL.totalDiscount : isZomatoData ? discountBreakdown.TOTAL.totalDiscountPromo : discountBreakdown.TOTAL.discount, 'currency')}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="no-data-state">
                            <p>No discount breakdown data available</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default DiscountBreakdownModal