import React from 'react'

const LandingPage = ({ onGetStarted }) => {
    return (
        <div className="landing-page">
            <nav className="landing-nav">
                <div className="nav-container">
                    <div className="nav-logo">
                        <img src="/restalyticsLogo.png" alt="Restalytics" className="logo" />
                    </div>
                    <div className="nav-actions">
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
                                Powerful sales insights, real-time reporting, and data-driven decisions
                                for your restaurant business. Track performance across all channels
                                and unlock growth opportunities.
                            </p>
                            <div className="hero-actions">
                                <button
                                    className="hero-cta-primary"
                                    onClick={onGetStarted}
                                >
                                    Start Free Trial
                                </button>
                                <button className="hero-cta-secondary">
                                    Watch Demo
                                </button>
                            </div>
                            <div className="hero-stats">
                                <div className="stat">
                                    <span className="stat-number">500+</span>
                                    <span className="stat-label">Restaurants</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-number">₹10Cr+</span>
                                    <span className="stat-label">Revenue Tracked</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-number">24/7</span>
                                    <span className="stat-label">Real-time Updates</span>
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
                                            <span className="metric-label">Today's Sales</span>
                                        </div>
                                        <div className="metric">
                                            <span className="metric-value">+12%</span>
                                            <span className="metric-label">Growth</span>
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
                                <div className="feature-icon">📊</div>
                                <h3>Real-time Analytics</h3>
                                <p>Track sales, orders, and performance metrics in real-time across all your restaurant channels.</p>
                            </div>
                            <div className="feature-card">
                                <div className="feature-icon">💰</div>
                                <h3>Revenue Insights</h3>
                                <p>Understand your profit margins, identify best-selling items, and optimize your menu pricing.</p>
                            </div>
                            <div className="feature-card">
                                <div className="feature-icon">📱</div>
                                <h3>Multi-Channel Support</h3>
                                <p>Integrate with Zomato, Swiggy, dine-in POS systems, and more for complete visibility.</p>
                            </div>
                            <div className="feature-card">
                                <div className="feature-icon">📈</div>
                                <h3>Growth Tracking</h3>
                                <p>Monitor trends, compare performance periods, and identify opportunities for expansion.</p>
                            </div>
                            <div className="feature-card">
                                <div className="feature-icon">⚡</div>
                                <h3>Fast Setup</h3>
                                <p>Get started in minutes with our easy onboarding process and automated data syncing.</p>
                            </div>
                            <div className="feature-card">
                                <div className="feature-icon">🔒</div>
                                <h3>Secure & Reliable</h3>
                                <p>Enterprise-grade security with 99.9% uptime guarantee and automatic backups.</p>
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
                            className="cta-button"
                            onClick={onGetStarted}
                        >
                            Get Started Today
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