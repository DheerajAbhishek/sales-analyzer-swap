import React, { useState, useEffect, useRef } from "react";
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate,
    useNavigate,
} from "react-router-dom";
import ControlsPanel from "./components/Controls/ControlsPanel.jsx";
import Dashboard from "./components/Dashboard/Dashboard.jsx";
import AuthPage from "./components/Auth/AuthPage.jsx";
import OAuthCallback from "./components/Auth/OAuthCallback.jsx";
import LandingPage from "./components/LandingPage.jsx";
import Profile from "./components/Profile.jsx";
import ProfilePage from "./components/ProfilePage.jsx";
import PrivacyPolicy from "./components/Legal/PrivacyPolicy.jsx";
import TermsOfService from "./components/Legal/TermsOfService.jsx";
import MobileNavigation from "./components/MobileNavigation.jsx";
import CollapsibleControlsPanel from "./components/CollapsibleControlsPanel.jsx";
import { reportService, restaurantService, ristaService } from "./services/api";
import { authService } from "./services/authService";
import { restaurantMetadataService } from "./services/restaurantMetadataService";
import { autoEmailProcessingService } from "./services/autoEmailProcessingService";
import { autoLoadService } from "./services/autoLoadService";

// Protected Route Component
const ProtectedRoute = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [userRestaurants, setUserRestaurants] = useState(null);
    const [sessionExpired, setSessionExpired] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            // First, do a quick check from localStorage to avoid unnecessary API calls
            const currentUser = authService.getCurrentUser();
            const authMethod = authService.getAuthMethod();

            if (!currentUser) {

                setIsCheckingAuth(false);
                return;
            }

            // User exists in localStorage, set them immediately for better UX
            setUser(currentUser);
            const cachedRestaurants = authService.getUserRestaurants();
            setUserRestaurants(cachedRestaurants);
            setIsCheckingAuth(false); // Stop loading immediately

            // Perform background verification (don't block UI)

            try {
                const hasGoogleData = currentUser.picture || currentUser.sub; // 'sub' is Google's unique user ID
                const isGoogleUser =
                    authMethod === "google" || authMethod === "linked" || hasGoogleData;
                authMethod === "google" || authMethod === "linked" || hasGoogleData;

                if (isGoogleUser) {
                    // For Google OAuth users, we mainly rely on localStorage
                    // These users don't have traditional auth tokens

                } else if (authMethod === "traditional") {
                    // For traditional auth, verify the token in background
                    const token = authService.getToken();
                    if (token) {
                        const result = await authService.verifyToken(token);
                        if (!result.success) {

                            // Show session expired notification instead of immediate logout
                            setSessionExpired(true);
                            // Delay logout to allow user to see the notification
                            setTimeout(() => {
                                authService.logout();
                                setUser(null);
                                setUserRestaurants(null);
                            }, 3000); // 3 second delay to show notification
                        } else {
                            // Update with fresh data if verification succeeds
                            setUser(result.user);
                            setUserRestaurants(result.restaurants);
                        }
                    } else {

                        // Show session expired notification instead of immediate logout
                        setSessionExpired(true);
                        // Delay logout to allow user to see the notification
                        setTimeout(() => {
                            authService.logout();
                            setUser(null);
                            setUserRestaurants(null);
                        }, 3000); // 3 second delay to show notification
                    }
                } else {
                    // Unknown auth method, but user exists in localStorage

                }
            } catch (error) {
                console.warn(
                    "ProtectedRoute: Background verification failed, but keeping user logged in:",
                    error,
                );
                // Don't log out on network errors - keep user logged in
            }
        };

        checkAuth();
    }, []);

    if (isCheckingAuth) {
        return (
            <div className="auth-loading">
                <div className="loading-spinner"></div>
                <p>Loading...</p>
            </div>
        );
    }

    // Show session expired notification
    if (sessionExpired) {
        return (
            <div className="auth-loading">
                <div className="session-expired-notification">
                    <div className="notification-icon">ΓÜá∩╕Å</div>
                    <h2>Session Expired</h2>
                    <p>Your session has expired. Please log in again.</p>
                    <div className="loading-spinner"></div>
                    <p style={{ fontSize: "0.9em", marginTop: "10px" }}>
                        Redirecting to login...
                    </p>
                </div>
            </div>
        );
    }

    return user ? children : <Navigate to="/login" replace />;
};

