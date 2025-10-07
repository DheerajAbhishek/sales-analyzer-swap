import React, { useState } from 'react'
import ControlsPanel from './components/Controls/ControlsPanel.jsx'
import Dashboard from './components/Dashboard/Dashboard.jsx'
import { RESTAURANT_ID_MAP } from './utils/constants'
import { reportService } from './services/api'

function App() {
    const [dashboardData, setDashboardData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const handleGetReport = async (selections) => {
        const { restaurants, channels, startDate, endDate, groupBy, thresholds } = selections

        setLoading(true)
        setError(null)
        setDashboardData(null)

        try {
            // Build restaurant details array
            const restaurantDetails = []
            restaurants.forEach(resKey => {
                const restaurantInfo = RESTAURANT_ID_MAP[resKey]
                channels.forEach(channelKey => {
                    const restaurantId = restaurantInfo[channelKey]
                    // Only add if restaurantId exists and is not empty
                    if (restaurantId && restaurantId.trim() !== '') {
                        restaurantDetails.push({
                            id: restaurantId,
                            name: restaurantInfo.name,
                            platform: channelKey,
                            key: resKey
                        })
                    }
                })
            })

            if (restaurantDetails.length === 0) {
                throw new Error('No valid Restaurant/Channel combination found.')
            }

            // Fetch data for all restaurant/channel combinations
            const fetchPromises = restaurantDetails.map(detail =>
                reportService.getConsolidatedInsights(detail.id, startDate, endDate, groupBy)
            )

            const results = await Promise.all(fetchPromises)

            const parsedResults = results.map(res => {
                if (typeof res.body === 'string') return JSON.parse(res.body)
                return res
            })

            setDashboardData({
                results: parsedResults,
                details: restaurantDetails,
                selections,
                groupBy,
                thresholds
            })

        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="main-layout">
            <div className="controls-column">
                <ControlsPanel
                    onGetReport={handleGetReport}
                    loading={loading}
                />
            </div>
            <div className="dashboard-column">
                {error && (
                    <div className="card">
                        <div className="status error">
                            ERROR: {error}
                        </div>
                    </div>
                )}
                {loading && (
                    <div className="card">
                        <div className="status loading">
                            Fetching reports...
                        </div>
                    </div>
                )}
                {dashboardData && !loading && (
                    <Dashboard
                        data={dashboardData}
                    />
                )}
                {!dashboardData && !loading && !error && (
                    <div className="card">
                        <h1 className="dashboard-title">Sales Insights Dashboard</h1>
                        <p style={{ textAlign: 'center', color: 'var(--primary-gray)', fontSize: '1.1rem' }}>
                            Select your parameters from the controls panel to generate insights
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default App