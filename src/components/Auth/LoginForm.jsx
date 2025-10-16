import React, { useState } from 'react'
import { authService } from '../../services/authService'
import GoogleSignInButton from './GoogleSignInButton'

const LoginForm = ({ onSuccess }) => {
    const [formData, setFormData] = useState({
        businessEmail: '',
        password: ''
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        })
        setError('') // Clear error when user types
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const result = await authService.login(formData.businessEmail, formData.password)
            if (result.success) {
                // Store user data in localStorage
                localStorage.setItem('user', JSON.stringify(result.user))
                localStorage.setItem('token', result.token)
                onSuccess(result.user)
            } else {
                setError(result.message || 'Login failed')
            }
        } catch (err) {
            setError('An error occurred during login')
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleError = (errorMessage) => {
        setError(errorMessage)
    }

    return (
        <div className="auth-form-wrapper">
            {/* Google Sign-In Section */}
            <div className="google-signin-section">
                <GoogleSignInButton
                    onSuccess={onSuccess}
                    onError={handleGoogleError}
                    disabled={loading}
                />

                <div className="auth-divider">
                    <span>or</span>
                </div>
            </div>

            {/* Traditional Email/Password Form */}
            <form onSubmit={handleSubmit} className="auth-form">
                {error && (
                    <div className="auth-error">
                        {error}
                    </div>
                )}

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
                    />
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
                    />
                </div>

                <button
                    type="submit"
                    className="auth-button"
                    disabled={loading}
                >
                    {loading ? 'Logging in...' : 'Login'}
                </button>
            </form>
        </div>
    )
}

export default LoginForm