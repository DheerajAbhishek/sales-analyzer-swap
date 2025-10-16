import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import ControlsPanel from './components/Controls/ControlsPanel.jsx'
import Dashboard from './components/Dashboard/Dashboard.jsx'
import AuthPage from './components/Auth/AuthPage.jsx'
import OAuthCallback from './components/Auth/OAuthCallback.jsx'
import LandingPage from './components/LandingPage.jsx'
import Profile from './components/Profile.jsx'
import ProfilePage from './components/ProfilePage.jsx'
import { reportService } from './services/api'
import { authService } from './services/authService'
import { restaurantMetadataService } from './services/restaurantMetadataService'

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

    // Log user restaurants on component mount for debugging
    useEffect(() => {
        console.log('Dashboard: User restaurants loaded:', userRestaurants)
    }, [userRestaurants])

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

            // Fetch data for all restaurant IDs
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
        <>
            <header className="top-navbar">
                <div className="brand">Sales Insights</div>
                <div className="nav-actions">
                    <div className="welcome">Welcome, {user?.restaurantName}</div>
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

            <div className="main-layout">
                <div className="controls-column">
                    <ControlsPanel
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