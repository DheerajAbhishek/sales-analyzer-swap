import React, { useState } from "react";
import GoogleSignupButton from "./GoogleSignupButton";

const SignupForm = ({ onSuccess }) => {
  const [error, setError] = useState("");

  const handleGoogleSuccess = () => {
    // Google signup success will be handled by the callback
    // This is here for consistency with LoginForm
  };

  const handleGoogleError = (errorMessage) => {
    setError(errorMessage);
  };

  return (
    <div className="auth-form-wrapper">
      {/* Google Sign-Up Section */}
      <div className="google-signin-section">
        <GoogleSignupButton
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
        />

        {error && <div className="auth-error">{error}</div>}
      </div>
    </div>
  );
};

export default SignupForm;
