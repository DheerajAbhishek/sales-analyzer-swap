import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authService } from "../../services/authService";
import GoogleSignupForm from "./GoogleSignupForm";

const OAuthCallback = ({ onAuthSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSignupForm, setShowSignupForm] = useState(false);
  const [googleUserData, setGoogleUserData] = useState(null);
  const [needsAccountLinking, setNeedsAccountLinking] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const processingRef = useRef(false); // Use ref to persist across re-renders
  const processedCodeRef = useRef(null); // Track which code we've processed

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      // Prevent processing if already in progress or already processed this code
      if (
        processingRef.current ||
        (code && processedCodeRef.current === code)
      ) {
        console.log(
          "⏳ OAuth callback already processed for this code, skipping...",
        );
        return;
      }

      processingRef.current = true;
      if (code) processedCodeRef.current = code;
      console.log(
        "🚀 Starting OAuth callback processing for code:",
        code?.substring(0, 10) + "...",
      );

      try {
        if (error) {
          setError(`Authentication failed: ${error}`);
          setLoading(false);
          return;
        }

        if (!code) {
          setError("Missing authorization code");
          setLoading(false);
          return;
        }

        const result = await authService.handleGoogleCallback(code, state);

        if (result.success) {
          if (result.isNewUser) {
            // New user or account linking needed - show signup form
            setGoogleUserData(result.googleUserData);
            setNeedsAccountLinking(result.needsAccountLinking || false);
            setShowSignupForm(true);
            setLoading(false);
          } else {
            // Existing user - log them in
            // Wait for onAuthSuccess to complete before navigating
            if (onAuthSuccess) {
              await onAuthSuccess(result.user);
            }
            navigate("/dashboard", { replace: true });
          }
        } else if (result.shouldRedirectToSignup) {
          // New user tried to login - redirect to signup page with message
          console.log("🚫 New user tried to login, redirecting to signup...");
          navigate("/signup", {
            replace: true,
            state: {
              message: result.message,
              googleUserData: result.googleUserData,
            },
          });
        } else {
          setError(result.message || "Authentication failed");
          setLoading(false);
        }
      } catch (err) {
        console.error("OAuth callback error:", err);
        setError("An error occurred during authentication");
        setLoading(false);
      } finally {
        // Don't reset processingRef to allow subsequent renders to skip
      }
    };

    handleCallback();
  }, [searchParams, navigate, onAuthSuccess]);

  const handleSignupComplete = async (user) => {
    setShowSignupForm(false);
    // Wait for onAuthSuccess to complete before navigating
    if (onAuthSuccess) {
      await onAuthSuccess(user);
    }
    navigate("/dashboard", { replace: true });
  };

  const handleSignupCancel = () => {
    setShowSignupForm(false);
    setError("Signup cancelled");
    setLoading(false);
  };

  if (showSignupForm && googleUserData) {
    return (
      <GoogleSignupForm
        googleUserData={googleUserData}
        needsAccountLinking={needsAccountLinking}
        onComplete={handleSignupComplete}
        onCancel={handleSignupCancel}
      />
    );
  }

  if (loading) {
    return (
      <div className="oauth-callback-container">
        <div className="oauth-callback-card">
          <div className="loading-spinner"></div>
          <h2>Completing Sign-In...</h2>
          <p>Please wait while we verify your Google account.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="oauth-callback-container">
        <div className="oauth-callback-card">
          <div className="error-icon">⚠️</div>
          <h2>Authentication Error</h2>
          <p>{error}</p>
          <button className="retry-button" onClick={() => navigate("/login")}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default OAuthCallback;
