import React from 'react'

const AccountLinkDialog = ({ existingUser, googleUserData, onConfirm, onCancel }) => {
    return (
        <div className="account-link-overlay">
            <div className="account-link-dialog">
                <div className="account-link-header">
                    <h2>Account Already Exists</h2>
                    <p>We found an existing account with this email address.</p>
                </div>

                <div className="account-details">
                    <div className="existing-account">
                        <h3>Existing Account</h3>
                        <div className="account-info">
                            <p><strong>Email:</strong> {existingUser.email}</p>
                            <p><strong>Restaurant:</strong> {existingUser.restaurantName}</p>
                            <p><strong>Sign-in Method:</strong> {existingUser.authMethod === 'traditional' ? 'Email & Password' : 'Google'}</p>
                        </div>
                    </div>

                    <div className="google-account">
                        <h3>Google Account</h3>
                        <div className="account-info">
                            <div className="google-profile">
                                {googleUserData.picture && (
                                    <img
                                        src={googleUserData.picture}
                                        alt="Google Profile"
                                        className="google-avatar"
                                    />
                                )}
                                <div>
                                    <p><strong>Name:</strong> {googleUserData.name}</p>
                                    <p><strong>Email:</strong> {googleUserData.email}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="link-explanation">
                    <h3>What happens if you link accounts?</h3>
                    <ul>
                        <li>You'll be able to sign in with both email/password and Google</li>
                        <li>Your existing restaurant data will be preserved</li>
                        <li>Your Google profile picture will be added to your account</li>
                        <li>No data will be lost</li>
                    </ul>
                </div>

                <div className="dialog-actions">
                    <button
                        className="cancel-button"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        className="confirm-button"
                        onClick={onConfirm}
                    >
                        Link My Google Account
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AccountLinkDialog