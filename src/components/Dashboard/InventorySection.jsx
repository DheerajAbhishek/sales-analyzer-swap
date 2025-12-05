import React, { useState, useEffect } from 'react'
import { ristaService } from '../../services/api'
import { formatValue } from '../../utils/helpers'
import { RESTAURANT_ID_MAP } from '../../utils/constants'

const InventorySection = ({ selections }) => {
    const [inventoryData, setInventoryData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [expanded, setExpanded] = useState(false)

    // Get the restaurant key and find the Rista branch code
    const restaurantKey = selections?.restaurants?.[0]
    const restaurantConfig = RESTAURANT_ID_MAP[restaurantKey]
    const ristaBranchCode = restaurantConfig?.ristaBranchCode || restaurantConfig?.takeaway || null
    const restaurantName = restaurantConfig?.name || restaurantKey

    const fetchInventory = async () => {
        if (!ristaBranchCode || !selections?.startDate || !selections?.endDate) {
            setError('No Rista branch code configured for this restaurant')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const data = await ristaService.fetchInventoryData(
                ristaBranchCode,
                selections.startDate,
                selections.endDate,
                ['po', 'shrinkage', 'adjustment', 'audit']
            )
            setInventoryData(data)
        } catch (err) {
            console.error('Error fetching inventory:', err)
            setError(err.message || 'Failed to fetch inventory data')
        } finally {
            setLoading(false)
        }
    }

    const summaryCards = inventoryData?.summary ? [
        {
            label: 'Purchase Orders',
            value: inventoryData.summary.totalPurchaseOrderAmount,
            icon: null,
            color: '#10b981',
            count: inventoryData.data?.po?.consolidated?.approvedRecords || 0
        },
        {
            label: 'Audit',
            value: inventoryData.summary.totalAuditAmount,
            icon: null,
            color: '#3b82f6',
            count: inventoryData.data?.audit?.consolidated?.finalRecords || inventoryData.data?.audit?.rawCount || 0,
            variance: inventoryData.summary.totalAuditVariance
        },
        {
            label: 'Shrinkage/Wastage',
            value: inventoryData.summary.totalShrinkageAmount,
            icon: null,
            color: '#ef4444',
            count: inventoryData.data?.shrinkage?.rawCount || 0
        },
        {
            label: 'Adjustments',
            value: inventoryData.summary.totalAdjustmentAmount,
            icon: null,
            color: '#f59e0b',
            count: inventoryData.data?.adjustment?.rawCount || 0
        }
    ] : []

    // Get top shrinkage items (filter out items with 0 shrinkage)
    const getTopShrinkageItems = () => {
        const shrinkageItems = inventoryData?.data?.shrinkage?.consolidated?.items || {}
        return Object.entries(shrinkageItems)
            .map(([sku, item]) => ({ sku, ...item }))
            .filter(item => Math.abs(item.totalAmount || 0) > 0) // Only show items with actual shrinkage
            .sort((a, b) => Math.abs(b.totalAmount || 0) - Math.abs(a.totalAmount || 0))
            .slice(0, 5)
    }

    // Get top purchased items from PO (filter out items with 0 amount)
    const getTopPurchasedItems = () => {
        const poItems = inventoryData?.data?.po?.consolidated?.items || {}
        return Object.entries(poItems)
            .map(([sku, item]) => ({ sku, ...item }))
            .filter(item => (item.totalAmount || 0) > 0)
            .sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
            .slice(0, 10)
    }

    // Get category breakdown from PO
    const getCategoryBreakdown = () => {
        const categories = inventoryData?.data?.po?.consolidated?.categories || {}
        return Object.entries(categories)
            .map(([name, amount]) => ({ name, amount }))
            .filter(c => c.amount > 0)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10)
    }

    // Get supplier breakdown from PO
    const getSupplierBreakdown = () => {
        const suppliers = inventoryData?.data?.po?.consolidated?.suppliers || {}
        return Object.entries(suppliers)
            .map(([name, amount]) => ({ name, amount }))
            .filter(s => s.amount > 0)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5)
    }

    // Get top audit items with variance
    const getTopAuditVarianceItems = () => {
        const auditItems = inventoryData?.data?.audit?.consolidated?.items || {}
        return Object.entries(auditItems)
            .map(([sku, item]) => ({ sku, ...item }))
            .filter(item => Math.abs(item.variance || 0) > 0) // Only show items with variance
            .sort((a, b) => Math.abs(b.variance || 0) - Math.abs(a.variance || 0))
            .slice(0, 10)
    }

    return (
        <div style={{
            marginTop: '2rem',
            padding: '1.5rem',
            backgroundColor: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem'
            }}>
                <h2 style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    color: '#1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    Inventory Tracking
                    <span style={{
                        fontSize: '0.75rem',
                        backgroundColor: '#dbeafe',
                        color: '#1d4ed8',
                        padding: '2px 8px',
                        borderRadius: '12px'
                    }}>
                        from Rista
                    </span>
                </h2>
                <button
                    onClick={fetchInventory}
                    disabled={loading || !ristaBranchCode}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: loading ? '#94a3b8' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: loading || !ristaBranchCode ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    {loading ? (
                        <>
                            <span className="spinner" style={{
                                width: '14px',
                                height: '14px',
                                border: '2px solid #ffffff40',
                                borderTopColor: 'white',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                            }}></span>
                            Loading...
                        </>
                    ) : (
                        'Fetch Inventory'
                    )}
                </button>
            </div>

            {!ristaBranchCode && (
                <p style={{ color: '#64748b', fontStyle: 'italic' }}>
                    No Rista branch code configured for {restaurantName}. Please add the ristaBranchCode to RESTAURANT_ID_MAP.
                </p>
            )}

            {ristaBranchCode && !inventoryData && !loading && !error && (
                <p style={{ color: '#64748b', fontStyle: 'italic' }}>
                    Click "Fetch Inventory" to load data for {restaurantName} (Branch: {ristaBranchCode})
                </p>
            )}

            {error && (
                <div style={{
                    padding: '12px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    color: '#dc2626',
                    marginBottom: '1rem'
                }}>
                    ⚠️ {error}
                </div>
            )}

            {inventoryData && !loading && (
                <>
                    {/* Summary Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '1rem',
                        marginBottom: '1.5rem'
                    }}>
                        {summaryCards.map((card, index) => (
                            <div
                                key={index}
                                style={{
                                    backgroundColor: 'white',
                                    padding: '1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    marginBottom: '8px'
                                }}>
                                    <span style={{ fontSize: '1.25rem' }}>{card.icon}</span>
                                    <span style={{
                                        fontSize: '0.875rem',
                                        color: '#64748b',
                                        fontWeight: '500'
                                    }}>
                                        {card.label}
                                    </span>
                                </div>
                                <p style={{
                                    margin: 0,
                                    fontSize: '1.5rem',
                                    fontWeight: '600',
                                    color: card.color
                                }}>
                                    {formatValue(card.value, 'currency')}
                                </p>
                                {card.variance !== undefined && (
                                    <p style={{
                                        margin: '4px 0 0 0',
                                        fontSize: '0.75rem',
                                        color: card.variance > 0 ? '#22c55e' : '#ef4444'
                                    }}>
                                        Variance: {formatValue(Math.abs(card.variance), 'currency')}
                                    </p>
                                )}
                                <p style={{
                                    margin: '4px 0 0 0',
                                    fontSize: '0.75rem',
                                    color: '#94a3b8'
                                }}>
                                    {card.count} records
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Expandable Details */}
                    <button
                        onClick={() => setExpanded(!expanded)}
                        style={{
                            width: '100%',
                            padding: '10px',
                            backgroundColor: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '8px',
                            color: '#475569',
                            fontSize: '0.875rem'
                        }}
                    >
                        {expanded ? '▲ Hide Details' : '▼ Show Details'}
                    </button>

                    {expanded && (
                        <div style={{
                            marginTop: '1rem',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                            gap: '1rem'
                        }}>
                            {/* Top Purchased Items */}
                            <div style={{
                                backgroundColor: 'white',
                                padding: '1rem',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <h4 style={{
                                    margin: '0 0 12px 0',
                                    fontSize: '0.875rem',
                                    color: '#1e293b',
                                    borderBottom: '1px solid #e2e8f0',
                                    paddingBottom: '8px'
                                }}>
                                    Top Purchased Items
                                </h4>
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {getTopPurchasedItems().length > 0 ? (
                                        getTopPurchasedItems().map((item, index) => (
                                            <div
                                                key={index}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    padding: '6px 0',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                <span style={{ color: '#475569', flex: 1 }}>
                                                    {item.name || item.sku}
                                                </span>
                                                <span style={{ color: '#64748b', marginRight: '8px' }}>
                                                    {item.quantity?.toFixed(2)} {item.unit}
                                                </span>
                                                <span style={{ color: '#10b981', fontWeight: '500' }}>
                                                    {formatValue(item.totalAmount, 'currency')}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No purchase data</p>
                                    )}
                                </div>
                            </div>

                            {/* Category Breakdown */}
                            <div style={{
                                backgroundColor: 'white',
                                padding: '1rem',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <h4 style={{
                                    margin: '0 0 12px 0',
                                    fontSize: '0.875rem',
                                    color: '#1e293b',
                                    borderBottom: '1px solid #e2e8f0',
                                    paddingBottom: '8px'
                                }}>
                                    Purchase by Category
                                </h4>
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {getCategoryBreakdown().length > 0 ? (
                                        getCategoryBreakdown().map((cat, index) => (
                                            <div
                                                key={index}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    padding: '6px 0',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                <span style={{ color: '#475569' }}>
                                                    {cat.name}
                                                </span>
                                                <span style={{ color: '#3b82f6', fontWeight: '500' }}>
                                                    {formatValue(cat.amount, 'currency')}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No category data</p>
                                    )}
                                </div>
                            </div>

                            {/* Shrinkage Items */}
                            <div style={{
                                backgroundColor: 'white',
                                padding: '1rem',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <h4 style={{
                                    margin: '0 0 12px 0',
                                    fontSize: '0.875rem',
                                    color: '#1e293b',
                                    borderBottom: '1px solid #e2e8f0',
                                    paddingBottom: '8px'
                                }}>
                                    Top Shrinkage Items
                                </h4>
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {getTopShrinkageItems().length > 0 ? (
                                        getTopShrinkageItems().map((item, index) => (
                                            <div
                                                key={index}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    padding: '6px 0',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                <span style={{ color: '#475569' }}>
                                                    {item.name || item.sku}
                                                </span>
                                                <span style={{ color: '#ef4444', fontWeight: '500' }}>
                                                    {formatValue(item.totalAmount, 'currency')}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No shrinkage data</p>
                                    )}
                                </div>
                            </div>

                            {/* Supplier Breakdown */}
                            <div style={{
                                backgroundColor: 'white',
                                padding: '1rem',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <h4 style={{
                                    margin: '0 0 12px 0',
                                    fontSize: '0.875rem',
                                    color: '#1e293b',
                                    borderBottom: '1px solid #e2e8f0',
                                    paddingBottom: '8px'
                                }}>
                                    Top Suppliers
                                </h4>
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {getSupplierBreakdown().length > 0 ? (
                                        getSupplierBreakdown().map((supplier, index) => (
                                            <div
                                                key={index}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    padding: '6px 0',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                <span style={{ color: '#475569' }}>
                                                    {supplier.name}
                                                </span>
                                                <span style={{ color: '#10b981', fontWeight: '500' }}>
                                                    {formatValue(supplier.amount, 'currency')}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No supplier data</p>
                                    )}
                                </div>
                            </div>

                            {/* Audit Variance Items */}
                            <div style={{
                                backgroundColor: 'white',
                                padding: '1rem',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <h4 style={{
                                    margin: '0 0 12px 0',
                                    fontSize: '0.875rem',
                                    color: '#1e293b',
                                    borderBottom: '1px solid #e2e8f0',
                                    paddingBottom: '8px'
                                }}>
                                    Audit Variance Items
                                </h4>
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {getTopAuditVarianceItems().length > 0 ? (
                                        getTopAuditVarianceItems().map((item, index) => (
                                            <div
                                                key={index}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    padding: '6px 0',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                <span style={{ color: '#475569' }}>
                                                    {item.name || item.sku}
                                                </span>
                                                <span style={{
                                                    color: item.variance > 0 ? '#22c55e' : '#ef4444',
                                                    fontWeight: '500'
                                                }}>
                                                    {item.variance > 0 ? '+' : ''}{item.variance?.toFixed(2)} {item.unit}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No audit variance data</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Date Range Info */}
                    <p style={{
                        marginTop: '1rem',
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        textAlign: 'center'
                    }}>
                        Data for: {inventoryData.startDate} to {inventoryData.endDate}
                    </p>
                </>
            )}

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}

export default InventorySection
