import React, { useState, useEffect } from 'react'
import { googleApisService } from '../../services/googleApisService'
import { authService } from '../../services/authService'

const GoogleIntegrationPanel = () => {
    const [salesEmails, setSalesEmails] = useState(null)
    const [salesFiles, setSalesFiles] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [activeTab, setActiveTab] = useState('emails')

    // Check if user is authenticated with Google
    const isGoogleAuth = authService.getAuthMethod() === 'google'

    const handleFetchSalesEmails = async () => {
        if (!isGoogleAuth) {
            setError('Please sign in with Google to access Gmail data')
            return
        }

        setLoading(true)
        setError('')

        try {
            const emails = await googleApisService.getSalesRelatedEmails({
                maxResults: 20,
                timeRange: '1w'
            })
            setSalesEmails(emails)
        } catch (err) {
            console.error('Error fetching sales emails:', err)
            setError('Failed to fetch sales emails: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleFetchSalesFiles = async () => {
        if (!isGoogleAuth) {
            setError('Please sign in with Google to access Drive data')
            return
        }

        setLoading(true)
        setError('')

        try {
            const files = await googleApisService.getSalesRelatedFiles({
                maxResults: 15
            })
            setSalesFiles(files)
        } catch (err) {
            console.error('Error fetching sales files:', err)
            setError('Failed to fetch sales files: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    if (!isGoogleAuth) {
        return (
            <div className="google-integration-panel">
                <div className="integration-notice">
                    <h3>Google Integration</h3>
                    <p>Sign in with Google to access Gmail and Drive integration features.</p>
                    <ul>
                        <li>Extract sales data from emails</li>
                        <li>Access sales reports in Google Drive</li>
                        <li>Export data to Google Sheets</li>
                    </ul>
                </div>
            </div>
        )
    }

    return (
        <div className="google-integration-panel">
            <div className="integration-header">
                <h3>Google Integration</h3>
                <div className="integration-tabs">
                    <button
                        className={`tab ${activeTab === 'emails' ? 'active' : ''}`}
                        onClick={() => setActiveTab('emails')}
                    >
                        Gmail
                    </button>
                    <button
                        className={`tab ${activeTab === 'files' ? 'active' : ''}`}
                        onClick={() => setActiveTab('files')}
                    >
                        Drive
                    </button>
                </div>
            </div>

            {error && (
                <div className="integration-error">
                    {error}
                </div>
            )}

            {activeTab === 'emails' && (
                <div className="integration-content">
                    <div className="content-header">
                        <h4>Sales-Related Emails</h4>
                        <button
                            onClick={handleFetchSalesEmails}
                            disabled={loading}
                            className="fetch-button"
                        >
                            {loading ? 'Fetching...' : 'Fetch Emails'}
                        </button>
                    </div>

                    {salesEmails && (
                        <div className="emails-content">
                            {Object.entries(salesEmails).map(([category, emails]) => (
                                <div key={category} className="email-category">
                                    <h5>{category.charAt(0).toUpperCase() + category.slice(1)} ({emails.length})</h5>
                                    {emails.slice(0, 3).map((email, index) => (
                                        <div key={index} className="email-item">
                                            <div className="email-subject">
                                                {googleApisService.getEmailSubject ?
                                                    googleApisService.getEmailSubject(email) :
                                                    'Email Subject'
                                                }
                                            </div>
                                            <div className="email-snippet">
                                                {email.snippet || 'No preview available'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'files' && (
                <div className="integration-content">
                    <div className="content-header">
                        <h4>Sales-Related Files</h4>
                        <button
                            onClick={handleFetchSalesFiles}
                            disabled={loading}
                            className="fetch-button"
                        >
                            {loading ? 'Fetching...' : 'Fetch Files'}
                        </button>
                    </div>

                    {salesFiles && (
                        <div className="files-content">
                            {Object.entries(salesFiles).map(([category, files]) => (
                                <div key={category} className="file-category">
                                    <h5>{category.charAt(0).toUpperCase() + category.slice(1)} ({files.length})</h5>
                                    {files.slice(0, 5).map((file, index) => (
                                        <div key={index} className="file-item">
                                            <div className="file-name">{file.name}</div>
                                            <div className="file-details">
                                                <span className="file-type">{file.mimeType?.split('/').pop() || 'Unknown'}</span>
                                                {file.modifiedTime && (
                                                    <span className="file-date">
                                                        {new Date(file.modifiedTime).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {loading && (
                <div className="integration-loading">
                    <div className="loading-spinner"></div>
                    <p>Fetching data from Google...</p>
                </div>
            )}
        </div>
    )
}

export default GoogleIntegrationPanel