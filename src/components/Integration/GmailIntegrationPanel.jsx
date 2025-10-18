import React, { useState, useEffect } from 'react'
import { gmailIntegrationService } from '../../services/gmailIntegrationService.js'
import { authService } from '../../services/authService.js'
import { autoEmailProcessingService } from '../../services/autoEmailProcessingService.js'
import './GmailIntegrationPanel.css'

const GmailIntegrationPanel = () => {
    console.log('🚀 GmailIntegrationPanel is rendering!')

    const [integrationStatus, setIntegrationStatus] = useState({
        ready: false,
        checking: true,
        hasTokens: false,
        isExpired: false
    })
    const [processing, setProcessing] = useState({
        active: false,
        senderEmail: '',
        maxResults: 150
    })
    const [results, setResults] = useState(null)
    const [error, setError] = useState('')
    const [autoProcessingStatus, setAutoProcessingStatus] = useState(null)

    const currentUser = authService.getCurrentUser()

    useEffect(() => {
        checkGmailIntegration()

        // Check if auto-processing is active
        if (currentUser?.email) {
            const status = autoEmailProcessingService.getStatus(currentUser.email)
            setAutoProcessingStatus(status)
        }

        // Listen for auto-processing updates
        const handleAutoProcessingUpdate = (event) => {
            const { userEmail, status } = event.detail
            if (userEmail === currentUser?.email) {
                setAutoProcessingStatus(status)
            }
        }

        window.addEventListener('autoEmailProcessingUpdate', handleAutoProcessingUpdate)

        return () => {
            window.removeEventListener('autoEmailProcessingUpdate', handleAutoProcessingUpdate)
        }
    }, [])

    const checkGmailIntegration = async () => {
        if (!currentUser?.email) {
            setError('No user found')
            setIntegrationStatus(prev => ({ ...prev, checking: false }))
            return
        }

        try {
            const status = await gmailIntegrationService.isGmailIntegrationReady(currentUser.email)
            setIntegrationStatus({
                ready: status.ready,
                checking: false,
                hasTokens: status.tokenStatus?.hasTokens || false,
                isExpired: status.tokenStatus?.isExpired || false,
                reason: status.reason
            })
        } catch (error) {
            console.error('Error checking Gmail integration:', error)
            setError('Failed to check Gmail integration status')
            setIntegrationStatus(prev => ({ ...prev, checking: false }))
        }
    }

    const initiateGmailAuth = () => {
        try {
            const authUrl = gmailIntegrationService.getGmailAuthUrl()
            window.location.href = authUrl
        } catch (error) {
            console.error('Error initiating Gmail auth:', error)
            setError('Failed to start Gmail authentication')
        }
    }

    const disconnectGmail = async () => {
        if (!currentUser?.email) {
            setError('No user found')
            return
        }

        try {
            const result = await gmailIntegrationService.removeGmailTokens(currentUser.email)

            if (result.success) {
                setIntegrationStatus({
                    ready: false,
                    checking: false,
                    hasTokens: false,
                    isExpired: false
                })
                setError('')
            } else {
                setError(result.message || 'Failed to disconnect Gmail')
            }
        } catch (error) {
            console.error('Error disconnecting Gmail:', error)
            setError('Failed to disconnect Gmail')
        }
    }

    if (integrationStatus.checking) {
        return (
            <div className="gmail-integration-panel">
                <div className="integration-header">
                    <h3>📧 Gmail Integration</h3>
                </div>
                <div className="checking-status">
                    <div className="loading-spinner"></div>
                    <p>Checking Gmail integration status...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="gmail-integration-panel">
            <div className="integration-header">
                <h3>📧 Gmail Integration</h3>
                <div className={`status-indicator ${integrationStatus.ready ? 'connected' : 'disconnected'}`}>
                    {integrationStatus.ready ? '🟢 Connected' : '🔴 Not Connected'}
                </div>
            </div>

            {error && (
                <div className="error-message">
                    ⚠️ {error}
                </div>
            )}

            {!integrationStatus.ready && (
                <div className="connection-section">
                    <div className="info-box">
                        <h4>Connect Gmail to Process Excel File Attachments</h4>
                        <p>
                            Connect your Gmail account to automatically fetch emails from specific senders
                            and download their Excel file attachments (.xlsx, .xls, .xlsm, .csv) to your S3 bucket.
                            <br />
                            <strong>Note:</strong> Only Excel files will be processed. All other attachment types will be ignored.
                        </p>                        {integrationStatus.hasTokens && integrationStatus.isExpired && (
                            <div className="warning-message">
                                Your Gmail tokens have expired. Please reconnect to continue using Gmail integration.
                            </div>
                        )}

                        {integrationStatus.reason && (
                            <div className="reason-message">
                                Status: {integrationStatus.reason}
                            </div>
                        )}
                    </div>

                    <button
                        className="connect-button"
                        onClick={initiateGmailAuth}
                    >
                        🔗 {integrationStatus.hasTokens ? 'Reconnect Gmail' : 'Connect Gmail'}
                    </button>
                </div>
            )}

            {integrationStatus.ready && (
                <div className="processing-section">
                    <div className="info-box">
                        <h4>✅ Gmail Connected Successfully</h4>
                        <p>
                            Your Gmail account is connected. Emails from <strong>billing@zomato.com</strong> and <strong>payments@swiggy.in</strong> are automatically processed after signup.
                        </p>
                    </div>

                    <div className="email-processor" style={{ display: 'none' }}>
                        <h4>Process Emails from Sender (Manual)</h4>

                        <div className="input-group">
                            <label htmlFor="sender-email">Sender Email Address:</label>
                            <input
                                id="sender-email"
                                type="email"
                                placeholder="e.g., reports@company.com"
                                value={senderEmail}
                                onChange={(e) => setSenderEmail(e.target.value)}
                                disabled={processing.active}
                            />
                        </div>

                        <div className="process-info">
                            <p>
                                This will fetch the last 150 emails from the specified sender and download
                                only Excel file attachments (.xlsx, .xls, .xlsm, .csv) to your S3 bucket.
                                All other file types will be automatically ignored. After upload, it will trigger your N8N workflow.
                            </p>
                        </div>                        <div className="action-buttons">
                            <button
                                className="process-button"
                                onClick={processEmails}
                                disabled={processing.active || !senderEmail.trim()}
                            >
                                {processing.active ? (
                                    <>
                                        <div className="loading-spinner small"></div>
                                        Processing...
                                    </>
                                ) : (
                                    '🚀 Process Excel Files'
                                )}
                            </button>

                            <button
                                className="disconnect-button"
                                onClick={disconnectGmail}
                                disabled={processing.active}
                            >
                                🔌 Disconnect Gmail
                            </button>
                        </div>
                    </div>

                    {processing.active && (
                        <div className="processing-status">
                            <div className="loading-spinner"></div>
                            <p>
                                Processing Excel files from <strong>{processing.senderEmail}</strong>...
                                <br />
                                <small>This may take a few minutes depending on the number of emails and Excel attachments.</small>
                            </p>
                        </div>
                    )}

                    {results && (
                        <div className="results-section">
                            <h4>✅ Processing Complete</h4>

                            <div className="results-summary">
                                <div className="result-stat">
                                    <span className="stat-label">Excel Files Processed:</span>
                                    <span className="stat-value">{results.processedFiles}</span>
                                </div>
                                <div className="result-stat">
                                    <span className="stat-label">Webhook Triggered:</span>
                                    <span className="stat-value">
                                        {results.webhookTriggered ? '✅ Yes' : '❌ No'}
                                    </span>
                                </div>
                            </div>

                            {results.files && results.files.length > 0 && (
                                <div className="files-list">
                                    <h5>Processed Excel Files:</h5>
                                    <div className="files-container">
                                        {results.files.map((file, index) => (
                                            <div key={index} className="file-item">
                                                <div className="file-name">{file.filename}</div>
                                                <div className="file-details">
                                                    <span>Size: {formatFileSize(file.size)}</span>
                                                    <span>Type: {file.mime_type}</span>
                                                </div>
                                                <div className="file-s3-key">{file.s3_key}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// Helper function to format file sizes
const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default GmailIntegrationPanel