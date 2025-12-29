import React, { useState } from 'react'
import { formatValue } from '../../utils/helpers'
import DiscountBreakdownModal from './DiscountBreakdownModal'

const SummaryCards = ({ data, selections, discountBreakdown, thresholds, monthlyData, groupBy }) => {
    const [discountModalOpen, setDiscountModalOpen] = useState({ isOpen: false, position: null })
    const [zomatoBreakdownModal, setZomatoBreakdownModal] = useState({ isOpen: false, type: null, data: null, position: null })

    // For takeaway, include gstOnOrder in deductions (when commission and taxes breakdown are all 0)
    const isTakeaway = data.gstOnOrder > 0 &&
        (data.deductionsBreakdown?.commission?.total || 0) === 0 &&
        (data.deductionsBreakdown?.taxes?.total || 0) === 0
    const adjustedTotalDeductions = isTakeaway ? (data.totalDeductions || 0) + (data.gstOnOrder || 0) : data.totalDeductions
    const adjustedNetPay = isTakeaway ? data.netOrder - adjustedTotalDeductions : data.netPay

    // Debug logging
    console.log('🔍 SummaryCards data:', {
        netOrder: data.netOrder,
        totalDeductions: data.totalDeductions,
        gstOnOrder: data.gstOnOrder,
        adjustedTotalDeductions,
        adjustedNetPay,
        isTakeaway,
        netPay: data.netPay,
        netOrderBreakdown: data.netOrderBreakdown,
        deductionsBreakdown: data.deductionsBreakdown,
        discountBreakdown: data.discountBreakdown,
        discountBreakdownProp: discountBreakdown,
        hasDiscountBreakdown: !!data.discountBreakdown && Object.keys(data.discountBreakdown).length > 0
    })

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
        "Gross Sale + GST": "grossSaleWithGST",
        "Gross Sale": "grossSale",
        "Net Order": "netOrder",
        "Deductions": "totalDeductions",
        "Net Pay": "netPay",
        "No. of Orders": "noOfOrders",
        "Discounts": "discounts",
        "Ads": "ads"
    }

    // Helper function to calculate percentage relative to gross sale (after GST)
    const calculatePercentage = (value, grossSaleAfterGST) => {
        if (!grossSaleAfterGST || grossSaleAfterGST === 0) return 0
        return Math.abs((value / grossSaleAfterGST) * 100)
    }

    // Calculate Gross Sale + GST if not provided
    const grossSaleWithGST = data.grossSaleWithGST || (data.grossSale + (data.gstOnOrder || 0))

    const cardData = [
        { label: "Gross Sale + GST", value: grossSaleWithGST, type: 'currency' },
        { label: "Gross Sale", value: data.grossSale, type: 'currency' },
        // Zomato/Swiggy-specific cards with breakdowns
        ...(data.netOrder !== undefined ? [{
            label: "Net Order",
            value: data.netOrder,
            type: 'currency',
            hasBreakdown: true,
            isZomatoMetric: true,
            formula: "Gross Sale - Discounts + GST",
            breakdownData: { ...data.netOrderBreakdown, grossSale: data.grossSaleAfterGST || data.grossSale },
            percentage: (data.grossSaleAfterGST || data.grossSale) ? (data.netOrder / (data.grossSaleAfterGST || data.grossSale)) * 100 : null
        }] : []),
        ...(data.totalDeductions !== undefined ? [{
            label: "Deductions",
            value: adjustedTotalDeductions,
            type: 'currency',
            hasBreakdown: true,
            isZomatoMetric: true,
            formula: "Commission + Taxes + Other Deductions",
            breakdownData: { ...data.deductionsBreakdown, grossSale: data.grossSaleAfterGST || data.grossSale, gstOnOrder: data.gstOnOrder || 0 },
            percentage: (data.grossSaleAfterGST || data.grossSale) ? (adjustedTotalDeductions / (data.grossSaleAfterGST || data.grossSale)) * 100 : null
        }] : []),
        ...(data.netPay !== undefined && data.netOrder !== undefined ? [{
            label: "Net Pay",
            value: adjustedNetPay,
            type: 'currency',
            hasBreakdown: true,
            isZomatoMetric: true,
            formula: "Net Order - Deductions + Net Additions",
            breakdownData: {
                netOrder: data.netOrder,
                netOrderBreakdown: data.netOrderBreakdown,
                totalDeductions: adjustedTotalDeductions,
                netAdditions: data.netAdditions || 0,
                ads: data.ads || 0,
                cancelledPayout: data.cancelledPayout || 0,
                rejectedPayout: data.rejectedPayout || 0,
                netPay: adjustedNetPay,
                grossSale: data.grossSaleAfterGST || data.grossSale,
                gstOnOrder: data.gstOnOrder || 0
            },
            percentage: (data.grossSaleAfterGST || data.grossSale) ? (adjustedNetPay / (data.grossSaleAfterGST || data.grossSale)) * 100 : null
        }] : []),
        { label: "No. of Orders", value: data.noOfOrders, type: 'number' },
        {
            label: "Discounts",
            value: data.discounts,
            type: 'currency',
            hasBreakdown: !!discountBreakdown && Object.keys(discountBreakdown).length > 0,
            percentage: data.discountPercent || calculatePercentage(data.discounts, data.grossSaleAfterGST || data.grossSale),
            threshold: thresholds?.discount
        },
        // Ads card only for Zomato/Swiggy
        ...(data.netOrder !== undefined ? [{
            label: "Ads",
            value: data.ads || 0,
            type: 'currency',
            percentage: data.adsPercent || calculatePercentage(data.ads, data.grossSaleAfterGST || data.grossSale),
            threshold: thresholds?.ads
        }] : []),
        // POS-only cards (show only when no netOrder)
        ...(data.netOrder === undefined ? [{
            label: "Net Sale",
            value: data.netSale,
            type: 'currency',
            percentage: calculatePercentage(data.netSale, data.grossSale)
        },
        {
            label: "GST on Order",
            value: data.gstOnOrder,
            type: 'currency',
            percentage: calculatePercentage(data.gstOnOrder, data.grossSale)
        },
        {
            label: "Packings",
            value: data.packings,
            type: 'currency',
            percentage: calculatePercentage(data.packings, data.grossSale)
        },
        {
            label: "Commission & Taxes",
            value: data.commissionAndTaxes || 0,
            type: 'currency',
            percentage: calculatePercentage(data.commissionAndTaxes, data.grossSale)
        },
        {
            label: "NBV",
            value: data.nbv,
            type: 'currency',
            percentage: calculatePercentage(data.nbv, data.grossSale)
        }] : [])
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
                        onClick={() => !item.hasBreakdown && scrollToChart(item.label)}
                        title={item.hasBreakdown ? undefined : `Click to view ${item.label} chart`}
                        style={{ cursor: item.hasBreakdown ? 'default' : 'pointer' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: item.isZomatoMetric ? 'center' : 'flex-start', marginBottom: '8px' }}>
                            <h3 style={{ margin: 0 }}>{item.label}</h3>
                            {item.hasBreakdown && (
                                <button
                                    className="breakdown-btn"
                                    style={item.isZomatoMetric ? { alignSelf: 'center', marginLeft: '8px' } : { marginLeft: '8px' }}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        if (item.isZomatoMetric) {
                                            const buttonRect = e.target.getBoundingClientRect()
                                            const modalWidth = 400
                                            const modalHeight = 500

                                            let top = buttonRect.bottom + window.scrollY + 10
                                            let left = buttonRect.left + window.scrollX

                                            // Adjust if modal goes off right edge
                                            if (left + modalWidth > window.innerWidth) {
                                                left = window.innerWidth - modalWidth - 20
                                            }

                                            // Adjust if modal goes off bottom edge
                                            if (buttonRect.bottom + modalHeight > window.innerHeight) {
                                                top = buttonRect.top + window.scrollY - modalHeight - 10
                                            }

                                            // Ensure minimum margins
                                            left = Math.max(20, left)
                                            top = Math.max(20, top)

                                            const modalPosition = { top, left }
                                            setZomatoBreakdownModal({
                                                isOpen: true,
                                                type: item.label,
                                                data: item.breakdownData,
                                                position: modalPosition
                                            })
                                        } else {
                                            // For discount breakdown
                                            handleDiscountBreakdown(e)
                                        }
                                    }}
                                    title="View detailed breakdown"
                                >
                                    <span></span>
                                    Breakdown
                                </button>
                            )}
                        </div>
                        <p>{formatValue(item.value, item.type)}</p>
                        {item.percentage !== undefined && item.percentage !== null && (
                            <div>
                                <p style={{
                                    fontSize: '0.9em',
                                    color: getThresholdColor(item.percentage, item.threshold),
                                    margin: '4px 0 0 0',
                                    fontWeight: item.threshold !== undefined && isSingleChannelSelected ? '600' : 'normal'
                                }}>
                                    ({item.percentage.toFixed(1)}% of Gross Sale)
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
                        {item.formula && (
                            <p style={{
                                fontSize: '0.7em',
                                color: '#94a3b8',
                                margin: '6px 0 0 0',
                                fontStyle: 'italic',
                                borderTop: '1px solid #e2e8f0',
                                paddingTop: '6px'
                            }}>
                                {item.formula}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {/* Cancelled and Rejected Orders Section for Zomato */}
            {(data.cancelledOrdersCount > 0 || data.rejectedOrdersCount > 0) && (
                <div style={{
                    marginTop: '20px',
                    padding: '16px',
                    backgroundColor: '#fef3c7',
                    borderRadius: '8px',
                    border: '1px solid #fbbf24'
                }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#92400e' }}>Order Status Summary</h4>
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                        {data.cancelledOrdersCount > 0 && (
                            <div>
                                <span style={{ fontWeight: '600', color: '#dc2626' }}>Cancelled Orders: </span>
                                <span>{data.cancelledOrdersCount} orders</span>
                                {data.cancelledOrdersPayout !== undefined && (
                                    <span style={{ marginLeft: '8px' }}>
                                        (Payout: <span style={{ fontWeight: '600' }}>₹{data.cancelledOrdersPayout.toFixed(2)}</span>)
                                    </span>
                                )}
                            </div>
                        )}
                        {data.rejectedOrdersCount > 0 && (
                            <div>
                                <span style={{ fontWeight: '600', color: '#dc2626' }}>Rejected Orders: </span>
                                <span>{data.rejectedOrdersCount} orders</span>
                                {data.rejectedOrdersPayout !== undefined && (
                                    <span style={{ marginLeft: '8px' }}>
                                        (Payout: <span style={{ fontWeight: '600' }}>₹{data.rejectedOrdersPayout.toFixed(2)}</span>)
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <DiscountBreakdownModal
                isOpen={discountModalOpen.isOpen}
                onClose={() => setDiscountModalOpen({ isOpen: false, position: null })}
                discountBreakdown={discountBreakdown}
                isLoading={false}
                position={discountModalOpen.position}
            />

            {zomatoBreakdownModal.isOpen && (
                <div
                    className="modal-overlay positioned-modal"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setZomatoBreakdownModal({ isOpen: false, type: null, data: null, position: null })
                        }
                    }}
                >
                    <div
                        className="modal-content discount-breakdown-modal"
                        style={{
                            position: 'absolute',
                            left: '188px',
                            top: '47.162px',
                            transform: 'none'
                        }}
                    >
                        <div className="modal-header">
                            <h2>{zomatoBreakdownModal.type} Breakdown</h2>
                            <button
                                className="modal-close-btn"
                                onClick={() => setZomatoBreakdownModal({ isOpen: false, type: null, data: null, position: null })}
                            >
                                <span>&times;</span>
                            </button>
                        </div>
                        <div className="modal-body">
                            {zomatoBreakdownModal.type === 'Net Order' && zomatoBreakdownModal.data && (
                                <>
                                    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Subtotal:</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600' }}>₹{zomatoBreakdownModal.data.subtotal?.toFixed(2) || '0.00'}</span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.subtotal / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Packaging Charges:</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600', color: '#16a34a' }}>+ ₹{zomatoBreakdownModal.data.packaging?.toFixed(2) || '0.00'}</span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.packaging / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Discounts (Promo):</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600', color: '#dc2626' }}>- ₹{zomatoBreakdownModal.data.discountsPromo?.toFixed(2) || '0.00'}</span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.discountsPromo / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Discounts (BOGO/Other):</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600', color: '#dc2626' }}>- ₹{zomatoBreakdownModal.data.discountsBogo?.toFixed(2) || '0.00'}</span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.discountsBogo / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>GST:</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600', color: '#16a34a' }}>+ ₹{zomatoBreakdownModal.data.gst?.toFixed(2) || '0.00'}</span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.gst / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {zomatoBreakdownModal.data.other > 0 && (
                                        <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>Other <span style={{ fontSize: '0.85em', color: '#64748b' }}>(Delivery charge, Brand pack fee, etc.)</span>:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontWeight: '600', color: '#16a34a' }}>+ ₹{zomatoBreakdownModal.data.other?.toFixed(2) || '0.00'}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.other / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '2px solid #333' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
                                            <span>Net Order:</span>
                                            <span>₹{(
                                                (zomatoBreakdownModal.data.subtotal || 0) +
                                                (zomatoBreakdownModal.data.packaging || 0) -
                                                (zomatoBreakdownModal.data.discountsPromo || 0) -
                                                (zomatoBreakdownModal.data.discountsBogo || 0) +
                                                (zomatoBreakdownModal.data.gst || 0) +
                                                (zomatoBreakdownModal.data.other || 0)
                                            ).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </>
                            )}
                            {zomatoBreakdownModal.type === 'Deductions' && zomatoBreakdownModal.data && (
                                <>
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontWeight: '600', marginBottom: '4px', color: '#0ea5e9' }}>Commission:</div>
                                        <div style={{ paddingLeft: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span>Base Service Fee:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span>₹{zomatoBreakdownModal.data.commission?.baseServiceFee?.toFixed(2) || '0.00'}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.commission?.baseServiceFee / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span>Payment Mechanism Fee:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span>₹{zomatoBreakdownModal.data.commission?.paymentMechanismFee?.toFixed(2) || '0.00'}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.commission?.paymentMechanismFee / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span>Long Distance Fee:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span>₹{zomatoBreakdownModal.data.commission?.longDistanceFee?.toFixed(2) || '0.00'}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.commission?.longDistanceFee / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span>Service Fee Discount:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ color: '#16a34a' }}>- ₹{zomatoBreakdownModal.data.commission?.serviceFeeDiscount?.toFixed(2) || '0.00'}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.commission?.serviceFeeDiscount / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Swiggy-specific fees */}
                                            {zomatoBreakdownModal.data.commission?.pocketHeroFees > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                    <span>Pocket Hero Fees:</span>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <span>₹{zomatoBreakdownModal.data.commission?.pocketHeroFees?.toFixed(2) || '0.00'}</span>
                                                        <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                            {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.commission?.pocketHeroFees / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {zomatoBreakdownModal.data.commission?.boltFees > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                    <span>Bolt Fees:</span>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <span>₹{zomatoBreakdownModal.data.commission?.boltFees?.toFixed(2) || '0.00'}</span>
                                                        <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                            {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.commission?.boltFees / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {zomatoBreakdownModal.data.commission?.deliveryFeeSponsored > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                    <span>Delivery Fee Sponsored:</span>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <span>₹{zomatoBreakdownModal.data.commission?.deliveryFeeSponsored?.toFixed(2) || '0.00'}</span>
                                                        <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                            {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.commission?.deliveryFeeSponsored / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {zomatoBreakdownModal.data.commission?.callCenterCharges > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                    <span>Call Center Charges:</span>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <span>₹{zomatoBreakdownModal.data.commission?.callCenterCharges?.toFixed(2) || '0.00'}</span>
                                                        <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                            {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.commission?.callCenterCharges / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {zomatoBreakdownModal.data.commission?.swiggyOneFees > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                    <span>Swiggy One Fees:</span>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <span>₹{zomatoBreakdownModal.data.commission?.swiggyOneFees?.toFixed(2) || '0.00'}</span>
                                                        <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                            {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.commission?.swiggyOneFees / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', paddingTop: '4px', borderTop: '1px solid #eee' }}>
                                                <span>Total Commission:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span>₹{zomatoBreakdownModal.data.commission?.total?.toFixed(2) || '0.00'}</span>
                                                    <span style={{ fontSize: '0.85em', color: '#0ea5e9', marginLeft: '6px' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.commission?.total / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontWeight: '600', marginBottom: '4px', color: '#8b5cf6' }}>Taxes:</div>
                                        <div style={{ paddingLeft: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span>Tax on Service:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span>₹{zomatoBreakdownModal.data.taxes?.taxOnService?.toFixed(2) || '0.00'}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.taxes?.taxOnService / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span>TDS:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span>₹{zomatoBreakdownModal.data.taxes?.tds?.toFixed(2) || '0.00'}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.taxes?.tds / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span>GST {zomatoBreakdownModal.data.gstOnOrder > 0 ? '(on Order)' : '(9(5))'}:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span>₹{(zomatoBreakdownModal.data.gstOnOrder || zomatoBreakdownModal.data.taxes?.gst || 0).toFixed(2)}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${(((zomatoBreakdownModal.data.gstOnOrder || zomatoBreakdownModal.data.taxes?.gst || 0) / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', paddingTop: '4px', borderTop: '1px solid #eee' }}>
                                                <span>Total Taxes:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span>₹{((zomatoBreakdownModal.data.taxes?.taxOnService || 0) + (zomatoBreakdownModal.data.taxes?.tds || 0) + (zomatoBreakdownModal.data.gstOnOrder || zomatoBreakdownModal.data.taxes?.gst || 0)).toFixed(2)}</span>
                                                    <span style={{ fontSize: '0.85em', color: '#8b5cf6', marginLeft: '6px' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((((zomatoBreakdownModal.data.taxes?.taxOnService || 0) + (zomatoBreakdownModal.data.taxes?.tds || 0) + (zomatoBreakdownModal.data.gstOnOrder || zomatoBreakdownModal.data.taxes?.gst || 0)) / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: '600', color: '#f59e0b' }}>Other Deductions:</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600' }}>₹{zomatoBreakdownModal.data.otherDeductions?.toFixed(2) || '0.00'}</span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.otherDeductions / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {zomatoBreakdownModal.data.other > 0 && (
                                        <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: '600', color: '#f59e0b' }}>Other:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontWeight: '600' }}>₹{zomatoBreakdownModal.data.other?.toFixed(2) || '0.00'}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.other / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '2px solid #333' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
                                            <span>Total Deductions:</span>
                                            <span>₹{(
                                                (zomatoBreakdownModal.data.commission?.total || 0) +
                                                ((zomatoBreakdownModal.data.taxes?.taxOnService || 0) + (zomatoBreakdownModal.data.taxes?.tds || 0) + (zomatoBreakdownModal.data.gstOnOrder || zomatoBreakdownModal.data.taxes?.gst || 0)) +
                                                (zomatoBreakdownModal.data.otherDeductions || 0) +
                                                (zomatoBreakdownModal.data.other || 0)
                                            ).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </>
                            )}
                            {zomatoBreakdownModal.type === 'Net Pay' && zomatoBreakdownModal.data && (
                                <>
                                    {/* Gross Sale (Subtotal + Packaging) */}
                                    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Gross Sale <span style={{ fontSize: '0.85em', color: '#64748b' }}>(Subtotal ₹{zomatoBreakdownModal.data.netOrderBreakdown?.subtotal?.toFixed(2) || '0.00'} + Packings ₹{zomatoBreakdownModal.data.netOrderBreakdown?.packaging?.toFixed(2) || '0.00'})</span>:</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600', color: '#16a34a' }}>+ ₹{((zomatoBreakdownModal.data.netOrderBreakdown?.subtotal || 0) + (zomatoBreakdownModal.data.netOrderBreakdown?.packaging || 0)).toFixed(2)}</span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((((zomatoBreakdownModal.data.netOrderBreakdown?.subtotal || 0) + (zomatoBreakdownModal.data.netOrderBreakdown?.packaging || 0)) / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Discounts (Promo) */}
                                    {zomatoBreakdownModal.data.netOrderBreakdown?.discountsPromo > 0 && (
                                        <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>Discounts (Promo):</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontWeight: '600', color: '#dc2626' }}>- ₹{zomatoBreakdownModal.data.netOrderBreakdown?.discountsPromo?.toFixed(2) || '0.00'}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.netOrderBreakdown?.discountsPromo / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Discounts (BOGO/Other) */}
                                    {zomatoBreakdownModal.data.netOrderBreakdown?.discountsBogo > 0 && (
                                        <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>Discounts (BOGO/Other):</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontWeight: '600', color: '#dc2626' }}>- ₹{zomatoBreakdownModal.data.netOrderBreakdown?.discountsBogo?.toFixed(2) || '0.00'}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.netOrderBreakdown?.discountsBogo / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* GST */}
                                    {zomatoBreakdownModal.data.netOrderBreakdown?.gst > 0 && (
                                        <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>GST:</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontWeight: '600', color: '#16a34a' }}>+ ₹{zomatoBreakdownModal.data.netOrderBreakdown?.gst?.toFixed(2) || '0.00'}</span>
                                                    <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                        {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.netOrderBreakdown?.gst / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Total Deductions:</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600', color: '#dc2626' }}>- ₹{zomatoBreakdownModal.data.totalDeductions?.toFixed(2) || '0.00'}</span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.totalDeductions / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Net Additions:</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600', color: '#16a34a' }}>+ ₹{zomatoBreakdownModal.data.netAdditions?.toFixed(2) || '0.00'}</span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.netAdditions / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Ads:</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600', color: '#dc2626' }}>- ₹{zomatoBreakdownModal.data.ads?.toFixed(2) || '0.00'}</span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((zomatoBreakdownModal.data.ads / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Cancelled Orders Payout:</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600', color: zomatoBreakdownModal.data.cancelledPayout >= 0 ? '#16a34a' : '#dc2626' }}>
                                                    {zomatoBreakdownModal.data.cancelledPayout >= 0 ? '+ ' : '- '}₹{Math.abs(zomatoBreakdownModal.data.cancelledPayout || 0).toFixed(2)}
                                                </span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((Math.abs(zomatoBreakdownModal.data.cancelledPayout) / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Rejected Orders Payout:</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontWeight: '600', color: zomatoBreakdownModal.data.rejectedPayout >= 0 ? '#16a34a' : '#dc2626' }}>
                                                    {zomatoBreakdownModal.data.rejectedPayout >= 0 ? '+ ' : '- '}₹{Math.abs(zomatoBreakdownModal.data.rejectedPayout || 0).toFixed(2)}
                                                </span>
                                                <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                                                    {zomatoBreakdownModal.data.grossSale ? `(${((Math.abs(zomatoBreakdownModal.data.rejectedPayout) / zomatoBreakdownModal.data.grossSale) * 100).toFixed(1)}%)` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '2px solid #333' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
                                            <span>Net Pay:</span>
                                            <span>₹{(
                                                (zomatoBreakdownModal.data.netOrder || 0) -
                                                (zomatoBreakdownModal.data.totalDeductions || 0) +
                                                (zomatoBreakdownModal.data.netAdditions || 0) -
                                                (zomatoBreakdownModal.data.ads || 0) +
                                                (zomatoBreakdownModal.data.cancelledPayout || 0) +
                                                (zomatoBreakdownModal.data.rejectedPayout || 0)
                                            ).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
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
        { key: 'grossSale', label: 'Gross Sale + GST', type: 'currency' },
        { key: 'grossSaleAfterGST', label: 'Gross Sale', type: 'currency' },
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