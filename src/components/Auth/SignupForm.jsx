import React, { useState } from 'react'
import { authService } from '../../services/authService'

const SignupForm = ({ onSuccess }) => {
    const [formData, setFormData] = useState({
        restaurantName: '',
        businessEmail: '',
        phoneNumber: '',
        state: '',
        city: '',
        password: '',
        confirmPassword: ''
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        })
        setError('') // Clear error when user types
        setSuccess('')
    }

    const validateForm = () => {
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match')
            return false
        }
        if (formData.password.length < 8) {
            setError('Password must be at least 8 characters long')
            return false
        }
        if (!formData.phoneNumber.match(/^\d{10}$/)) {
            setError('Phone number must be 10 digits')
            return false
        }
        return true
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!validateForm()) return

        setLoading(true)
        setError('')

        try {
            const result = await authService.signup({
                restaurantName: formData.restaurantName,
                businessEmail: formData.businessEmail,
                phoneNumber: formData.phoneNumber,
                state: formData.state,
                city: formData.city,
                password: formData.password
            })

            if (result.success) {
                setSuccess('Account created successfully! Please login.')
                setTimeout(() => {
                    onSuccess()
                }, 2000)
            } else {
                setError(result.message || 'Signup failed')
            }
        } catch (err) {
            setError('An error occurred during signup')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="auth-form">
            {error && (
                <div className="auth-error">
                    {error}
                </div>
            )}

            {success && (
                <div className="auth-success">
                    {success}
                </div>
            )}

            <div className="form-group">
                <label htmlFor="restaurantName">Restaurant Name</label>
                <input
                    type="text"
                    id="restaurantName"
                    name="restaurantName"
                    value={formData.restaurantName}
                    onChange={handleChange}
                    required
                    disabled={loading}
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
                />
            </div>

            <div className="form-group">
                <label htmlFor="phoneNumber">Phone Number</label>
                <div className="phone-input">
                    <span className="country-code">+91</span>
                    <input
                        type="tel"
                        id="phoneNumber"
                        name="phoneNumber"
                        value={formData.phoneNumber}
                        onChange={handleChange}
                        required
                        disabled={loading}
                        placeholder="Enter 10 digit number"
                        maxLength="10"
                    />
                </div>
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
                    minLength="8"
                />
                <small className="form-hint">Must be at least 8 characters</small>
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
                />
            </div>

            <button
                type="submit"
                className="auth-button"
                disabled={loading}
            >
                {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
        </form>
    )
}

export default SignupForm