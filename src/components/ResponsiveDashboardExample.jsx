import React from 'react'
import MobileDashboardWrapper from './MobileDashboardWrapper.jsx'
import ControlsPanel from './Controls/ControlsPanel.jsx'
import Dashboard from './Dashboard/Dashboard.jsx'

// Example usage of the mobile-responsive dashboard wrapper
const ResponsiveDashboardExample = ({
    user,
    dashboardData,
    userRestaurants,
    onGetReport,
    loading,
    onLogout,
    onNavigateHome,
    onNavigateProfile
}) => {
    // Controls content
    const controlsContent = (
        <ControlsPanel
            onGetReport={onGetReport}
            loading={loading}
            userRestaurants={userRestaurants}
        />
    )

    // Dashboard content
    const dashboardContent = dashboardData ? (
        <Dashboard data={dashboardData} user={user} />
    ) : (
        <div className="card">
            <h1 className="dashboard-title">Sales Insights Dashboard</h1>
            <p style={{ textAlign: 'center', color: 'var(--primary-gray)', fontSize: '1.1rem' }}>
                Select your parameters from the controls panel to generate insights
            </p>
        </div>
    )

    // Additional mobile actions (refresh button, etc.)
    const additionalActions = (
        <div className="mobile-nav-extra">
            <button
                className="mobile-nav-button"
                onClick={() => window.location.reload()}
            >
                <span className="nav-icon">🔄</span>
                Refresh
            </button>
        </div>
    )

    return (
        <MobileDashboardWrapper
            user={user}
            onLogout={onLogout}
            onHomeClick={onNavigateHome}
            onProfileClick={onNavigateProfile}
            controlsContent={controlsContent}
            dashboardContent={dashboardContent}
            additionalActions={additionalActions}
        />
    )
}

export default ResponsiveDashboardExample