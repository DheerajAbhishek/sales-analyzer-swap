import React, { useState, useEffect } from 'react'
import { authService } from '../services/authService'

const LandingPage = ({ onGetStarted }) => {
    const [user, setUser] = useState(null)
    const [isCheckingAuth, setIsCheckingAuth] = useState(true)

    useEffect(() => {
        const checkAuthStatus = () => {
            // Synchronously check localStorage first - this is instant
            const currentUser = authService.getCurrentUser()
            const authMethod = authService.getAuthMethod()

            if (currentUser && authMethod) {
                // User exists in localStorage, show them immediately
                setUser(currentUser)
            }

            // Always stop loading immediately since we have local data
            setIsCheckingAuth(false)

            // Optional background verification (doesn't block UI)
            if (currentUser && authMethod) {
                setTimeout(async () => {
                    try {
                        let isValid = false

                        if (authMethod === 'google' || authMethod === 'dual') {
                            const result = await authService.verifyGoogleAuth()
                            isValid = result.success
                        } else if (authMethod === 'traditional' || authMethod === 'linked') {
                            const token = authService.getToken()
                            if (token) {
                                const result = await authService.verifyToken(token)
                                isValid = result.success
                            }
                        }

                        // Only update UI if authentication actually failed
                        if (!isValid) {
                            setUser(null)
                            authService.logout()
                        }
                    } catch (error) {
                        console.log('Background auth verification failed:', error)
                        // Keep user logged in unless there's a definitive failure
                    }
                }, 500) // Delay background check
            }
        }

        // Safety timeout to ensure loading never takes more than 2 seconds
        const timeoutId = setTimeout(() => {
            setIsCheckingAuth(false)
        }, 2000)

        checkAuthStatus()

        // Cleanup timeout
        return () => clearTimeout(timeoutId)
    }, [])

    const handleGoToDashboard = () => {
        window.location.href = '/dashboard'
    }

    const handleGoToProfile = () => {
        // Store current route as previous route for back navigation
        localStorage.setItem('previousRoute', '/')
        window.location.href = '/profile'
    }

    return (
        <div className="landing-page">
            <nav className="landing-nav">
                <div className="nav-container">
                    <div className="nav-logo">
                        <img src="/restalyticsLogo.png" alt="Restalytics" className="logo" />
                    </div>
                    <div className="nav-actions">
                        {isCheckingAuth ? (
                            <div className="auth-checking">
                                <span style={{
                                    color: '#666',
                                    fontSize: '14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    <span style={{
                                        width: '12px',
                                        height: '12px',
                                        border: '2px solid #f3f3f3',
                                        borderTop: '2px solid #666',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite'
                                    }}></span>
                                    Checking...
                                </span>
                            </div>
                        ) : user ? (
                            <div className="logged-in-nav">
                                <span className="welcome-text">Welcome back, {user.restaurantName || user.name}!</span>
                                <button
                                    className="nav-login-btn"
                                    onClick={handleGoToProfile}
                                >
                                    Profile
                                </button>
                                <button
                                    className="nav-signup-btn"
                                    onClick={handleGoToDashboard}
                                >
                                    Go to Dashboard →
                                </button>
                            </div>
                        ) : (
                            <>
                                <a
                                    className="nav-pricing-link"
                                    href="#pricing"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        document.querySelector('.pricing-section')?.scrollIntoView({ behavior: 'smooth' })
                                    }}
                                >
                                    Pricing
                                </a>
                                <button
                                    className="nav-login-btn"
                                    onClick={onGetStarted}
                                >
                                    Login
                                </button>
                                <button
                                    className="nav-signup-btn"
                                    onClick={onGetStarted}
                                >
                                    Get Started
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </nav>

            <main className="landing-main">
                <section className="hero-section">
                    <div className="hero-container">
                        <div className="hero-content">
                            <h1 className="hero-title">
                                Transform Your Restaurant
                                <span className="hero-highlight"> Analytics</span>
                            </h1>
                            <p className="hero-description">
                                Say goodbye to tedious Excel sheets and manual tracking. Get automated sales insights,
                                discount performance analysis, and ad campaign results delivered seamlessly.
                                No more hours spent on data entry - just actionable insights that help you
                                make smarter business decisions.
                            </p>
                            <div className="hero-actions">
                                {user ? (
                                    <button
                                        className="btn hero-cta-primary"
                                        onClick={handleGoToDashboard}
                                    >
                                        Go to Dashboard →
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className="btn hero-cta-primary"
                                            onClick={onGetStarted}
                                        >
                                            Start Free Trial
                                        </button>
                                        <button className="btn hero-cta-secondary">
                                            Watch Demo
                                        </button>
                                    </>
                                )}
                            </div>
                            <div className="hero-stats">
                                <div className="stat">
                                    <span className="stat-number">100+hrs</span>
                                    <span className="stat-label">Saved Per Month</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-number">95%</span>
                                    <span className="stat-label">Manual Work Cut</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-number">5min</span>
                                    <span className="stat-label">Setup</span>
                                </div>
                            </div>
                        </div>
                        <div className="hero-visual">
                            <div className="dashboard-preview">
                                <div className="preview-header">
                                    <div className="preview-dots">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                </div>
                                <div className="preview-content">
                                    <div className="preview-chart">
                                        <div className="chart-bars">
                                            <div className="bar" style={{ height: '60%' }}></div>
                                            <div className="bar" style={{ height: '80%' }}></div>
                                            <div className="bar" style={{ height: '45%' }}></div>
                                            <div className="bar" style={{ height: '90%' }}></div>
                                            <div className="bar" style={{ height: '70%' }}></div>
                                        </div>
                                    </div>
                                    <div className="preview-metrics">
                                        <div className="metric">
                                            <span className="metric-value">₹2.4L</span>
                                            <span className="metric-label">Gross Sales</span>
                                        </div>
                                        <div className="metric">
                                            <span className="metric-value">12%</span>
                                            <span className="metric-label">Discounts</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="features-section">
                    <div className="features-container">
                        <h2 className="features-title">Everything You Need to Grow</h2>
                        <div className="features-grid">
                            <div className="feature-card">
                                <div className="feature-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                                    </svg>
                                </div>
                                <h3>Automated Analytics</h3>
                                <p>Skip the Excel headaches! Get automated sales reports, trend analysis, and performance insights without manual data entry.</p>
                            </div>
                            <div className="feature-card">
                                <div className="feature-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                    </svg>
                                </div>
                                <h3>Discount & Ad Tracking</h3>
                                <p>Monitor the performance of your promotions, discounts, and advertising campaigns with detailed analytics.</p>
                            </div>
                            <div className="feature-card">
                                <div className="feature-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-5 7H9v5h3V9zm4 5h-3V9h3v5z"/>
                                    </svg>
                                </div>
                                <h3>Multi-Channel Integration</h3>
                                <p>Connect with Zomato, Swiggy, dine-in POS systems, and more for complete visibility across all channels.</p>
                            </div>
                            <div className="feature-card">
                                <div className="feature-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
                                    </svg>
                                </div>
                                <h3>Performance Insights</h3>
                                <p>Understand which strategies work best with clear metrics on revenue, customer behavior, and growth trends.</p>
                            </div>
                            <div className="feature-card">
                                <div className="feature-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
                                    </svg>
                                </div>
                                <h3>Automated Reporting</h3>
                                <p>Set up once and receive regular updates without manual work - focus on running your restaurant.</p>
                            </div>
                            <div className="feature-card">
                                <div className="feature-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                                    </svg>
                                </div>
                                <h3>Secure & Reliable</h3>
                                <p>Enterprise-grade security with 99.9% email delivery guarantee and automatic data backups.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="pricing-section">
                    <div className="pricing-container">
                        <h2 className="pricing-title">Choose Your Plan</h2>
                        <p className="pricing-description">
                            Select the perfect plan for your restaurant's needs
                        </p>
                        <div className="pricing-grid">
                            <div className="pricing-card">
                                <div className="pricing-header">
                                    <h3>Sales Analysis</h3>
                                    <div className="pricing-price">
                                        <span className="price-original">₹499</span>
                                        <span className="price-current">FREE</span>
                                        <span className="price-period">for now</span>
                                    </div>
                                </div>
                                <div className="pricing-features">
                                    <ul>
                                        <li>✅ Real-time sales analytics</li>
                                        <li>✅ Multi-channel reporting</li>
                                        <li>✅ Revenue insights</li>
                                        <li>✅ Performance tracking</li>
                                        <li>✅ Growth metrics</li>
                                        <li>✅ Email integration</li>
                                    </ul>
                                </div>
                                <button
                                    className="pricing-button pricing-button-primary"
                                    onClick={user ? handleGoToDashboard : onGetStarted}
                                >
                                    {user ? 'Access Dashboard' : 'Start Free'}
                                </button>
                            </div>

                            <div className="pricing-card pricing-card-popular">
                                <div className="pricing-badge">Coming Soon</div>
                                <div className="pricing-header">
                                    <h3>Inventory & Sales</h3>
                                    <div className="pricing-price">
                                        <span className="price-current">₹599</span>
                                        <span className="price-period">/month</span>
                                    </div>
                                </div>
                                <div className="pricing-features">
                                    <ul>
                                        <li>✅ Everything in Sales Analysis</li>
                                        <li>🔥 Inventory tracking</li>
                                        <li>🔥 Cost management</li>
                                        <li>🔥 Stock alerts</li>
                                        <li>🔥 Supplier management</li>
                                        <li>🔥 Food cost analysis</li>
                                    </ul>
                                </div>
                                <button className="pricing-button pricing-button-disabled" disabled>
                                    Coming Soon
                                </button>
                            </div>

                            <div className="pricing-card">
                                <div className="pricing-badge">Coming Soon</div>
                                <div className="pricing-header">
                                    <h3>Complete Business Suite</h3>
                                    <div className="pricing-price">
                                        <span className="price-current">₹699</span>
                                        <span className="price-period">/month</span>
                                    </div>
                                </div>
                                <div className="pricing-features">
                                    <ul>
                                        <li>✅ Everything in Inventory & Sales</li>
                                        <li>🚀 Smart GST filing</li>
                                        <li>🚀 Tax compliance</li>
                                        <li>🚀 Financial reporting</li>
                                        <li>🚀 Automated invoicing</li>
                                        <li>🚀 Priority support</li>
                                    </ul>
                                </div>
                                <button className="pricing-button pricing-button-disabled" disabled>
                                    Coming Soon
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="cta-section">
                    <div className="cta-container">
                        <h2 className="cta-title">Ready to Transform Your Restaurant Analytics?</h2>
                        <p className="cta-description">
                            Join hundreds of restaurants already using Restalytics to make data-driven decisions.
                        </p>
                        <button
                            className="btn cta-button"
                            onClick={user ? handleGoToDashboard : onGetStarted}
                        >
                            {user ? 'Go to Dashboard →' : 'Get Started Today'}
                        </button>
                    </div>
                </section>
            </main>

            <footer className="landing-footer">
                <div className="footer-container">
                    <div className="footer-logo">
                        <img src="/restalyticsLogo.png" alt="Restalytics" className="footer-logo-img" />
                    </div>
                    <div className="footer-content">
                        <p>&copy; 2025 Restalytics. All rights reserved.</p>
                        <div className="footer-links">
                            <a href="#privacy">Privacy Policy</a>
                            <a href="#terms">Terms of Service</a>
                            <a href="#contact">Contact</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}

export default LandingPage