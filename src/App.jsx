import React, { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import ControlsPanel from './components/Controls/ControlsPanel.jsx'
import Dashboard from './components/Dashboard/Dashboard.jsx'
import Nav from './components/Nav/Nav.jsx'
import { CostingDashboard, ManualEntry, UploadInvoice, ClosingInventory, DailyFoodCosting } from './pages/costing'
import { RESTAURANT_ID_MAP } from './utils/constants'
import { reportService } from './services/api'
import { autoLoadService } from './services/autoLoadService'


// Sales Analyzer Module Component
function SalesAnalyzer() {
    const queryClient = useQueryClient()

    const [dashboardData, setDashboardData] = useState(() => {
        // Try to load persisted data on initialization
        const savedData = localStorage.getItem('salesDashboardData')
        if (savedData) {
            try {
                const parsedData = JSON.parse(savedData)
                console.log('📋 Loaded persisted dashboard data from localStorage')
                return parsedData
            } catch (error) {
                console.warn('⚠️ Error parsing saved dashboard data:', error)
                localStorage.removeItem('salesDashboardData')
            }
        }
        return null
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    // Function to update dashboard data with persistence
    const updateDashboardData = (data, isManual = false) => {
        setDashboardData(data)

        if (data) {
            const dataToSave = { ...data, isManuallyFetched: isManual }
            localStorage.setItem('salesDashboardData', JSON.stringify(dataToSave))
            console.log(isManual ? '💾 Persisted manual dashboard data' : '💾 Persisted auto-loaded dashboard data')
        } else {
            localStorage.removeItem('salesDashboardData')
            console.log('🗑️ Cleared persisted dashboard data')
        }
    }

    // Auto-load data on app initialization
    useEffect(() => {
        const attemptAutoLoad = async () => {
            // Check if we already have manually fetched data
            const savedData = localStorage.getItem('salesDashboardData')
            if (savedData) {
                try {
                    const parsedData = JSON.parse(savedData)
                    if (parsedData.isManuallyFetched) {
                        console.log('📋 Manual data found in localStorage, skipping auto-load')
                        return
                    }
                } catch (error) {
                    console.warn('⚠️ Error parsing saved dashboard data:', error)
                }
            }

            console.log('🚀 Attempting auto-load...')
            setLoading(true)

            try {
                const autoLoadedData = await autoLoadService.loadLastMonthData()

                if (autoLoadedData) {
                    updateDashboardData(autoLoadedData, false)
                    console.log('✅ Auto-load successful')
                } else {
                    console.log('ℹ️ No data available for auto-load')
                }
            } catch (error) {
                console.error('❌ Auto-load failed:', error)
            } finally {
                setLoading(false)
            }
        }

        // Only attempt auto-load if we don't already have data
        if (!dashboardData || !dashboardData.isManuallyFetched) {
            attemptAutoLoad()
        }
    }, []) // Empty dependency array to run only once on mount

    const handleGetReport = async (selections) => {
        const { restaurants, channels, startDate, endDate, groupBy, thresholds } = selections

        setLoading(true)
        setError(null)
        updateDashboardData(null) // Clear previous data

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

            // Fetch data for all restaurant/channel combinations with React Query caching
            const fetchPromises = restaurantDetails.map(async (detail) => {
                try {
                    let result;
                    const cacheKey = detail.platform === 'takeaway' || detail.platform === 'corporate'
                        ? ['onDemandInsights', detail.id, startDate, endDate, detail.platform, groupBy]
                        : ['consolidatedInsights', detail.id, startDate, endDate, groupBy]

                    // Check if data is already cached
                    const cachedData = queryClient.getQueryData(cacheKey)
                    const isCached = !!cachedData

                    // Use React Query's fetchQuery for caching
                    result = await queryClient.fetchQuery({
                        queryKey: cacheKey,
                        queryFn: async () => {
                            if (detail.platform === 'takeaway' || detail.platform === 'corporate') {
                                return await reportService.getOnDemandInsights(detail.id, startDate, endDate, detail.platform, groupBy);
                            } else {
                                // Don't pass groupBy to API when it's 'total' - let backend return consolidatedInsights
                                const apiGroupBy = groupBy === 'total' ? null : groupBy;
                                return await reportService.getConsolidatedInsights(detail.id, startDate, endDate, apiGroupBy);
                            }
                        },
                        staleTime: 10 * 60 * 1000, // 10 minutes,
                    })

                    if (isCached) {
                        console.log(`[CACHE HIT] ${detail.name} (${detail.platform})`)
                    } else {
                        console.log(`[FETCHED] ${detail.name} (${detail.platform})`)
                    }

                    return {
                        success: true,
                        data: result,
                        detail: detail,
                        fromCache: isCached
                    }
                } catch (error) {
                    // Return failed request info instead of throwing
                    return {
                        success: false,
                        error: error.message,
                        detail: detail
                    }
                }
            })

            const results = await Promise.all(fetchPromises)

            // Filter successful results
            const successfulResults = results.filter(result => result.success)
            const failedResults = results.filter(result => !result.success)

            if (successfulResults.length === 0) {
                throw new Error('No data available for any selected channels')
            }

            // Log cache summary
            const cachedCount = successfulResults.filter(r => r.fromCache).length
            const fetchedCount = successfulResults.length - cachedCount
            console.log(`[CACHE SUMMARY] ${cachedCount} from cache, ${fetchedCount} freshly fetched`)

            // Parse successful results
            const parsedResults = successfulResults.map(result => {
                const res = result.data
                if (typeof res.body === 'string') return JSON.parse(res.body)
                return res
            })

            // Get successful details
            const successfulDetails = successfulResults.map(result => result.detail)

            // Show notification about failed channels if any
            if (failedResults.length > 0) {
                const failedChannels = failedResults.map(result =>
                    `${result.detail.name} (${result.detail.platform})`
                )

                // You can show a toast notification here instead of blocking the UI
                console.info(`Data not available for: ${failedChannels.join(', ')}`)
            }

            const newDashboardData = {
                results: parsedResults,
                details: successfulDetails,
                selections,
                groupBy,
                thresholds,
                // Include info about what was excluded
                excludedChannels: failedResults.map(result => ({
                    name: result.detail.name,
                    platform: result.detail.platform,
                    reason: result.error
                }))
            }

            // Use persistence function with manual flag
            updateDashboardData(newDashboardData, true)

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
                    <>
                        {/* Auto-load indicator */}
                        {dashboardData.isAutoLoaded && (
                            <div className="card" style={{ marginBottom: '1rem' }}>
                                <div className="status" style={{
                                    backgroundColor: '#e0f2fe',
                                    color: '#01579b',
                                    border: '1px solid #0288d1',
                                    borderRadius: '6px',
                                    padding: '12px',
                                    fontSize: '14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <span>🚀</span>
                                    <div>
                                        <strong>Auto-loaded Last Month's Data</strong>
                                        <br />
                                        <small>Data automatically loaded for your convenience. Use the controls panel to fetch different periods or restaurants.</small>
                                    </div>
                                </div>
                            </div>
                        )}

                        {dashboardData.excludedChannels && dashboardData.excludedChannels.length > 0 && (
                            <div className="card" style={{ marginBottom: '1rem' }}>
                                <div className="status warning" style={{
                                    backgroundColor: '#fef3c7',
                                    color: '#92400e',
                                    border: '1px solid #fbbf24',
                                    borderRadius: '6px',
                                    padding: '12px',
                                    fontSize: '14px'
                                }}>
                                    ⚠️ <strong>Data not available for:</strong> {dashboardData.excludedChannels.map(ch => `${ch.name} (${ch.platform})`).join(', ')}
                                    <br />
                                    <small>Showing data only for available channels.</small>
                                </div>
                            </div>
                        )}
                        <Dashboard
                            data={dashboardData}
                        />
                    </>
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

// Main App Component with Navigation and Routing
function App() {
    return (
        <div className="app-container">
            <Nav />
            <Routes>
                {/* Sales Analyzer Routes */}
                <Route path="/" element={<SalesAnalyzer />} />

                {/* Costing Module Routes */}
                <Route path="/costing" element={<CostingDashboard />} />
                <Route path="/costing/upload" element={<UploadInvoice />} />
                <Route path="/costing/manual-entry" element={<ManualEntry />} />
                <Route path="/costing/closing-inventory" element={<ClosingInventory />} />
                <Route path="/costing/daily-food-costing" element={<DailyFoodCosting />} />
            </Routes>
        </div>
    )
}

export default App