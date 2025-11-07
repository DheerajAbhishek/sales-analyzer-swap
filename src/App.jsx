import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import ControlsPanel from './components/Controls/ControlsPanel.jsx'
import Dashboard from './components/Dashboard/Dashboard.jsx'
import AuthPage from './components/Auth/AuthPage.jsx'
import OAuthCallback from './components/Auth/OAuthCallback.jsx'
import LandingPage from './components/LandingPage.jsx'
import Profile from './components/Profile.jsx'
import ProfilePage from './components/ProfilePage.jsx'
import PrivacyPolicy from './components/Legal/PrivacyPolicy.jsx'
import TermsOfService from './components/Legal/TermsOfService.jsx'
import MobileNavigation from './components/MobileNavigation.jsx'
import CollapsibleControlsPanel from './components/CollapsibleControlsPanel.jsx'
import { reportService, restaurantService } from './services/api'
import { authService } from './services/authService'
import { restaurantMetadataService } from './services/restaurantMetadataService'
import { autoEmailProcessingService } from './services/autoEmailProcessingService'
import { autoLoadService } from './services/autoLoadService'

// Protected Route Component
const ProtectedRoute = ({ children }) => {
    const [user, setUser] = useState(null)
    const [isCheckingAuth, setIsCheckingAuth] = useState(true)
    const [userRestaurants, setUserRestaurants] = useState(null)

    useEffect(() => {
        const checkAuth = async () => {
            // First, do a quick check from localStorage to avoid unnecessary API calls
            const currentUser = authService.getCurrentUser()
            const authMethod = authService.getAuthMethod()

            console.log('ProtectedRoute: Current user:', currentUser ? 'Found' : 'Not found')
            console.log('ProtectedRoute: Auth method:', authMethod)

            if (!currentUser) {
                console.log('ProtectedRoute: No user in localStorage, redirecting to login')
                setIsCheckingAuth(false)
                return
            }

            // User exists in localStorage, set them immediately for better UX
            setUser(currentUser)
            const cachedRestaurants = authService.getUserRestaurants()
            setUserRestaurants(cachedRestaurants)
            setIsCheckingAuth(false) // Stop loading immediately

            // Perform background verification (don't block UI)
            console.log(`ProtectedRoute: User found with authMethod: ${authMethod}, performing background verification`)

            try {
                // Check if user has Google-related data (indicates OAuth user)
                const hasGoogleData = currentUser.picture || currentUser.emailVerified !== undefined
                const isGoogleUser = authMethod === 'google' || authMethod === 'linked' || hasGoogleData

                console.log(`ProtectedRoute: isGoogleUser: ${isGoogleUser}, hasGoogleData: ${hasGoogleData}`)

                if (isGoogleUser) {
                    // For Google OAuth users, we mainly rely on localStorage
                    // These users don't have traditional auth tokens
                    console.log('ProtectedRoute: Google/linked user verified from localStorage')
                } else if (authMethod === 'traditional') {
                    // For traditional auth, verify the token in background
                    const token = authService.getToken()
                    if (token) {
                        const result = await authService.verifyToken(token)
                        if (!result.success) {
                            console.log('ProtectedRoute: Token verification failed, logging out')
                            authService.logout()
                            setUser(null)
                            setUserRestaurants(null)
                        } else {
                            // Update with fresh data if verification succeeds
                            setUser(result.user)
                            setUserRestaurants(result.restaurants)
                        }
                    } else {
                        console.log('ProtectedRoute: No token found for traditional auth, logging out')
                        authService.logout()
                        setUser(null)
                        setUserRestaurants(null)
                    }
                } else {
                    // Unknown auth method, but user exists in localStorage
                    console.log(`ProtectedRoute: Unknown authMethod '${authMethod}', but user exists - keeping logged in`)
                }
            } catch (error) {
                console.warn('ProtectedRoute: Background verification failed, but keeping user logged in:', error)
                // Don't log out on network errors - keep user logged in
            }
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
    const [dashboardData, setDashboardData] = useState(() => {
        // Try to load persisted dashboard data
        try {
            const saved = localStorage.getItem('dashboardData')
            return saved ? JSON.parse(saved) : null
        } catch (error) {
            console.warn('Failed to load persisted dashboard data:', error)
            return null
        }
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const navigate = useNavigate()

    // Mobile detection state
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024)

    const [showProfile, setShowProfile] = useState(false)
    const [emailProcessingStatus, setEmailProcessingStatus] = useState(null)
    const [controlsPanelKey, setControlsPanelKey] = useState(0)
    const [refreshing, setRefreshing] = useState(false)
    const [autoLoadAttempted, setAutoLoadAttempted] = useState(() => {
        // Check if auto-load was already attempted in this session
        return localStorage.getItem('autoLoadAttempted') === 'true'
    })

    // Handle window resize for mobile detection
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 1024)
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    // Function to update dashboard data with persistence
    const updateDashboardData = (data, isManual = false) => {
        setDashboardData(data)

        if (data) {
            // Mark the data as manually fetched if it's from user action
            const dataToSave = { ...data, isManuallyFetched: isManual }
            localStorage.setItem('dashboardData', JSON.stringify(dataToSave))
            console.log(isManual ? '💾 Persisted manual dashboard data' : '💾 Persisted auto-loaded dashboard data')
        } else {
            localStorage.removeItem('dashboardData')
            console.log('🗑️ Cleared persisted dashboard data')
        }
    }

    // Fetch fresh restaurant data on component mount (no cache)
    useEffect(() => {
        const fetchFreshRestaurants = async () => {
            try {
                console.log('Dashboard: Fetching fresh user restaurants from API...')

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

    // Auto-load last month data for existing users (not new signups)
    useEffect(() => {
        const attemptAutoLoad = async () => {
            // Don't auto-load if we have persisted manual data
            if (dashboardData?.isManuallyFetched) {
                console.log('📋 Found persisted manual data, skipping auto-load')
                setAutoLoadAttempted(true)
                localStorage.setItem('autoLoadAttempted', 'true')
                return
            }

            // Only try once and only if we have restaurants and haven't attempted yet
            if (autoLoadAttempted || !userRestaurants?.restaurantIds || userRestaurants.restaurantIds.length === 0) {
                return
            }

            // Check if this is from a new signup by looking for auto email processing
            const userEmail = user?.businessEmail || user?.email
            const isNewUser = userEmail && autoEmailProcessingService.isProcessing(userEmail)

            // Only auto-load for existing users (not during signup)
            if (autoLoadService.shouldAutoLoad(userRestaurants, isNewUser)) {
                console.log('🔄 Attempting to auto-load last month data...')
                setAutoLoadAttempted(true)
                localStorage.setItem('autoLoadAttempted', 'true') // Persist across page reloads
                setLoading(true)

                try {
                    const userEmail = user?.businessEmail || user?.email
                    const autoLoadedData = await autoLoadService.loadLastMonthData(userRestaurants)

                    if (autoLoadedData) {
                        console.log('✅ Auto-loaded dashboard data:', autoLoadedData)
                        updateDashboardData(autoLoadedData, false) // Auto-loaded data, not manual
                    } else {
                        console.log('📭 No data available for auto-load')
                    }
                } catch (error) {
                    console.error('❌ Auto-load failed:', error)
                    // Don't show error for auto-load failure
                } finally {
                    setLoading(false)
                }
            } else {
                setAutoLoadAttempted(true) // Mark as attempted even if skipped
                localStorage.setItem('autoLoadAttempted', 'true') // Persist across page reloads
            }
        }

        attemptAutoLoad()
    }, [userRestaurants, autoLoadAttempted, user])

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
        localStorage.removeItem('autoLoadAttempted') // Clear auto-load flag for next login
        localStorage.removeItem('dashboardData') // Clear persisted dashboard data
        localStorage.removeItem('previousRoute') // Clear navigation history
        setUser(null)
        setDashboardData(null)
        setError(null)
        navigate('/')
    }

    const handleProfileClick = () => {
        // Store current route as previous route for back navigation
        localStorage.setItem('previousRoute', '/dashboard')
        navigate('/profile')
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
        const { restaurants, channels, startDate, endDate, groupBy, thresholds, restaurantInfo } = selections

        setLoading(true)
        setError(null)
        setDashboardData(null)

        try {
            // Use the restaurant IDs directly from the API response
            // Each restaurant ID can be used directly for the API call
            const restaurantDetails = []

            restaurants.forEach(restaurantId => {
                // Get display name from restaurant info passed from ReportControls
                // This contains the actual restaurant names from the ProfilePage mappings
                let restaurantName = restaurantId // Default fallback

                // Try to find restaurant info for this ID
                if (restaurantInfo) {
                    // First, check if this restaurant ID was directly selected (for direct platform IDs)
                    if (restaurantInfo[restaurantId] && restaurantInfo[restaurantId].name) {
                        restaurantName = restaurantInfo[restaurantId].name
                    } else {
                        // Check if this platform ID belongs to any restaurant group
                        const restaurantInfoEntry = Object.values(restaurantInfo).find(info =>
                            info.platforms && Object.values(info.platforms).includes(restaurantId)
                        )
                        if (restaurantInfoEntry && restaurantInfoEntry.name) {
                            restaurantName = restaurantInfoEntry.name
                        }
                    }
                }

                restaurantDetails.push({
                    id: restaurantId,
                    name: restaurantName,
                    platform: 'auto', // Platform will be determined by the backend
                    key: restaurantId
                })
            })

            if (restaurantDetails.length === 0) {
                throw new Error('No restaurants selected.')
            }

            // Fetch data for all restaurant IDs with error handling
            const apiGroupBy = groupBy === 'total' ? null : groupBy
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

            updateDashboardData({
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
            }, true) // Mark as manually fetched

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
            {isMobile ? (
                // Mobile Navigation
                <MobileNavigation
                    user={user}
                    onProfileClick={handleProfileClick}
                    onHomeClick={() => navigate('/')}
                    onLogout={handleLogout}
                >
                    {/* Email Processing Status in Mobile */}
                    {emailProcessingStatus?.isProcessing && (
                        <div style={{
                            padding: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
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

                    {/* Refresh Button in Mobile */}
                    <div style={{ padding: '0 1rem 1rem' }}>
                        <button onClick={handleRefreshControlsPanel} disabled={refreshing} style={{
                            width: '100%',
                            backgroundColor: '#f8f9fa',
                            color: '#333',
                            border: '1px solid #ddd',
                            padding: '12px 16px',
                            borderRadius: '6px',
                            cursor: refreshing ? 'not-allowed' : 'pointer',
                            opacity: refreshing ? 0.7 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                        }}>
                            <span style={{
                                display: 'inline-block',
                                animation: refreshing ? 'spin 1s linear infinite' : 'none'
                            }}>↻</span>
                            {refreshing ? 'Refreshing...' : 'Refresh Controls'}
                        </button>
                    </div>
                </MobileNavigation>
            ) : (
                // Desktop Navigation
                <header className="top-navbar">
                    <div className="brand">Sales Insights</div>
                    <div className="nav-actions">
                        <div className="user-name">{user?.restaurantName}</div>

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
                            }}>↻</span>
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                        <button
                            className="home-button"
                            onClick={() => navigate('/')}
                            style={{
                                marginRight: '10px',
                                backgroundColor: '#f8f9fa',
                                color: '#333',
                                border: '1px solid #ddd',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            Home
                        </button>
                        <button className="profile-toggle" onClick={handleProfileClick}>
                            Profile
                        </button>
                    </div>
                </header>
            )}

            {showProfile && (
                <div className="profile-container">
                    <Profile user={user} onLogout={handleLogout} />
                </div>
            )}

            <div className="main-layout">
                <div className="controls-column">
                    {isMobile ? (
                        <CollapsibleControlsPanel
                            title="Report Controls"
                            defaultExpanded={false}
                        >
                            <ControlsPanel
                                key={controlsPanelKey}
                                onGetReport={handleGetReport}
                                loading={loading}
                                userRestaurants={userRestaurants}
                            />
                        </CollapsibleControlsPanel>
                    ) : (
                        <ControlsPanel
                            key={controlsPanelKey}
                            onGetReport={handleGetReport}
                            loading={loading}
                            userRestaurants={userRestaurants}
                        />
                    )}
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
                                user={user}
                            />
                        </>
                    )}
                    {!dashboardData && !loading && !error && (
                        <div className="card">
                            <h1 className="dashboard-title">Sales Insights Dashboard</h1>
                            <p style={{ textAlign: 'center', color: 'var(--primary-gray)', fontSize: '1.1rem' }}>
                                Select your parameters from the controls panel to generate insights
                            </p>
                            {userRestaurants?.restaurantIds?.length > 0 && autoLoadAttempted && (
                                <div style={{
                                    marginTop: '1rem',
                                    padding: '1rem',
                                    backgroundColor: '#f8f9fa',
                                    borderRadius: '8px',
                                    textAlign: 'center'
                                }}>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                                        💡 <strong>Tip:</strong> We tried to load your last month's data automatically, but it may not be available yet.
                                        Use the controls panel to select specific restaurants and date ranges for your reports.
                                    </p>
                                </div>
                            )}
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
        console.log('✅ Existing user login successful, calling onAuthSuccess and navigating to dashboard')
        console.log('👤 User data being passed:', userData)

        // Small delay to ensure localStorage is fully updated before navigation
        setTimeout(() => {
            navigate('/dashboard')
        }, 100)
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
        navigate('/signup')
    }

    const handleLogin = () => {
        navigate('/login')
    }

    return <LandingPage onGetStarted={handleGetStarted} onLogin={handleLogin} />
}

// Profile Page Component with Navigation
const ProfilePageWithNavigation = () => {
    const navigate = useNavigate()
    const user = authService.getCurrentUser()

    const handleLogout = () => {
        authService.logout()
        localStorage.removeItem('autoLoadAttempted') // Clear auto-load flag for next login
        localStorage.removeItem('dashboardData') // Clear persisted dashboard data
        localStorage.removeItem('previousRoute') // Clear navigation history
        navigate('/')
    }

    const handleBack = () => {
        // Check where the user came from
        const previousRoute = localStorage.getItem('previousRoute')

        if (previousRoute === '/') {
            // User came from landing page
            navigate('/')
        } else if (previousRoute === '/dashboard') {
            // User came from dashboard
            navigate('/dashboard')
        } else {
            // Default to dashboard if no previous route or direct access
            navigate('/dashboard')
        }

        // Clear the previous route after navigation
        localStorage.removeItem('previousRoute')
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
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    )
}

export default App