// Dashboard Component with Authentication
const DashboardPage = () => {
    const [user, setUser] = useState(authService.getCurrentUser());
    const [userRestaurants, setUserRestaurants] = useState(
        authService.getUserRestaurants(),
    );
    const [dashboardData, setDashboardData] = useState(() => {
        // Try to load persisted dashboard data
        try {
            const saved = localStorage.getItem("dashboardData");
            return saved ? JSON.parse(saved) : null;
        } catch (error) {
            console.warn("Failed to load persisted dashboard data:", error);
            return null;
        }
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    // Mobile detection state
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);

    const [showProfile, setShowProfile] = useState(false);
    const [emailProcessingStatus, setEmailProcessingStatus] = useState(null);
    const [controlsPanelKey, setControlsPanelKey] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [autoLoadAttempted, setAutoLoadAttempted] = useState(() => {
        // Check if auto-load was already attempted in this session
        return localStorage.getItem("autoLoadAttempted") === "true";
    });
    const [hasFetchedRestaurants, setHasFetchedRestaurants] = useState(false);

    // Ref to prevent concurrent auto-load attempts
    const autoLoadInProgress = useRef(false);

    // Handle window resize for mobile detection
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 1024);
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Function to update dashboard data with persistence
    const updateDashboardData = (data, isManual = false) => {
        setDashboardData(data);

        if (data) {
            // Mark the data as manually fetched if it's from user action
            const dataToSave = { ...data, isManuallyFetched: isManual };
            localStorage.setItem("dashboardData", JSON.stringify(dataToSave));

        } else {
            localStorage.removeItem("dashboardData");

        }
    };

    // Fetch fresh restaurant data on component mount (no cache)
    useEffect(() => {
        // Early return if we've already fetched restaurants
        if (hasFetchedRestaurants) {
            return;
        }

        const fetchFreshRestaurants = async () => {
            try {

                // Get email from user state or localStorage
                const email = user?.businessEmail || user?.email;
                if (!email) {
                    console.warn("Dashboard: No email found, using cached data");
                    const cachedData = authService.getUserRestaurants();
                    setUserRestaurants(cachedData);
                    setHasFetchedRestaurants(true);
                    return;
                }

                const freshData = await restaurantService.getUserRestaurants(email);

                setUserRestaurants(freshData);
                // Update localStorage
                localStorage.setItem("userRestaurants", JSON.stringify(freshData));
                setHasFetchedRestaurants(true);
            } catch (error) {
                console.error("Dashboard: Failed to fetch fresh restaurants:", error);
                // Fallback to localStorage if API fails
                const cachedData = authService.getUserRestaurants();
                setUserRestaurants(cachedData);
                setHasFetchedRestaurants(true);
            }
        };

        fetchFreshRestaurants();
    }, [user?.businessEmail, user?.email, hasFetchedRestaurants]);

    // Auto-load last month data for existing users (not new signups)
    useEffect(() => {
        const attemptAutoLoad = async () => {
            // Prevent concurrent auto-load attempts
            if (autoLoadInProgress.current) {

                return;
            }

            // Don't auto-load if we have persisted manual data
            if (dashboardData?.isManuallyFetched) {

                setAutoLoadAttempted(true);
                localStorage.setItem("autoLoadAttempted", "true");
                return;
            }

            // Only try once and only if we have restaurants and haven't attempted yet
            if (
                autoLoadAttempted ||
                !userRestaurants?.restaurantIds ||
                userRestaurants.restaurantIds.length === 0
            ) {
                return;
            }

            // Check if this is from a new signup by looking for auto email processing
            const userEmail = user?.businessEmail || user?.email;
            const isNewUser =
                userEmail && autoEmailProcessingService.isProcessing(userEmail);

            // Only auto-load for existing users (not during signup)
            if (autoLoadService.shouldAutoLoad(userRestaurants, isNewUser)) {

                // Mark as in progress before starting
                autoLoadInProgress.current = true;
                setAutoLoadAttempted(true);
                localStorage.setItem("autoLoadAttempted", "true"); // Persist across page reloads
                setLoading(true);

                try {
                    const userEmail = user?.businessEmail || user?.email;
                    const autoLoadedData =
                        await autoLoadService.loadLastMonthData(userRestaurants);

                    if (autoLoadedData) {

                        updateDashboardData(autoLoadedData, false); // Auto-loaded data, not manual
                    } else {

                    }
                } catch (error) {
                    console.error("Γ¥î Auto-load failed:", error);
                    // Don't show error for auto-load failure
                } finally {
                    setLoading(false);
                    autoLoadInProgress.current = false;
                }
            } else {
                setAutoLoadAttempted(true); // Mark as attempted even if skipped
                localStorage.setItem("autoLoadAttempted", "true"); // Persist across page reloads
            }
        };

        attemptAutoLoad();
    }, [userRestaurants, autoLoadAttempted, user]);

    // Log user restaurants on component mount for debugging
    useEffect(() => {

    }, [userRestaurants]);

    // Listen for auto email processing updates
    useEffect(() => {
        // Check for existing processing status on mount
        if (user?.businessEmail || user?.email) {
            const userEmail = user.businessEmail || user.email;
            const existingStatus = autoEmailProcessingService.getStatus(userEmail);

            if (existingStatus.isProcessing) {

                setEmailProcessingStatus(existingStatus);
            }
        }

        const handleProcessingUpdate = (event) => {
            const { userEmail, status } = event.detail;

            if (userEmail === user?.businessEmail || userEmail === user?.email) {

                // Only set processing status if it's actually processing (from signup)
                // Don't restore old completed status on page refresh
                if (status.isProcessing) {
                    setEmailProcessingStatus(status);
                } else if (emailProcessingStatus?.isProcessing) {
                    // Only update to completed if we were previously processing
                    setEmailProcessingStatus(status);
                }
            } else {

            }
        };

        window.addEventListener(
            "autoEmailProcessingUpdate",
            handleProcessingUpdate,
        );

        return () => {
            window.removeEventListener(
                "autoEmailProcessingUpdate",
                handleProcessingUpdate,
            );
        };
    }, [user, emailProcessingStatus?.isProcessing]);

    // 1-Minute Timer for Progress Bar (only during active signup processing)
    useEffect(() => {
        // Only start timer if processing AND this is a fresh processing session
        if (!emailProcessingStatus?.isProcessing) return;

        // Check if this is from a page reload (if completedAt already exists, don't start timer)
        if (emailProcessingStatus.completedAt) return;

        const startTime = Date.now();
        const duration = 60000; // 1 minute in milliseconds

        const timer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            setEmailProcessingStatus((prev) => {
                // Don't update if processing is no longer active
                if (!prev?.isProcessing) {
                    clearInterval(timer);
                    return prev;
                }

                return {
                    ...prev,
                    progress,
                };
            });

            // Stop timer when 1 minute is complete
            if (progress >= 1) {
                clearInterval(timer);
                // Mark processing as complete after 1 minute
                setEmailProcessingStatus((prev) => ({
                    ...prev,
                    isProcessing: false,
                    completedAt: new Date().toISOString(),
                    progress: 1,
                }));
            }
        }, 100); // Update every 100ms for smooth animation

        return () => {

            clearInterval(timer);
        };
    }, [emailProcessingStatus?.isProcessing, emailProcessingStatus?.completedAt]);

    // Listen for restaurant updates after file uploads
    useEffect(() => {
        const handleRestaurantUpdate = (event) => {

            setUserRestaurants(event.detail);
        };

        window.addEventListener("userRestaurantsUpdated", handleRestaurantUpdate);

        return () => {
            window.removeEventListener(
                "userRestaurantsUpdated",
                handleRestaurantUpdate,
            );
        };
    }, []);

    const handleLogout = () => {
        authService.logout();
        localStorage.removeItem("autoLoadAttempted"); // Clear auto-load flag for next login
        localStorage.removeItem("dashboardData"); // Clear persisted dashboard data
        localStorage.removeItem("previousRoute"); // Clear navigation history
        setUser(null);
        setDashboardData(null);
        setError(null);
        navigate("/");
    };

    const handleProfileClick = () => {
        // Store current route as previous route for back navigation
        localStorage.setItem("previousRoute", "/dashboard");
        navigate("/profile");
    };

    const handleRefreshControlsPanel = async () => {

        setRefreshing(true);

        try {
            // Fetch fresh restaurant data
            const email = user?.businessEmail || user?.email;
            if (!email) {
                console.warn("No email found for refresh");
                setRefreshing(false);
                return;
            }

            const freshData = await restaurantService.getUserRestaurants(email);

            // Update state and localStorage
            setUserRestaurants(freshData);
            localStorage.setItem("userRestaurants", JSON.stringify(freshData));

            // Force Controls Panel to remount with new data
            setControlsPanelKey((prev) => prev + 1);
        } catch (error) {
            console.error("Γ¥î Error refreshing restaurants:", error);
            // Don't show error on dashboard - just log it
            // User will notice nothing changed in the dropdown
        } finally {
            setRefreshing(false);
        }
    };

    const handleGetReport = async (selections) => {
        const {
            restaurants,
            channels,
            startDate,
            endDate,
            groupBy,
            thresholds,
            restaurantInfo,
            ristaMappings,
            ristaChannels,
            hasRistaData,
        } = selections;

        setLoading(true);
        setError(null);
        setDashboardData(null);

        try {
            // Use the restaurant IDs directly from the API response
            // Each restaurant ID can be used directly for the API call
            const restaurantDetails = [];

            restaurants.forEach((restaurantId) => {
                // Get display name from restaurant info passed from ReportControls
                // This contains the actual restaurant names from the ProfilePage mappings
                let restaurantName = restaurantId; // Default fallback

                // Try to find restaurant info for this ID
                if (restaurantInfo) {
                    // First, check if this restaurant ID was directly selected (for direct platform IDs)
                    if (
                        restaurantInfo[restaurantId] &&
                        restaurantInfo[restaurantId].name
                    ) {
                        restaurantName = restaurantInfo[restaurantId].name;
                    } else {
                        // Check if this platform ID belongs to any restaurant group
                        const restaurantInfoEntry = Object.values(restaurantInfo).find(
                            (info) =>
                                info.platforms &&
                                Object.values(info.platforms).includes(restaurantId),
                        );
                        if (restaurantInfoEntry && restaurantInfoEntry.name) {
                            restaurantName = restaurantInfoEntry.name;
                        }
                    }
                }

                restaurantDetails.push({
                    id: restaurantId,
                    name: restaurantName,
                    platform: "auto", // Platform will be determined by the backend
                    key: restaurantId,
                });
            });

            let parsedResults = [];
            let successfulDetails = [];
            let failedResults = [];

            // Fetch regular platform data (if any restaurants selected for regular channels)
            if (restaurantDetails.length > 0) {
                // Fetch data for all restaurant IDs with error handling
                const apiGroupBy = groupBy === "total" ? null : groupBy;
                const fetchPromises = restaurantDetails.map(async (detail) => {
                    try {
                        const result = await reportService.getConsolidatedInsights(
                            detail.id,
                            startDate,
                            endDate,
                            apiGroupBy,
                        );
                        return {
                            success: true,
                            data: result,
                            detail: detail,
                        };
                    } catch (error) {
                        // Return failed request info instead of throwing
                        return {
                            success: false,
                            error: error.message,
                            detail: detail,
                        };
                    }
                });

                const results = await Promise.all(fetchPromises);

                // Filter successful results
                const successfulResultsArr = results.filter((result) => result.success);
                failedResults = results.filter((result) => !result.success);

                // Parse successful results
                parsedResults = successfulResultsArr.map((result) => {
                    const res = result.data;
                    if (typeof res.body === "string") return JSON.parse(res.body);
                    return res;
                });

                // Get successful details
                successfulDetails = successfulResultsArr.map(
                    (result) => result.detail,
                );

                // Show notification about failed restaurants if any
                if (failedResults.length > 0) {
                    const failedRestaurants = failedResults.map(
                        (result) => result.detail.name,
                    );
                    console.info(`Data not available for: ${failedRestaurants.join(", ")}`);
                }
            }

            // Fetch Rista data if Rista channels are selected
            let ristaResults = [];
            if (hasRistaData && ristaMappings && ristaMappings.length > 0 && ristaChannels && ristaChannels.length > 0) {
                try {
                    // Get credentials
                    const credResult = await ristaService.getCredentials();
                    if (credResult.success && credResult.hasCredentials) {
                        // Get branch IDs that have any of the selected channels
                        const branchIds = ristaMappings
                            .filter(m => m.selectedChannels && m.selectedChannels.some(ch => ristaChannels.includes(ch)))
                            .map(m => m.branchCode);

                        if (branchIds.length > 0) {
                            const ristaSalesResult = await ristaService.fetchSales(
                                credResult.apiKey,
                                credResult.apiSecret,
                                branchIds,
                                ristaChannels,
                                startDate,
                                endDate
                            );

                            // Response now matches consolidated-insights format
                            if (ristaSalesResult.success && ristaSalesResult.data) {
                                const ristaData = ristaSalesResult.data;

                                // Add to parsed results - format matches consolidated-insights
                                parsedResults.push(ristaData);

                                // Get restaurant name from mappings
                                const mapping = ristaMappings.find(m => branchIds.includes(m.branchCode));
                                const restaurantName = mapping?.restaurantGroupName || mapping?.branchName || `Rista: ${ristaChannels.join(", ")}`;

                                // Add Rista detail
                                successfulDetails.push({
                                    id: ristaData.restaurantId || `rista_${branchIds.join("_")}`,
                                    name: restaurantName,
                                    platform: 'rista',
                                    key: `rista_${branchIds.join("_")}`,
                                });

                                ristaResults = [ristaData];
                            }
                        }
                    }
                } catch (ristaError) {
                    console.error("Error fetching Rista data:", ristaError);
                    // Continue with regular data even if Rista fails
                }
            }

            if (parsedResults.length === 0) {
                throw new Error("No data available for any selected restaurants or channels");
            }

            updateDashboardData(
                {
                    results: parsedResults,
                    details: successfulDetails,
                    selections,
                    groupBy,
                    thresholds,
                    // Include info about what was excluded
                    excludedChannels: failedResults.map((result) => ({
                        name: result.detail.name,
                        platform: result.detail.platform,
                        reason: result.error,
                    })),
                    ristaResults: ristaResults,
                },
                true,
            ); // Mark as manually fetched
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshRestaurants = async () => {
        try {
            setLoading(true);

            const freshData = await restaurantService.refreshUserRestaurants();

            setUserRestaurants(freshData);
            // Update localStorage
            localStorage.setItem("userRestaurants", JSON.stringify(freshData));
        } catch (error) {
            console.error("Error refreshing restaurants:", error);
            setError("Failed to refresh restaurants. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {isMobile ? (
                // Mobile Navigation
                <MobileNavigation
                    user={user}
                    onProfileClick={handleProfileClick}
                    onHomeClick={() => navigate("/")}
                    onLogout={handleLogout}
                >
                    {/* Refresh Button in Mobile */}
                    <div style={{ padding: "0 1rem 1rem" }}>
                        <button
                            onClick={handleRefreshControlsPanel}
                            disabled={refreshing}
                            style={{
                                width: "100%",
                                backgroundColor: "#f8f9fa",
                                color: "#333",
                                border: "1px solid #ddd",
                                padding: "12px 16px",
                                borderRadius: "6px",
                                cursor: refreshing ? "not-allowed" : "pointer",
                                opacity: refreshing ? 0.7 : 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "6px",
                            }}
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                style={{
                                    animation: refreshing ? "spin 1s linear infinite" : "none",
                                }}
                            >
                                <path
                                    d="M14 8A6 6 0 1 1 8 2v2a4 4 0 1 0 4 4h2z"
                                    fill="currentColor"
                                />
                                <path
                                    d="M8 0v4L6 2 8 0zM8 0l2 2-2 2V0z"
                                    fill="currentColor"
                                />
                            </svg>
                            {refreshing ? "Refreshing..." : "Refresh Controls"}
                        </button>
                    </div>
                </MobileNavigation>
            ) : (
                // Desktop Navigation
                <header className="top-navbar">
                    <div className="brand">Sales Insights</div>
                    <div className="nav-actions">
                        <div className="user-name">{user?.restaurantName}</div>

                        <button
                            onClick={handleRefreshControlsPanel}
                            disabled={refreshing}
                            style={{
                                marginRight: "10px",
                                backgroundColor: "#f8f9fa",
                                color: "#333",
                                border: "1px solid #ddd",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                cursor: refreshing ? "not-allowed" : "pointer",
                                opacity: refreshing ? 0.7 : 1,
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                            }}
                            title="Refresh controls panel"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                style={{
                                    animation: refreshing ? "spin 1s linear infinite" : "none",
                                }}
                            >
                                <path
                                    d="M14 8A6 6 0 1 1 8 2v2a4 4 0 1 0 4 4h2z"
                                    fill="currentColor"
                                />
                                <path
                                    d="M8 0v4L6 2 8 0zM8 0l2 2-2 2V0z"
                                    fill="currentColor"
                                />
                            </svg>
                            {refreshing ? "Refreshing..." : "Refresh"}
                        </button>
                        <button
                            className="home-button"
                            onClick={() => navigate("/")}
                            style={{
                                marginRight: "10px",
                                backgroundColor: "#f8f9fa",
                                color: "#333",
                                border: "1px solid #ddd",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                cursor: "pointer",
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
                    {/* Centered Email Processing Progress Bar */}
                    {emailProcessingStatus?.isProcessing && (
                        <div
                            className="processing-overlay"
                            role="status"
                            aria-live="polite"
                            aria-busy="true"
                            aria-label="Email processing in progress"
                        >
                            <div className="processing-card">
                                <div className="processing-icon">
                                    <svg className="processing-spinner" viewBox="0 0 50 50">
                                        <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4">
                                            <title>Loading spinner</title>
                                        </circle>
                                    </svg>
                                </div>
                                <h3 className="processing-title">Processing Your Emails</h3>
                                <p className="processing-subtitle">
                                    This may take up to a minute
                                </p>
                                <div className="processing-progress-container">
                                    <div
                                        className="processing-progress-bar"
                                        style={{
                                            width: `${(emailProcessingStatus.progress || 0) * 100}%`,
                                        }}
                                        role="progressbar"
                                        aria-valuenow={Math.round(
                                            (emailProcessingStatus.progress || 0) * 100,
                                        )}
                                        aria-valuemin="0"
                                        aria-valuemax="100"
                                    ></div>
                                </div>
                                <div className="processing-percentage">
                                    {Math.round((emailProcessingStatus.progress || 0) * 100)}%
                                </div>
                                <button
                                    onClick={() => setEmailProcessingStatus(null)}
                                    style={{
                                        marginTop: "1rem",
                                        padding: "8px 16px",
                                        backgroundColor: "#f8f9fa",
                                        border: "1px solid #ddd",
                                        borderRadius: "6px",
                                        cursor: "pointer",
                                    }}
                                    aria-label="Dismiss processing notification"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="card">
                            <div className="status error">ERROR: {error}</div>
                        </div>
                    )}
                    {loading && (
                        <div className="card">
                            <div className="status loading">Fetching reports...</div>
                        </div>
                    )}
                    {dashboardData && !loading && (
                        <>
                            {dashboardData.excludedChannels &&
                                dashboardData.excludedChannels.length > 0 && (
                                    <div className="card" style={{ marginBottom: "1rem" }}>
                                        <div
                                            className="status warning"
                                            style={{
                                                backgroundColor: "#fef3c7",
                                                color: "#92400e",
                                                border: "1px solid #fbbf24",
                                                borderRadius: "6px",
                                                padding: "12px",
                                                fontSize: "14px",
                                            }}
                                        >
                                            ΓÜá∩╕Å <strong>Data not available for:</strong>{" "}
                                            {dashboardData.excludedChannels
                                                .map((ch) => `${ch.name} (${ch.platform})`)
                                                .join(", ")}
                                            <br />
                                            <small>
                                                Showing data only for available restaurants.
                                            </small>
                                        </div>
                                    </div>
                                )}
                            <Dashboard data={dashboardData} user={user} />
                        </>
                    )}
                    {!dashboardData && !loading && !error && (
                        <div className="card">
                            <h1 className="dashboard-title">Sales Insights Dashboard</h1>
                            <p
                                style={{
                                    textAlign: "center",
                                    color: "var(--primary-gray)",
                                    fontSize: "1.1rem",
                                }}
                            >
                                Select your parameters from the controls panel to generate
                                insights
                            </p>
                            {userRestaurants?.restaurantIds?.length > 0 &&
                                autoLoadAttempted && (
                                    <div
                                        style={{
                                            marginTop: "1rem",
                                            padding: "1rem",
                                            backgroundColor: "#f8f9fa",
                                            borderRadius: "8px",
                                            textAlign: "center",
                                        }}
                                    >
                                        <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>
                                            ≡ƒÆí <strong>Tip:</strong> We tried to load your last
                                            month's data automatically, but it may not be available
                                            yet. Use the controls panel to select specific restaurants
                                            and date ranges for your reports.
                                        </p>
                                    </div>
                                )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

// OAuth Callback Component with Navigation
const OAuthCallbackWithNavigation = () => {
    const navigate = useNavigate();

    const handleAuthSuccess = async (userData) => {

        // No navigation here - OAuthCallback component handles navigation
        // after this callback completes
    };

    return <OAuthCallback onAuthSuccess={handleAuthSuccess} />;
};

// Auth Component with Navigation
const AuthPageWithNavigation = () => {
    const navigate = useNavigate();

    const handleAuthSuccess = (userData) => {
        navigate("/dashboard");
    };

    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
};

// Landing Component with Navigation
const LandingPageWithNavigation = () => {
    const navigate = useNavigate();

    const handleGetStarted = () => {
        navigate("/signup");
    };

    const handleLogin = () => {
        navigate("/login");
    };

    return <LandingPage onGetStarted={handleGetStarted} onLogin={handleLogin} />;
};

// Profile Page Component with Navigation
const ProfilePageWithNavigation = () => {
    const navigate = useNavigate();
    const user = authService.getCurrentUser();

    const handleLogout = () => {
        authService.logout();
        localStorage.removeItem("autoLoadAttempted"); // Clear auto-load flag for next login
        localStorage.removeItem("dashboardData"); // Clear persisted dashboard data
        localStorage.removeItem("previousRoute"); // Clear navigation history
        navigate("/");
    };

    const handleBack = () => {
        // Check where the user came from
        const previousRoute = localStorage.getItem("previousRoute");

        if (previousRoute === "/") {
            // User came from landing page
            navigate("/");
        } else if (previousRoute === "/dashboard") {
            // User came from dashboard
            navigate("/dashboard");
        } else {
            // Default to dashboard if no previous route or direct access
            navigate("/dashboard");
        }

        // Clear the previous route after navigation
        localStorage.removeItem("previousRoute");
    };

    return (
        <ProfilePage user={user} onLogout={handleLogout} onBack={handleBack} />
    );
};

function App() {

    return (
        <Router>
            <Routes>
                <Route path="/" element={<LandingPageWithNavigation />} />
                <Route path="/login" element={<AuthPageWithNavigation />} />
                <Route path="/signup" element={<AuthPageWithNavigation />} />
                <Route
                    path="/oauth/callback"
                    element={<OAuthCallbackWithNavigation />}
                />
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
    );
}

export default App;

