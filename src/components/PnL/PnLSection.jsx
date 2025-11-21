import React, { useState, useEffect } from 'react'
import { expenseService } from '../../services/api'
import { formatValue } from '../../utils/helpers'

cons < h3 style = {{
    textAlign: 'center',
        marginBottom: '1rem',
            color: '#1a1a1a',
                textTransform: 'uppercase',
                    letterSpacing: '0.5px'
}}>
                        ≡ƒÆ░ Expenses Analysis
                    </h3 > sSection = ({ selections, grossSale, netSale }) => {
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
}

export default ExpensesSection
