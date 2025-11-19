import React, { useState } from "react";
import { authService } from "../../services/authService";
import GoogleSignupButton from "./GoogleSignupButton";

const SignupForm = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    restaurantName: "",
    businessEmail: "",
    phoneNumber: "",
    state: "",
    city: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError(""); // Clear error when user types
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Validate password match
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }

      // Validate password strength
      if (formData.password.length < 8) {
        setError("Password must be at least 8 characters long");
        setLoading(false);
        return;
      }

      // Validate phone number
      if (!/^\d{10}$/.test(formData.phoneNumber)) {
        setError("Phone number must be 10 digits");
        setLoading(false);
        return;
      }

      const result = await authService.signup({
        restaurantName: formData.restaurantName,
        businessEmail: formData.businessEmail,
        phoneNumber: formData.phoneNumber,
        state: formData.state,
        city: formData.city,
        password: formData.password,
      });

      if (result.success) {
        // After successful signup, automatically log the user in
        const loginResult = await authService.login(
          formData.businessEmail,
          formData.password
        );

        if (loginResult.success) {
          // Store user data in localStorage
          localStorage.setItem("user", JSON.stringify(loginResult.user));
          localStorage.setItem("token", loginResult.token);

          // Clear form
          setFormData({
            restaurantName: "",
            businessEmail: "",
            phoneNumber: "",
            state: "",
            city: "",
            password: "",
            confirmPassword: "",
          });

          // Call onSuccess with user data to complete authentication
          onSuccess(loginResult.user);
        } else {
          // If auto-login fails, redirect to login page with message
          setError("Account created successfully! Please log in.");
          setTimeout(() => {
            onSuccess(); // This will switch to login tab
          }, 2000);
        }
      } else {
        setError(result.message || "Signup failed");
      }
    } catch (err) {
      console.error("Signup error:", err);
      setError("An error occurred during signup");
    } finally {
      setLoading(false);
    }
  };

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
          disabled={loading}
        />

        <div className="auth-divider">
          <span>or</span>
        </div>
      </div>

      {/* Traditional Email/Password Signup Form */}
      <form onSubmit={handleSubmit} className="auth-form">
        {/* Important Notice for Email Signup Users */}
        <div className="auth-warning-notice">
          <svg className="warning-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <div>
            <strong>Note:</strong> Email signup users need to manually upload sales data files.
            For automatic dashboard updates via Gmail integration, please sign up with Google.
          </div>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="form-group">
          <label htmlFor="restaurantName">Restaurant/Business Name</label>
          <input
            type="text"
            id="restaurantName"
            name="restaurantName"
            value={formData.restaurantName}
            onChange={handleChange}
            required
            disabled={loading}
            placeholder="Enter your restaurant name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="businessEmail">Business Email ID</label>
          <input
            type="email"
            id="businessEmail"
            name="businessEmail"
            value={formData.businessEmail}
            onChange={handleChange}
            required
            disabled={loading}
            placeholder="your@email.com"
          />
        </div>

        <div className="form-group">
          <label htmlFor="phoneNumber">Phone Number</label>
          <input
            type="tel"
            id="phoneNumber"
            name="phoneNumber"
            value={formData.phoneNumber}
            onChange={handleChange}
            required
            disabled={loading}
            placeholder="10-digit phone number"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="state">State</label>
            <input
              type="text"
              id="state"
              name="state"
              value={formData.state}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="Enter state"
            />
          </div>

          <div className="form-group">
            <label htmlFor="city">City</label>
            <input
              type="text"
              id="city"
              name="city"
              value={formData.city}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="Enter city"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            disabled={loading}
            placeholder="Minimum 8 characters"
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            disabled={loading}
            placeholder="Re-enter your password"
          />
        </div>

        <button type="submit" className="auth-button" disabled={loading}>
          {loading ? "Creating Account..." : "Sign Up"}
        </button>
      </form>
    </div>
  );
};

export default SignupForm;
