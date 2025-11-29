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

    // Check if we have multiple channels (new format)
    const isMultiChannel = discountBreakdown && typeof discountBreakdown === 'object' &&
        Object.keys(discountBreakdown).some(key => key.includes('_'))

    // Render multiple channels
    const renderMultiChannelBreakdown = () => {
        // Calculate combined totals across all channels
        const combinedTotals = calculateCombinedTotals(discountBreakdown)

        return (
            <div className="modal-body">
                {/* Combined Total Section */}
                {combinedTotals && (
                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{
                            fontSize: '1.2rem',
                            color: '#1e293b',
                            marginBottom: '1rem',
                            paddingBottom: '0.5rem',
                            borderBottom: '3px solid #6366f1',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <span style={{
                                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                color: 'white',
                                padding: '0.35rem 1rem',
                                borderRadius: '6px',
                                fontSize: '0.9rem',
                                fontWeight: '700'
                            }}>
                                🎯 Combined Total (All Channels)
                            </span>
                        </h3>
                        {renderCombinedTotal(combinedTotals)}
                    </div>
                )}

                {/* Individual Channel Breakdowns */}
                {Object.entries(discountBreakdown).map(([channelKey, channelData]) => {
                    const { platform, restaurantName, isSimpleBreakdown, ...breakdown } = channelData

                    // Get platform color
                    const getPlatformColor = (plat) => {
                        if (plat === 'swiggy') return '#ff6b35'
                        if (plat === 'zomato') return '#e23744'
                        if (plat === 'subs' || plat === 'subscription') return '#16a34a'
                        return '#6366f1'
                    }

                    return (
                        <div key={channelKey} style={{ marginBottom: '2rem' }}>
                            <h3 style={{
                                fontSize: '1.1rem',
                                color: '#1e293b',
                                marginBottom: '1rem',
                                paddingBottom: '0.5rem',
                                borderBottom: '2px solid #e2e8f0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}>
                                <span style={{
                                    background: getPlatformColor(platform),
                                    color: 'white',
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '6px',
                                    fontSize: '0.85rem',
                                    textTransform: 'capitalize'
                                }}>
                                    {platform === 'subs' ? 'Subscription' : platform}
                                </span>
                                {restaurantName && (
                                    <span style={{ color: '#64748b', fontSize: '0.95rem' }}>
                                        {restaurantName.replace(' (Auto-loaded)', '')}
                                    </span>
                                )}
                            </h3>
                            {isSimpleBreakdown ? renderSimpleBreakdown(breakdown) : renderBreakdownContent(breakdown, platform)}
                        </div>
                    )
                })}
            </div>
        )
    }

    // Render simple breakdown for subs (only total, no categories)
    const renderSimpleBreakdown = (breakdown) => {
        return (
            <div className="breakdown-grid">
                {breakdown.TOTAL && (
                    <div className="breakdown-card" style={{
                        background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                        border: '2px solid #16a34a'
                    }}>
                        <div className="breakdown-header">
                            <h3 style={{ color: '#15803d' }}>Total Discount</h3>
                            <p className="breakdown-description" style={{ color: '#166534' }}>
                                Subscription channel discount (no category breakdown available)
                            </p>
                        </div>
                        <div className="breakdown-metrics">
                            <div className="metric">
                                <span className="metric-label">Total Orders</span>
                                <span className="metric-value">{formatValue(breakdown.TOTAL.orders, 'number')}</span>
                            </div>
                            <div className="metric">
                                <span className="metric-label">Total Discount</span>
                                <span className="metric-value">{formatValue(breakdown.TOTAL.discount, 'currency')}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }    // Calculate combined totals across all channels
    const calculateCombinedTotals = (allChannelsData) => {
        const combined = {
            totalOrders: 0,
            totalDiscount: 0,
            byCategory: {}
        }

        Object.entries(allChannelsData).forEach(([channelKey, channelData]) => {
            const { platform, restaurantName, TOTAL, isSimpleBreakdown, ...breakdown } = channelData

            // Add to overall totals
            if (TOTAL) {
                combined.totalOrders += TOTAL.orders || 0

                // Handle different discount field names
                const discount = TOTAL.totalDiscount || TOTAL.totalDiscountPromo || TOTAL.discount || 0
                combined.totalDiscount += discount
            }

            // For simple breakdowns (subs), don't aggregate by category
            if (isSimpleBreakdown) {
                return // Skip category aggregation for subs
            }

            // Aggregate by category for detailed breakdowns (swiggy/zomato)
            Object.entries(breakdown).forEach(([category, data]) => {
                if (category === 'platform' || category === 'restaurantName' || category === 'isSimpleBreakdown') return

                if (!combined.byCategory[category]) {
                    combined.byCategory[category] = {
                        orders: 0,
                        discount: 0,
                        platforms: []
                    }
                }

                combined.byCategory[category].orders += data.orders || 0

                const discount = data.totalDiscount || data.totalDiscountPromo || data.discount || 0
                combined.byCategory[category].discount += discount

                if (!combined.byCategory[category].platforms.includes(platform)) {
                    combined.byCategory[category].platforms.push(platform)
                }
            })
        })

        return combined
    }

    // Render combined total section
    const renderCombinedTotal = (combinedTotals) => {
        return (
            <div>
                {/* Overall Total Card */}
                <div className="breakdown-card total-card" style={{ marginBottom: '1rem' }}>
                    <div className="breakdown-header">
                        <h3>Grand Total</h3>
                        <p className="breakdown-description">
                            Combined totals across all channels and categories
                        </p>
                    </div>
                    <div className="breakdown-metrics">
                        <div className="metric">
                            <span className="metric-label">Total Orders</span>
                            <span className="metric-value">{formatValue(combinedTotals.totalOrders, 'number')}</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">Total Discount</span>
                            <span className="metric-value">{formatValue(combinedTotals.totalDiscount, 'currency')}</span>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Render single channel (original format)
    const renderSingleChannelBreakdown = () => {
        const platform = discountBreakdown?.platform
        return (
            <div className="modal-body">
                {renderBreakdownContent(discountBreakdown, platform)}
            </div>
        )
    }

    // Common breakdown rendering logic
    const renderBreakdownContent = (breakdown, platform) => {
        // Detect the format of the discount data
        const isNewZomatoFormat = breakdown && Object.values(breakdown).some(item =>
            item && typeof item === 'object' && 'totalDiscount' in item && 'avgDiscountPerOrder' in item
        )
        const isZomatoData = platform === 'zomato' || isNewZomatoFormat

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
            if (data.Swap_share_percentage !== null && data.Swap_share_percentage !== undefined) {
                metrics.push({
                    label: 'Restaurant Share',
                    value: `${data.Swap_share_percentage}%`
                })
            }
            return metrics
        }

        return (
            <div className="breakdown-grid">
                {Object.entries(breakdown)
                    .filter(([key]) => key !== 'TOTAL' && key !== 'platform' && key !== 'restaurantName')
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

                {breakdown.TOTAL && (
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
                                <span className="metric-value">{formatValue(breakdown.TOTAL.orders, 'number')}</span>
                            </div>
                            <div className="metric">
                                <span className="metric-label">{isNewZomatoFormat ? 'Total Discount' : isZomatoData ? 'Total Promo Discount' : 'Total Discount'}</span>
                                <span className="metric-value">{formatValue(isNewZomatoFormat ? breakdown.TOTAL.totalDiscount : isZomatoData ? breakdown.TOTAL.totalDiscountPromo : breakdown.TOTAL.discount, 'currency')}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
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

                {isLoading ? (
                    <div className="loading-state">
                        <div className="loading-spinner"></div>
                        <p>Loading discount breakdown...</p>
                    </div>
                ) : discountBreakdown ? (
                    isMultiChannel ? renderMultiChannelBreakdown() : renderSingleChannelBreakdown()
                ) : (
                    <div className="no-data-state">
                        <p>No discount breakdown data available</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default DiscountBreakdownModal