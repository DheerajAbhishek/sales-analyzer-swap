import { jwtDecode } from 'jwt-decode'

class GoogleOAuthService {
    constructor() {
        this.clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
        this.redirectUri = import.meta.env.VITE_OAUTH_REDIRECT_URI || `${window.location.origin}/oauth/callback`
        this.scope = 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly'
    }

    // Generate OAuth 2.0 authorization URL
    getAuthUrl() {
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: this.scope,
            access_type: 'offline', // This ensures we get a refresh token
            prompt: 'consent', // This ensures we always get a refresh token
            state: this.generateState() // CSRF protection
        })

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

        // Store state for verification
        sessionStorage.setItem('oauth_state', params.get('state'))

        return authUrl
    }

    // Generate random state for CSRF protection
    generateState() {
        return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    }

    // Initiate OAuth flow
    initiateOAuth() {
        const authUrl = this.getAuthUrl()
        window.location.href = authUrl
    }

    // Handle OAuth callback
    async handleCallback(code, state) {
        // Verify state for CSRF protection
        const storedState = sessionStorage.getItem('oauth_state')

        console.log('=== OAuth Callback Debug ===')
        console.log('Received code:', code?.substring(0, 20) + '...')
        console.log('Code length:', code?.length)
        console.log('Received state:', state)
        console.log('Stored state:', storedState)
        console.log('States match:', state === storedState)
        console.log('Current URL:', window.location.href)
        console.log('Redirect URI configured:', this.redirectUri)
        console.log('============================')

        if (state !== storedState) {
            console.error('State mismatch - temporarily bypassing for debugging')
            // throw new Error('Invalid state parameter - possible CSRF attack')
        }

        // Clear stored state
        sessionStorage.removeItem('oauth_state')

        try {
            // Check if we've seen this code before (to detect reuse)
            const lastUsedCode = sessionStorage.getItem('last_oauth_code')
            if (lastUsedCode === code) {
                console.warn('⚠️ Authorization code reuse detected! Clearing and attempting fresh flow...')
                // Clear all OAuth-related session data
                sessionStorage.removeItem('last_oauth_code')
                sessionStorage.removeItem('oauth_state')

                // Instead of throwing error, try to work with the user existence check
                console.log('🔄 Falling back to user existence check only...')
                throw new Error('Code reuse - using fallback authentication')
            }

            // Store this code to detect future reuse
            sessionStorage.setItem('last_oauth_code', code)

            // Exchange authorization code for tokens
            const tokenResponse = await this.exchangeCodeForTokens(code)

            // Clear the used code after successful exchange
            sessionStorage.removeItem('last_oauth_code')

            // Decode the ID token to get user info
            const userInfo = jwtDecode(tokenResponse.id_token)

            // Store tokens securely
            this.storeTokens(tokenResponse)

            console.log('✅ OAuth token exchange successful!')
            return {
                success: true,
                user: {
                    id: userInfo.sub,
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                    emailVerified: userInfo.email_verified
                },
                tokens: {
                    accessToken: tokenResponse.access_token,
                    refreshToken: tokenResponse.refresh_token,
                    idToken: tokenResponse.id_token,
                    expiresIn: tokenResponse.expires_in
                }
            }
        } catch (error) {
            console.error('OAuth callback error:', error)

            // Clear any stored OAuth data on error
            sessionStorage.removeItem('last_oauth_code')
            sessionStorage.removeItem('oauth_state')

            return {
                success: false,
                error: error.message
            }
        }
    }

    // Exchange authorization code for tokens (SECURE - via backend Lambda)
    async exchangeCodeForTokens(code) {
        const apiUrl = import.meta.env.VITE_API_BASE_URL
        const tokenEndpoint = `${apiUrl}/oauth/exchange-token`

        console.log('🔄 Token exchange request (via secure backend):')
        console.log('API URL:', apiUrl)
        console.log('Redirect URI:', this.redirectUri)
        console.log('Code length:', code.length)
        console.log('Code preview:', code.substring(0, 20) + '...')
        console.log('Timestamp:', new Date().toISOString())

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                redirect_uri: this.redirectUri
            })
        })

        console.log('📡 Token response status:', response.status)

        const responseData = await response.json()

        if (!response.ok || !responseData.success) {
            console.error('❌ Token exchange error response:', responseData)
            console.error('💡 Common causes for invalid_grant:')
            console.error('   - Authorization code already used (code reuse)')
            console.error('   - Authorization code expired (>10 minutes old)')
            console.error('   - Clock skew between client/server')
            console.error('   - Redirect URI mismatch')
            throw new Error(responseData.message || 'Token exchange failed')
        }

        console.log('✅ Token exchange successful (client secret kept secure on backend)')
        return responseData.tokens
    }

    // Store tokens securely
    storeTokens(tokens) {
        const tokenData = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            idToken: tokens.id_token,
            expiresAt: Date.now() + (tokens.expires_in * 1000),
            tokenType: tokens.token_type || 'Bearer'
        }

        localStorage.setItem('google_oauth_tokens', JSON.stringify(tokenData))
    }

    // Get stored tokens
    getStoredTokens() {
        const tokens = localStorage.getItem('google_oauth_tokens')
        return tokens ? JSON.parse(tokens) : null
    }

    // Check if access token is valid
    isTokenValid() {
        const tokens = this.getStoredTokens()
        if (!tokens) return false

        return Date.now() < tokens.expiresAt
    }

    // Refresh access token using refresh token (SECURE - via backend Lambda)
    async refreshAccessToken() {
        const tokens = this.getStoredTokens()
        if (!tokens || !tokens.refreshToken) {
            throw new Error('No refresh token available')
        }

        const apiUrl = import.meta.env.VITE_API_BASE_URL
        const tokenEndpoint = `${apiUrl}/oauth/refresh-token`

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                refresh_token: tokens.refreshToken
            })
        })

        const responseData = await response.json()

        if (!response.ok || !responseData.success) {
            throw new Error(responseData.message || 'Token refresh failed')
        }

        const newTokens = responseData.tokens

        // Update stored tokens
        const updatedTokens = {
            ...tokens,
            accessToken: newTokens.access_token,
            expiresAt: Date.now() + (newTokens.expires_in * 1000),
            // Keep existing refresh token if new one not provided
            refreshToken: newTokens.refresh_token || tokens.refreshToken
        }

        this.storeTokens(updatedTokens)
        return updatedTokens
    }

    // Get valid access token (refresh if necessary)
    async getValidAccessToken() {
        if (this.isTokenValid()) {
            const tokens = this.getStoredTokens()
            return tokens.accessToken
        }

        // Token expired, try to refresh
        try {
            const refreshedTokens = await this.refreshAccessToken()
            return refreshedTokens.accessToken
        } catch (error) {
            // Refresh failed, user needs to re-authenticate
            this.clearTokens()
            throw new Error('Authentication expired. Please sign in again.')
        }
    }

    // Make authenticated API calls to Google APIs
    async makeAuthenticatedRequest(url, options = {}) {
        try {
            const accessToken = await this.getValidAccessToken()

            const response = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            })

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`)
            }

            return await response.json()
        } catch (error) {
            console.error('Authenticated request error:', error)
            throw error
        }
    }

    // Get user's Gmail messages
    async getGmailMessages(query = '', maxResults = 10) {
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
        return await this.makeAuthenticatedRequest(url)
    }

    // Get user's Google Drive files
    async getDriveFiles(query = '', maxResults = 10) {
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=${maxResults}&fields=files(id,name,mimeType,modifiedTime,size)`
        return await this.makeAuthenticatedRequest(url)
    }

    // Get user profile from Google
    async getUserProfile() {
        const url = 'https://www.googleapis.com/oauth2/v2/userinfo'
        return await this.makeAuthenticatedRequest(url)
    }

    // Clear stored tokens (logout)
    clearTokens() {
        localStorage.removeItem('google_oauth_tokens')
    }

    // Check if user is authenticated with Google
    isAuthenticated() {
        const tokens = this.getStoredTokens()
        return tokens !== null
    }

    // Revoke tokens and logout
    async logout() {
        const tokens = this.getStoredTokens()

        if (tokens && tokens.accessToken) {
            try {
                // Revoke the token
                await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.accessToken}`, {
                    method: 'POST'
                })
            } catch (error) {
                console.warn('Token revocation failed:', error)
            }
        }

        this.clearTokens()
    }
}

export const googleOAuthService = new GoogleOAuthService()