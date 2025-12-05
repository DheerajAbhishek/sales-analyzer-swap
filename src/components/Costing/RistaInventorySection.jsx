import React, { useState, useEffect, useRef } from 'react'
import { ristaService } from '../../services/api'
import { formatValue } from '../../utils/helpers'
import { RESTAURANT_ID_MAP } from '../../utils/constants'
import flatpickr from 'flatpickr'

const RistaInventorySection = () => {
    const [inventoryData, setInventoryData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [expanded, setExpanded] = useState(false)
    const [selectedRestaurant, setSelectedRestaurant] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const datePickerRef = useRef(null)

    // Initialize flatpickr date range picker
    useEffect(() => {
        const dateInput = document.getElementById('ristaInventoryDateRange')
        if (dateInput && !datePickerRef.current) {
            datePickerRef.current = flatpickr(dateInput, {
                mode: 'range',
                dateFormat: 'Y-m-d',
                onChange: (selectedDates) => {
                    if (selectedDates.length === 2) {
                        const pad = (num) => String(num).padStart(2, '0')
                        const format = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
                        setStartDate(format(selectedDates[0]))
                        setEndDate(format(selectedDates[1]))
                    }
                }
            })
        }
        return () => {
            if (datePickerRef.current) {
                datePickerRef.current.destroy()
                datePickerRef.current = null
            }
        }
    }, [])

    // Get restaurant options with Rista branch codes
    const restaurantOptions = Object.entries(RESTAURANT_ID_MAP)
        .filter(([key, config]) => config.ristaBranchCode)
        .map(([key, config]) => ({
            value: key,
            label: config.name,
            branchCode: config.ristaBranchCode
        }))

    const selectedConfig = selectedRestaurant ? RESTAURANT_ID_MAP[selectedRestaurant] : null
    const ristaBranchCode = selectedConfig?.ristaBranchCode || null

    const fetchInventory = async () => {
        if (!ristaBranchCode || !startDate || !endDate) {
            setError('Please select a restaurant and ensure dates are selected')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const data = await ristaService.fetchInventoryData(
                ristaBranchCode,
                startDate,
                endDate,
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
            color: '#10b981',
            count: inventoryData.data?.po?.consolidated?.approvedRecords || 0
        },
        {
            label: 'Audit',
            value: inventoryData.summary.totalAuditAmount,
            color: '#3b82f6',
            count: inventoryData.data?.audit?.consolidated?.finalRecords || inventoryData.data?.audit?.rawCount || 0,
            variance: inventoryData.summary.totalAuditVariance
        },
        {
            label: 'Shrinkage/Wastage',
            value: inventoryData.summary.totalShrinkageAmount,
            color: '#ef4444',
            count: inventoryData.data?.shrinkage?.rawCount || 0
        },
        {
            label: 'Adjustments',
            value: inventoryData.summary.totalAdjustmentAmount,
            color: '#f59e0b',
            count: inventoryData.data?.adjustment?.rawCount || 0
        }
    ] : []

    // Get top shrinkage items
    const getTopShrinkageItems = () => {
        const shrinkageItems = inventoryData?.data?.shrinkage?.consolidated?.items || {}
        return Object.entries(shrinkageItems)
            .map(([sku, item]) => ({ sku, ...item }))
            .filter(item => Math.abs(item.totalAmount || 0) > 0)
            .sort((a, b) => Math.abs(b.totalAmount || 0) - Math.abs(a.totalAmount || 0))
            .slice(0, 5)
    }

    // Get top purchased items from PO
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
            .filter(item => Math.abs(item.variance || 0) > 0)
            .sort((a, b) => Math.abs(b.variance || 0) - Math.abs(a.variance || 0))
            .slice(0, 10)
    }

    // Spinner keyframes style
    const spinnerStyle = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;

    return (
        <div style={{
            marginTop: '24px',
            padding: '20px',
            backgroundColor: '#fff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
            <style>{spinnerStyle}</style>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <h2 style={{
                    margin: 0,
                    fontSize: '18px',
                    color: '#1e293b',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    Rista Inventory Tracking
                    <span style={{
                        fontSize: '12px',
                        backgroundColor: '#dbeafe',
                        color: '#1d4ed8',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontWeight: '500'
                    }}>
                        from Rista API
                    </span>
                </h2>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Restaurant Dropdown */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>
                            Restaurant
                        </label>
                        <select
                            value={selectedRestaurant}
                            onChange={(e) => {
                                setSelectedRestaurant(e.target.value)
                                setInventoryData(null)
                                setError(null)
                            }}
                            style={{
                                padding: '8px 12px',
                                minWidth: '180px',
                                borderRadius: '6px',
                                border: '1px solid #d1d5db',
                                fontSize: '14px'
                            }}
                        >
                            <option value="">Select Restaurant</option>
                            {restaurantOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label} ({opt.branchCode})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Date Range Picker */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>
                            Date Range
                        </label>
                        <input
                            type="text"
                            id="ristaInventoryDateRange"
                            placeholder="Select date range"
                            readOnly
                            style={{
                                padding: '8px 12px',
                                minWidth: '200px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px',
                                cursor: 'pointer',
                                backgroundColor: '#fff'
                            }}
                        />
                    </div>

                    <button
                        onClick={fetchInventory}
                        disabled={loading || !selectedRestaurant || !startDate || !endDate}
                        style={{
                            padding: '8px 18px',
                            backgroundColor: loading || !selectedRestaurant || !startDate || !endDate ? '#94a3b8' : '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: loading || !selectedRestaurant || !startDate || !endDate ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            marginTop: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        {loading && (
                            <span style={{
                                width: '16px',
                                height: '16px',
                                border: '2px solid rgba(255,255,255,0.3)',
                                borderTopColor: '#fff',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                            }}></span>
                        )}
                        {loading ? 'Fetching...' : 'Fetch Inventory'}
                    </button>
                </div>
            </div>

            {/* Date info */}
            {startDate && endDate && (
                <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '1rem' }}>
                    Date Range: {startDate} to {endDate}
                </p>
            )}

            {!startDate || !endDate ? (
                <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
                    Please select a date range above to fetch inventory data.
                </p>
            ) : !selectedRestaurant ? (
                <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
                    Please select a restaurant to fetch inventory data.
                </p>
            ) : null}

            {error && (
                <div style={{
                    padding: '12px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    color: '#dc2626',
                    marginBottom: '1rem'
                }}>
                    {error}
                </div>
            )}

            {inventoryData && !loading && (
                <>
                    {/* Summary Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '1rem',
                        marginBottom: '1.5rem'
                    }}>
                        {summaryCards.map((card, index) => (
                            <div
                                key={index}
                                style={{
                                    backgroundColor: '#f8fafc',
                                    padding: '1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0'
                                }}
                            >
                                <div style={{
                                    fontSize: '0.875rem',
                                    color: '#64748b',
                                    fontWeight: '500',
                                    marginBottom: '8px'
                                }}>
                                    {card.label}
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
                            backgroundColor: '#f8fafc',
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
                        {expanded ? 'Hide Details' : 'Show Details'}
                    </button>

                    {expanded && (
                        <div style={{
                            marginTop: '1rem',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '1rem'
                        }}>
                            {/* Top Purchased Items */}
                            <div style={{
                                backgroundColor: '#f8fafc',
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
                                backgroundColor: '#f8fafc',
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
                                backgroundColor: '#f8fafc',
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
                                backgroundColor: '#f8fafc',
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
                                backgroundColor: '#f8fafc',
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

export default RistaInventorySection
