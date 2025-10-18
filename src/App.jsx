import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import ControlsPanel from './components/Controls/ControlsPanel.jsx'
import Dashboard from './components/Dashboard/Dashboard.jsx'
import AuthPage from './components/Auth/AuthPage.jsx'
import OAuthCallback from './components/Auth/OAuthCallback.jsx'
import LandingPage from './components/LandingPage.jsx'
import Profile from './components/Profile.jsx'
import ProfilePage from './components/ProfilePage.jsx'
import GmailIntegrationPanel from './components/Integration/GmailIntegrationPanel.jsx'
import { reportService } from './services/api'
import { authService } from './services/authService'
import { restaurantMetadataService } from './services/restaurantMetadataService'
import { autoEmailProcessingService } from './services/autoEmailProcessingService'

// Protected Route Component
const ProtectedRoute = ({ children }) => {
    const [user, setUser] = useState(null)
    const [isCheckingAuth, setIsCheckingAuth] = useState(true)
    const [userRestaurants, setUserRestaurants] = useState(null)

    useEffect(() => {
        const checkAuth = async () => {
            const authMethod = authService.getAuthMethod()

            if (authMethod === 'google') {
                // For Google OAuth, verify the authentication
                const result = await authService.verifyGoogleAuth()
                if (result.success) {
                    setUser(result.user)
                    setUserRestaurants(result.restaurants)
                    console.log('Google user restaurants available:', result.restaurants)
                } else {
                    authService.logout()
                }
            } else {
                // For traditional auth, verify the token
                const token = authService.getToken()
                if (token) {
                    const result = await authService.verifyToken(token)
                    if (result.success) {
                        setUser(result.user)
                        setUserRestaurants(result.restaurants)
                        console.log('User restaurants available:', result.restaurants)
                    } else {
                        authService.logout()
                    }
                }
            }
            setIsCheckingAuth(false)
        }

        checkAuth()
    }, [])

    if (isCheckingAuth) {
        return (
            <div className="auth-loading">
                <div className="loading-spinner"></div>
                <p>Loading...</p>
            </div>
        )
    }

    return user ? children : <Navigate to="/login" replace />
}

