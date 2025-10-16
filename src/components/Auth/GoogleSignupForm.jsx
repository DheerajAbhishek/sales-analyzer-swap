import React, { useState } from 'react'
import { authService } from '../../services/authService'
import AccountLinkDialog from './AccountLinkDialog'

const GoogleSignupForm = ({ googleUserData, onComplete, onCancel, needsAccountLinking = false }) => {
    const [formData, setFormData] = useState({
        restaurantName: '',
        phoneNumber: '',
        state: '',
        city: ''
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [showLinkDialog, setShowLinkDialog] = useState(needsAccountLinking) // Auto-show if linking needed
    const [existingUser, setExistingUser] = useState(needsAccountLinking ? {
        email: googleUserData?.email,
        authMethod: 'traditional'
    } : null)

    const handleInputChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({
            ...prev,
            [name]: value
        }))
        // Clear error when user starts typing
        if (error) setError('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            // Validate required fields
            const requiredFields = ['restaurantName', 'phoneNumber', 'state', 'city']
            const missingFields = requiredFields.filter(field => !formData[field].trim())

            if (missingFields.length > 0) {
                setError('All fields are required')
                setLoading(false)
                return
            }

            // Validate phone number
            if (!/^\d{10}$/.test(formData.phoneNumber)) {
                setError('Phone number must be 10 digits')
                setLoading(false)
                return
            }

            // Call the Google signup API
            const result = await authService.completeGoogleSignup({
                ...googleUserData,
                ...formData
            })

            if (result.success) {
                onComplete(result.user)
            } else {
                // Check if it's an account link request
                if (result.errorType === 'ACCOUNT_LINK_REQUIRED') {
                    setExistingUser(result.existingUser)
                    setShowLinkDialog(true)
                } else {
                    setError(result.message || 'Signup failed')
                }
            }
        } catch (err) {
            console.error('Google signup error:', err)
            setError('An error occurred during signup')
        } finally {
            setLoading(false)
        }
    }

    const handleLinkAccount = async () => {
        setLoading(true)
        setError('')

        try {
            // Call the link account API with the form data
            const result = await authService.linkGoogleAccount({
                ...googleUserData,
                ...formData
            })

            if (result.success) {
                setShowLinkDialog(false)
                onComplete(result.user)
            } else {
                setError(result.message || 'Account linking failed')
                setShowLinkDialog(false)
            }
        } catch (err) {
            console.error('Account linking error:', err)
            setError('An error occurred during account linking')
            setShowLinkDialog(false)
        } finally {
            setLoading(false)
        }
    }

    const handleCancelLink = () => {
        setShowLinkDialog(false)
        setError('Account linking cancelled. Please try with a different email or sign in to your existing account.')
    }

    // Show account link dialog if needed
    if (showLinkDialog) {
        return (
            <AccountLinkDialog
                existingUser={existingUser || {
                    email: googleUserData?.email,
                    restaurantName: 'Your existing account',
                    authMethod: 'traditional'
                }}
                googleUserData={googleUserData}
                onConfirm={handleLinkAccount}
                onCancel={handleCancelLink}
            />
        )
    }

    return (
        <div className="google-signup-overlay">
            <div className="google-signup-form">
                <div className="google-signup-header">
                    <h2>Complete Your Profile</h2>
                    <p>Hi {googleUserData.name}! Please provide additional details to complete your account setup.</p>
                </div>

                <form onSubmit={handleSubmit} className="signup-form">
                    <div className="form-group">
                        <label htmlFor="restaurantName">Restaurant/Business Name *</label>
                        <input
                            type="text"
                            id="restaurantName"
                            name="restaurantName"
                            value={formData.restaurantName}
                            onChange={handleInputChange}
                            placeholder="Enter your restaurant name"
                            disabled={loading}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="phoneNumber">Phone Number *</label>
                        <input
                            type="tel"
                            id="phoneNumber"
                            name="phoneNumber"
                            value={formData.phoneNumber}
                            onChange={handleInputChange}
                            placeholder="10-digit phone number"
                            disabled={loading}
                            required
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="state">State *</label>
                            <input
                                type="text"
                                id="state"
                                name="state"
                                value={formData.state}
                                onChange={handleInputChange}
                                placeholder="Enter state"
                                disabled={loading}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="city">City *</label>
                            <input
                                type="text"
                                id="city"
                                name="city"
                                value={formData.city}
                                onChange={handleInputChange}
                                placeholder="Enter city"
                                disabled={loading}
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="error-message">
                            {error}
                        </div>
                    )}

                    <div className="form-actions">
                        <button
                            type="button"
                            className="cancel-button"
                            onClick={onCancel}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="submit-button"
                            disabled={loading}
                        >
                            {loading ? 'Creating Account...' : 'Complete Signup'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default GoogleSignupForm