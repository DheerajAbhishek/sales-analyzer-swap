import React, { useState, useEffect } from 'react'
import { expenseService } from '../../services/api'
import { formatValue } from '../../utils/helpers'

cons                    <h3 style={{
                        textAlign: 'center',
                        marginBottom: '1rem',
                        color: '#1a1a1a',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        💰 Expenses Analysis
                    </h3>sSection = ({ selections, grossSale, netSale }) => {
    const [expenses, setExpenses] = useState({
        openingInventory: '',
        closingInventory: '',
        foodCosting: '',
        expensesPackings: '',
        misc: '',
        subscriptions_and_logistics: '',
        rent: '',
        electricity: '',
        salaries: '',
    })
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState('')
    const [showExpensesTable, setShowExpensesTable] = useState(false)

    const restaurantKey = selections.restaurants[0]
    const month = selections.startDate.substring(0, 7) // YYYY-MM

    useEffect(() => {
        loadExpenses()
    }, [restaurantKey, month])

    const loadExpenses = async () => {
        try {
            const response = await expenseService.getExpenses(restaurantKey, month)
            const savedData = response.body ? JSON.parse(response.body) : response

            if (savedData && Object.keys(savedData).length > 0) {
                setExpenses({
                    openingInventory: savedData.openingInventory || '',
                    closingInventory: savedData.closingInventory || '',
                    foodCosting: savedData.foodCosting || '',
                    expensesPackings: savedData.expensesPackings || savedData.pnlPackings || '',
                    misc: savedData.misc || '',
                    subscriptions_and_logistics: savedData.subscriptions_and_logistics || '',
                    rent: savedData.rent || '',
                    electricity: savedData.electricity || '',
                    salaries: savedData.salaries || ''
                })

                if (grossSale > 0) {
                    setShowExpensesTable(true)
                }
            }
        } catch (err) {
            console.log('No saved expenses found')
        }
    }

    const handleInputChange = (field, value) => {
        setExpenses(prev => ({
            ...prev,
            [field]: value
        }))
    }

    const handleSave = async () => {
        setSaving(true)
        setStatus('Saving expenses...')

        try {
            const expenseData = {}
            Object.keys(expenses).forEach(key => {
                expenseData[key] = parseFloat(expenses[key]) || 0
            })

            await expenseService.saveExpenses(restaurantKey, month, expenseData)
            setStatus('Expenses saved successfully!')
            setShowExpensesTable(true)

            setTimeout(() => setStatus(''), 3000)
        } catch (err) {
            setStatus(`Error: ${err.message}`)
            setTimeout(() => setStatus(''), 5000)
        } finally {
            setSaving(false)
        }
    }

    const getStatusClass = () => {
        if (status.includes('successfully')) return 'status success'
        if (status.includes('Error:')) return 'status error'
        if (status.includes('Saving')) return 'status loading'
        return 'status'
    }

    const calculatePercentage = (value) => {
        return grossSale > 0 ? ((parseFloat(value) || 0) / grossSale * 100).toFixed(2) + '%' : '0%'
    }

    const calculateTotalExpenses = () => {
        return Object.values(expenses).reduce((total, value) => {
            return total + (parseFloat(value) || 0)
        }, 0)
    }

    const calculateProfitLoss = () => {
        const totalExpenses = calculateTotalExpenses()
        return (netSale || 0) - totalExpenses
    }

    const getProfitLossLabel = () => {
        const profitLoss = calculateProfitLoss()
        return profitLoss >= 0 ? 'Profit' : 'Loss'
    }

    const expenseFields = [
        { key: 'openingInventory', label: 'Opening Inventory' },
        { key: 'closingInventory', label: 'Closing Inventory' },
        { key: 'foodCosting', label: 'Food Costing' },
        { key: 'expensesPackings', label: 'Packings' },
        { key: 'misc', label: 'Miscellaneous' },
        { key: 'subscriptions_and_logistics', label: 'Subscriptions & Logistics' },
        { key: 'rent', label: 'Rent' },
        { key: 'electricity', label: 'Electricity' },
        { key: 'salaries', label: 'Salaries' }
    ]

    return (
        <div className="expenses-section">
            <h2 className="card-header">Monthly Expenses Analysis</h2>

            <div className="expenses-grid">
                {expenseFields.map(field => (
                    <div key={field.key} className="form-group">
                        <label className="form-label">
                            {field.label}
                        </label>
                        <input
                            type="number"
                            className="form-control"
                            placeholder="0.00"
                            value={expenses[field.key]}
                            onChange={(e) => handleInputChange(field.key, e.target.value)}
                            step="0.01"
                        />
                    </div>
                ))}
            </div>

            <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
                style={{ marginBottom: '1rem' }}
            >
                {saving ? 'Saving...' : 'Save Expenses'}
            </button>

            {status && (
                <div className={getStatusClass()}>
                    {status}
                </div>
            )}

            {showExpensesTable && grossSale > 0 && (
                <div className="expenses-display">
                    <h3 style={{
                        textAlign: 'center',
                        marginBottom: '1rem',
                        color: 'var(--primary-black)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        � Expenses Analysis
                    </h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Expense Category</th>
                                <th>Amount</th>
                                <th>% of Gross Sale</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenseFields.map(field => {
                                const value = parseFloat(expenses[field.key]) || 0
                                return (
                                    <tr key={field.key}>
                                        <td>{field.label}</td>
                                        <td>{formatValue(value, 'currency')}</td>
                                        <td>{calculatePercentage(value)}</td>
                                    </tr>
                                )
                            })}
                            <tr style={{ 
                                borderTop: '2px solid #6366f1', 
                                backgroundColor: '#f1f5f9',
                                fontWeight: 'bold'
                            }}>
                                <td style={{ fontWeight: 'bold' }}>Total Expenses</td>
                                <td style={{ fontWeight: 'bold' }}>{formatValue(calculateTotalExpenses(), 'currency')}</td>
                                <td style={{ fontWeight: 'bold' }}>{calculatePercentage(calculateTotalExpenses())}</td>
                            </tr>
                            <tr style={{ 
                                borderTop: '1px solid #cbd5e1', 
                                backgroundColor: calculateProfitLoss() >= 0 ? '#f0fdf4' : '#fef2f2',
                                fontWeight: 'bold',
                                color: calculateProfitLoss() >= 0 ? '#166534' : '#991b1b'
                            }}>
                                <td style={{ fontWeight: 'bold' }}>{getProfitLossLabel()}</td>
                                <td style={{ fontWeight: 'bold' }}>{formatValue(Math.abs(calculateProfitLoss()), 'currency')}</td>
                                <td style={{ fontWeight: 'bold' }}>{grossSale > 0 ? ((Math.abs(calculateProfitLoss()) / grossSale * 100).toFixed(2) + '%') : '0%'}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div style={{
                        marginTop: '1rem',
                        padding: '1rem',
                        background: '#f8f9fa',
                        borderRadius: '8px',
                        border: '2px solid #1a1a1a',
                        textAlign: 'center'
                    }}>
                        <div style={{ marginBottom: '0.5rem' }}>
                            <strong style={{ color: '#1a1a1a' }}>
                                Gross Sale: {formatValue(grossSale, 'currency')}
                            </strong>
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                            <strong style={{ color: '#1a1a1a' }}>
                                Net Sale: {formatValue(netSale || 0, 'currency')}
                            </strong>
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                            <strong style={{ color: '#1a1a1a' }}>
                                Total Expenses: {formatValue(calculateTotalExpenses(), 'currency')}
                            </strong>
                        </div>
                        <div style={{ 
                            marginTop: '1rem',
                            padding: '0.75rem',
                            borderRadius: '6px',
                            background: calculateProfitLoss() >= 0 ? '#f0fdf4' : '#fef2f2',
                            border: `2px solid ${calculateProfitLoss() >= 0 ? '#22c55e' : '#ef4444'}`
                        }}>
                            <strong style={{ 
                                color: calculateProfitLoss() >= 0 ? '#166534' : '#991b1b',
                                fontSize: '1.1rem'
                            }}>
                                {getProfitLossLabel()}: {formatValue(Math.abs(calculateProfitLoss()), 'currency')}
                            </strong>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ExpensesSection