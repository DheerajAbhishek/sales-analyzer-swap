import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { authService } from "../services/authService";
import Hero from "./Landing/Hero";
import HowItWorks from "./Landing/HowItWorks";
import LiveMetricsPreview from "./Landing/LiveMetricsPreview";
import WhyTrustUs from "./Landing/WhyTrustUs";
import NewPricing from "./Landing/NewPricing";
import FinalCTA from "./Landing/FinalCTA";
import NewFooter from "./Landing/NewFooter";

const LandingPage = ({ onGetStarted, onLogin }) => {
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuthStatus = () => {
      // Synchronously check localStorage first - this is instant
      const currentUser = authService.getCurrentUser();
      const authMethod = authService.getAuthMethod();

      if (currentUser && authMethod) {
        // User exists in localStorage, show them immediately
        setUser(currentUser);
      }

      // Always stop loading immediately since we have local data
      setIsCheckingAuth(false);

      // Optional background verification (doesn't block UI)
      if (currentUser && authMethod) {
        setTimeout(async () => {
          try {
            let isValid = false;

            if (authMethod === "google" || authMethod === "dual") {
              const result = await authService.verifyGoogleAuth();
              isValid = result.success;
            } else if (
              authMethod === "traditional" ||
              authMethod === "linked"
            ) {
              const token = authService.getToken();
              if (token) {
                const result = await authService.verifyToken(token);
                isValid = result.success;
              }
            }

            // Only update UI if authentication actually failed
            if (!isValid) {
              setUser(null);
              authService.logout();
            }
          } catch (error) {
            // Keep user logged in unless there's a definitive failure
          }
        }, 500); // Delay background check
      }
    };

    // Safety timeout to ensure loading never takes more than 2 seconds
    const timeoutId = setTimeout(() => {
      setIsCheckingAuth(false);
    }, 2000);

    checkAuthStatus();

    // Cleanup timeout
    return () => clearTimeout(timeoutId);
  }, []);

  const handleGoToDashboard = () => {
    window.location.href = "/dashboard";
  };

  const handleGoToProfile = () => {
    // Store current route as previous route for back navigation
    localStorage.setItem("previousRoute", "/");
    window.location.href = "/profile";
  };

  const handleConnectGmail = () => {
    // Redirect to auth/login page which will handle Gmail OAuth
    window.location.href = "/login";
  };

  return (
    <div className="landing-page">
      <Toaster position="top-center" />
      <nav className="landing-nav">
        <div className="nav-container">
          <div className="nav-logo">
            <img
              src="/restalyticsLogo.png"
              alt="Restalytics"
              className="logo"
            />
          </div>
          <div className="nav-actions">
            {isCheckingAuth ? (
              <div className="auth-checking">
                <span
                  style={{
                    color: "#666",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      border: "2px solid #f3f3f3",
                      borderTop: "2px solid #666",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  ></span>
                  Checking...
                </span>
              </div>
            ) : user ? (
              <div className="logged-in-nav">
                <span className="welcome-text">
                  Welcome back, {user.restaurantName || user.name}!
                </span>
                <button className="nav-login-btn" onClick={handleGoToProfile}>
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
                    e.preventDefault();
                    document
                      .querySelector(".new-pricing-section")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Pricing
                </a>
                <button className="nav-login-btn" onClick={onLogin}>
                  Login
                </button>
                <button className="nav-signup-btn" onClick={onGetStarted}>
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="landing-main">
        <Hero
          user={user}
          onGoToDashboard={handleGoToDashboard}
          onConnectGmail={handleConnectGmail}
        />

        <HowItWorks />

        <LiveMetricsPreview />

        <WhyTrustUs />

        <NewPricing
          user={user}
          onGetStarted={onGetStarted}
          onGoToDashboard={handleGoToDashboard}
        />

        <FinalCTA
          user={user}
          onConnectGmail={handleConnectGmail}
          onGoToDashboard={handleGoToDashboard}
        />
      </main>

      <NewFooter />
    </div>
  );
};

export default LandingPage;
