import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";

const AuthPage = ({ onAuthSuccess }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Set initial state based on URL
    setIsLogin(location.pathname === "/login");

    // Check if we have a message from OAuth callback
    if (location.state?.message) {
      setMessage(location.state.message);
      setIsLogin(false); // Switch to signup tab if redirected from login

      // Clear the location state to prevent message from persisting
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  const handleTabChange = (isLoginTab) => {
    setIsLogin(isLoginTab);
    setMessage(""); // Clear message when switching tabs
    navigate(isLoginTab ? "/login" : "/signup");
  };

  const handleSignupSuccess = (userData) => {
    // If userData is provided, user is fully authenticated after signup
    if (userData) {
      onAuthSuccess(userData);
    } else {
      // Otherwise, just switch to login tab
      handleTabChange(true);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Sales Dashboard</h1>
          <p>Welcome to your analytics platform</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${isLogin ? "active" : ""}`}
            onClick={() => handleTabChange(true)}
          >
            Login
          </button>
          <button
            className={`auth-tab ${!isLogin ? "active" : ""}`}
            onClick={() => handleTabChange(false)}
          >
            Sign Up
          </button>
        </div>

        <div className="auth-form-container">
          {message && <div className="auth-info-message">{message}</div>}

          {isLogin ? (
            <LoginForm onSuccess={onAuthSuccess} />
          ) : (
            <SignupForm onSuccess={handleSignupSuccess} />
          )}
        </div>

        <div className="auth-footer">
          <p>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              className="auth-link"
              onClick={() => handleTabChange(!isLogin)}
            >
              {isLogin ? "Sign up" : "Login"}
            </button>
          </p>
          <div className="auth-legal-links">
            <Link to="/privacy">Privacy Policy</Link>
            <span>•</span>
            <Link to="/terms">Terms of Service</Link>
            <span>•</span>
            <a href="mailto:support@restalytics.ai">Contact</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