// Dashboard Component with Authentication
const DashboardPage = () => {
    const [user, setUser] = useState(authService.getCurrentUser())
    const [userRestaurants, setUserRestaurants] = useState(authService.getUserRestaurants())
    const [dashboardData, setDashboardData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const navigate = useNavigate()

    const [showProfile, setShowProfile] = useState(false)
    const [showGmail, setShowGmail] = useState(false)
    const [emailProcessingStatus, setEmailProcessingStatus] = useState(null)
    const [controlsPanelKey, setControlsPanelKey] = useState(0)
    const [refreshing, setRefreshing] = useState(false)

    // Fetch fresh restaurant data on component mount (no cache)
    useEffect(() => {
        const fetchFreshRestaurants = async () => {
            try {
                console.log('Dashboard: Fetching fresh user restaurants from API...')
                const { restaurantService } = await import('./services/api')

                // Get email from user state or localStorage
                const email = user?.businessEmail || user?.email;
                if (!email) {
                    console.warn('Dashboard: No email found, using cached data')
                    const cachedData = authService.getUserRestaurants()
                    setUserRestaurants(cachedData)
                    return
                }

                console.log('Dashboard: Fetching restaurants for:', email)
                const freshData = await restaurantService.getUserRestaurants(email)
                console.log('Dashboard: Fresh restaurants loaded:', freshData)
                setUserRestaurants(freshData)
                // Update localStorage
                localStorage.setItem('userRestaurants', JSON.stringify(freshData))
            } catch (error) {
                console.error('Dashboard: Failed to fetch fresh restaurants:', error)
                // Fallback to localStorage if API fails
                const cachedData = authService.getUserRestaurants()
                setUserRestaurants(cachedData)
            }
        }

        fetchFreshRestaurants()
    }, []) // Run once on mount

    // Log user restaurants on component mount for debugging
    useEffect(() => {
        console.log('Dashboard: User restaurants loaded:', userRestaurants)
    }, [userRestaurants])

    // Listen for auto email processing updates
    useEffect(() => {
        // Check for existing processing status on mount
        if (user?.businessEmail || user?.email) {
            const userEmail = user.businessEmail || user.email
            const existingStatus = autoEmailProcessingService.getStatus(userEmail)

            if (existingStatus.isProcessing) {
                console.log('📥 Found existing processing status on mount:', existingStatus)
                setEmailProcessingStatus(existingStatus)
            }
        }

        const handleProcessingUpdate = (event) => {
            const { userEmail, status } = event.detail
            console.log('📥 App received processing update:', {
                receivedUserEmail: userEmail,
                currentUserEmail: user?.businessEmail || user?.email,
                status
            })
            if (userEmail === user?.businessEmail || userEmail === user?.email) {
                console.log('✅ Email matches - updating state:', status)

                // Only set processing status if it's actually processing (from signup)
                // Don't restore old completed status on page refresh
                if (status.isProcessing) {
                    setEmailProcessingStatus(status)
                } else if (emailProcessingStatus?.isProcessing) {
                    // Only update to completed if we were previously processing
                    setEmailProcessingStatus(status)
                }
            } else {
                console.log('❌ Email does not match - ignoring update')
            }
        }

        window.addEventListener('autoEmailProcessingUpdate', handleProcessingUpdate)

        return () => {
            window.removeEventListener('autoEmailProcessingUpdate', handleProcessingUpdate)
        }
    }, [user, emailProcessingStatus?.isProcessing])

    // 1-Minute Timer for Progress Bar (only during active signup processing)
    useEffect(() => {
        // Only start timer if processing AND this is a fresh processing session
        if (!emailProcessingStatus?.isProcessing) return

        // Check if this is from a page reload (if completedAt already exists, don't start timer)
        if (emailProcessingStatus.completedAt) return

        console.log('⏱️ Starting 1-minute progress timer for email processing')
        const startTime = Date.now()
        const duration = 60000 // 1 minute in milliseconds

        const timer = setInterval(() => {
            const elapsed = Date.now() - startTime
            const progress = Math.min(elapsed / duration, 1)

            setEmailProcessingStatus(prev => {
                // Don't update if processing is no longer active
                if (!prev?.isProcessing) {
                    clearInterval(timer)
                    return prev
                }

                return {
                    ...prev,
                    progress
                }
            })

            // Stop timer when 1 minute is complete
            if (progress >= 1) {
                clearInterval(timer)
                // Mark processing as complete after 1 minute
                setEmailProcessingStatus(prev => ({
                    ...prev,
                    isProcessing: false,
                    completedAt: new Date().toISOString(),
                    progress: 1
                }))
            }
        }, 100) // Update every 100ms for smooth animation

        return () => {
            console.log('⏱️ Cleaning up progress timer')
            clearInterval(timer)
        }
    }, [emailProcessingStatus?.isProcessing, emailProcessingStatus?.completedAt])

    // Listen for restaurant updates after file uploads
    useEffect(() => {
        const handleRestaurantUpdate = (event) => {
            console.log('Dashboard: Restaurants updated after upload:', event.detail)
            setUserRestaurants(event.detail)
        }

        window.addEventListener('userRestaurantsUpdated', handleRestaurantUpdate)

        return () => {
            window.removeEventListener('userRestaurantsUpdated', handleRestaurantUpdate)
        }
    }, [])

    const handleLogout = () => {
        authService.logout()
        setUser(null)
        setDashboardData(null)
        setError(null)
        navigate('/')
    }

    const handleProfileClick = () => {
        navigate('/profile')
    }

    const handleGmailClick = () => {
        setShowGmail(!showGmail)
        setShowProfile(false) // Close profile if open
    }

    const handleRefreshControlsPanel = async () => {
        console.log('🔄 Refreshing Controls Panel and Restaurants...')

        setRefreshing(true)

        try {
            // Fetch fresh restaurant data
            const email = user?.businessEmail || user?.email
            if (!email) {
                console.warn('No email found for refresh')
                setRefreshing(false)
                return
            }

            console.log('📥 Fetching fresh restaurants for:', email)
            const { restaurantService } = await import('./services/api')
            const freshData = await restaurantService.getUserRestaurants(email)

            console.log('✅ Fresh restaurants loaded:', freshData)

            // Update state and localStorage
            setUserRestaurants(freshData)
            localStorage.setItem('userRestaurants', JSON.stringify(freshData))

            // Force Controls Panel to remount with new data
            setControlsPanelKey(prev => prev + 1)

        } catch (error) {
            console.error('❌ Error refreshing restaurants:', error)
            // Don't show error on dashboard - just log it
            // User will notice nothing changed in the dropdown
        } finally {
            setRefreshing(false)
        }
    }

    const handleGetReport = async (selections) => {
        const { restaurants, channels, startDate, endDate, groupBy, thresholds } = selections

        setLoading(true)
        setError(null)
        setDashboardData(null)

        try {
            // Use the restaurant IDs directly from the API response
            // Each restaurant ID can be used directly for the API call
            const restaurantDetails = []

            restaurants.forEach(restaurantId => {
                // Get display name from metadata
                const restaurantData = restaurantMetadataService.getRestaurantData(restaurantId)

                restaurantDetails.push({
                    id: restaurantId,
                    name: restaurantData.name,
                    platform: 'auto', // Platform will be determined by the backend
                    key: restaurantId
                })
            })

            if (restaurantDetails.length === 0) {
                throw new Error('No restaurants selected.')
            }

            // Fetch data for all restaurant IDs with error handling
            const apiGroupBy = groupBy === 'total' ? 'day' : groupBy
            const fetchPromises = restaurantDetails.map(async (detail) => {
                try {
                    const result = await reportService.getConsolidatedInsights(detail.id, startDate, endDate, apiGroupBy)
                    return {
                        success: true,
                        data: result,
                        detail: detail
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
                throw new Error('No data available for any selected restaurants')
            }

            // Parse successful results
            const parsedResults = successfulResults.map(result => {
                const res = result.data
                if (typeof res.body === 'string') return JSON.parse(res.body)
                return res
            })

            console.log('📦 API Response - Parsed Results:', parsedResults)
            console.log('📦 Number of successful results:', parsedResults.length)
            parsedResults.forEach((result, index) => {
                console.log(`📦 Result ${index}:`, {
                    hasConsolidatedInsights: !!result.consolidatedInsights,
                    hasTimeSeriesData: !!result.timeSeriesData,
                    timeSeriesLength: result.timeSeriesData?.length || 0,
                    consolidatedInsights: result.consolidatedInsights,
                    sampleTimeSeries: result.timeSeriesData?.[0]
                })
            })

            // Get successful details
            const successfulDetails = successfulResults.map(result => result.detail)

            // Show notification about failed restaurants if any
            if (failedResults.length > 0) {
                const failedRestaurants = failedResults.map(result => result.detail.name)
                console.info(`Data not available for: ${failedRestaurants.join(', ')}`)
            }

            setDashboardData({
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
            })

        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleRefreshRestaurants = async () => {
        try {
            setLoading(true)
            console.log('🔄 Manually refreshing user restaurants...')
            const { restaurantService } = await import('./services/api')
            const freshData = await restaurantService.refreshUserRestaurants()
            console.log('✓ Restaurants refreshed successfully:', freshData)
            setUserRestaurants(freshData)
            // Update localStorage
            localStorage.setItem('userRestaurants', JSON.stringify(freshData))
        } catch (error) {
            console.error('Error refreshing restaurants:', error)
            setError('Failed to refresh restaurants. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <header className="top-navbar">
                <div className="brand">Sales Insights</div>
                <div className="nav-actions">
                    <div className="welcome">Welcome, {user?.restaurantName}</div>

                    {/* 1-Minute Progress Timer */}
                    {emailProcessingStatus?.isProcessing && (
                        <div style={{
                            marginRight: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            minWidth: '200px'
                        }}>
                            <div style={{
                                fontSize: '12px',
                                color: '#666',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <span>Processing emails...</span>
                                <span>{Math.round((emailProcessingStatus.progress || 0) * 100)}%</span>
                            </div>
                            <div style={{
                                width: '100%',
                                height: '6px',
                                backgroundColor: '#e0e0e0',
                                borderRadius: '3px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    width: `${(emailProcessingStatus.progress || 0) * 100}%`,
                                    height: '100%',
                                    backgroundColor: '#4285f4',
                                    transition: 'width 0.5s linear',
                                    borderRadius: '3px'
                                }}></div>
                            </div>
                        </div>
                    )}

                    <button className="gmail-toggle" onClick={handleGmailClick} style={{
                        marginRight: '10px',
                        backgroundColor: showGmail ? '#4285f4' : '#f8f9fa',
                        color: showGmail ? 'white' : '#333',
                        border: '1px solid #ddd',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer'
                    }}>
                        📧 Gmail
                    </button>
                    <button onClick={handleRefreshControlsPanel} disabled={refreshing} style={{
                        marginRight: '10px',
                        backgroundColor: '#f8f9fa',
                        color: '#333',
                        border: '1px solid #ddd',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        cursor: refreshing ? 'not-allowed' : 'pointer',
                        opacity: refreshing ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }} title="Refresh controls panel">
                        <span style={{
                            display: 'inline-block',
                            animation: refreshing ? 'spin 1s linear infinite' : 'none'
                        }}>🔄</span>
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button className="profile-toggle" onClick={handleProfileClick}>
                        Profile
                    </button>
                </div>
            </header>

            {showProfile && (
                <div className="profile-container">
                    <Profile user={user} onLogout={handleLogout} />
                </div>
            )}

            {showGmail && (
                <div className="gmail-container" style={{
                    position: 'fixed',
                    top: '60px',
                    right: '20px',
                    width: '400px',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    backgroundColor: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    padding: '0'
                }}>
                    <div style={{
                        padding: '16px',
                        borderBottom: '1px solid #eee',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: '#f8f9fa'
                    }}>
                        <h3 style={{ margin: 0, color: '#333' }}>📧 Gmail Integration</h3>
                        <button onClick={() => setShowGmail(false)} style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '18px',
                            cursor: 'pointer',
                            color: '#666'
                        }}>×</button>
                    </div>
                    <GmailIntegrationPanel />
                </div>
            )}

            <div className="main-layout">
                <div className="controls-column">
                    <ControlsPanel
                        key={controlsPanelKey}
                        onGetReport={handleGetReport}
                        loading={loading}
                        userRestaurants={userRestaurants}
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
                                        <small>Showing data only for available restaurants.</small>
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
        </>
    )
}

// OAuth Callback Component with Navigation
const OAuthCallbackWithNavigation = () => {
    const navigate = useNavigate()

    const handleAuthSuccess = (userData) => {
        navigate('/dashboard')
    }

    return <OAuthCallback onAuthSuccess={handleAuthSuccess} />
}

// Auth Component with Navigation
const AuthPageWithNavigation = () => {
    const navigate = useNavigate()

    const handleAuthSuccess = (userData) => {
        navigate('/dashboard')
    }

    return <AuthPage onAuthSuccess={handleAuthSuccess} />
}

// Landing Component with Navigation
const LandingPageWithNavigation = () => {
    const navigate = useNavigate()

    const handleGetStarted = () => {
        navigate('/login')
    }

    return <LandingPage onGetStarted={handleGetStarted} />
}

// Profile Page Component with Navigation
const ProfilePageWithNavigation = () => {
    const navigate = useNavigate()
    const user = authService.getCurrentUser()

    const handleLogout = () => {
        authService.logout()
        navigate('/')
    }

    const handleBack = () => {
        navigate('/dashboard')
    }

    return <ProfilePage user={user} onLogout={handleLogout} onBack={handleBack} />
}

function App() {
    console.log('[dev] App.jsx: rendering App component')

    return (
        <Router>
            <Routes>
                <Route path="/" element={<LandingPageWithNavigation />} />
                <Route path="/login" element={<AuthPageWithNavigation />} />
                <Route path="/signup" element={<AuthPageWithNavigation />} />
                <Route path="/oauth/callback" element={<OAuthCallbackWithNavigation />} />
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <DashboardPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/profile"
                    element={
                        <ProtectedRoute>
                            <ProfilePageWithNavigation />
                        </ProtectedRoute>
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    )
}

export default App