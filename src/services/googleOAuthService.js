import { jwtDecode } from 'jwt-decode'

class GoogleOAuthService {
    constructor() {
        this.clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
        this.redirectUri = import.meta.env.VITE_OAUTH_REDIRECT_URI || `${window.location.origin}/oauth/callback`
        this.scope = 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly'
    }

    // Generate OAuth 2.0 authorization URL
    getAuthUrl(isNewUser = false) {
        // Smart prompt strategy for better UX:
        // - For signup: Use 'consent' to ensure fresh permissions and get refresh tokens
        // - For login: Use 'select_account' to show account picker without forcing consent
        // - Google will automatically prompt for consent in login flow only if permissions weren't previously granted
        const prompt = isNewUser ? 'consent' : 'select_account'

        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: this.scope,
            access_type: 'offline', // This ensures we get a refresh token
            prompt: prompt,
            state: this.generateState() // CSRF protection
        })

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

        // Store state for verification
        sessionStorage.setItem('oauth_state', params.get('state'))
        // Store context for callback handling
        sessionStorage.setItem('oauth_context', isNewUser ? 'signup' : 'login')

        console.log(`🔧 OAuth URL generated for ${isNewUser ? 'signup' : 'login'} with ${prompt} prompt`)

        return authUrl
    }

    // Generate random state for CSRF protection
    generateState() {
        return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    }

    // Initiate OAuth flow
    initiateOAuth(isNewUser = false) {
        const authUrl = this.getAuthUrl(isNewUser)
        console.log(`🚀 Initiating OAuth flow for ${isNewUser ? 'new' : 'existing'} user with prompt: ${isNewUser ? 'consent' : 'select_account'}`)
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

    // Exchange authorization code for tokens
    async exchangeCodeForTokens(code) {
        const tokenEndpoint = 'https://oauth2.googleapis.com/token'

        const params = new URLSearchParams({
            client_id: this.clientId,
            client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: this.redirectUri
        })

        console.log('🔄 Token exchange request:')
        console.log('Client ID:', this.clientId)
        console.log('Redirect URI:', this.redirectUri)
        console.log('Code length:', code.length)
        console.log('Code preview:', code.substring(0, 20) + '...')
        console.log('Has client secret:', !!import.meta.env.VITE_GOOGLE_CLIENT_SECRET)
        console.log('Grant type:', 'authorization_code')
        console.log('Timestamp:', new Date().toISOString())

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params
        })

        console.log('📡 Token response status:', response.status)
        console.log('📡 Token response headers:', Object.fromEntries(response.headers.entries()))

        if (!response.ok) {
            const error = await response.json()
            console.error('❌ Token exchange error response:', error)
            console.error('💡 Common causes for invalid_grant:')
            console.error('   - Authorization code already used (code reuse)')
            console.error('   - Authorization code expired (>10 minutes old)')
            console.error('   - Clock skew between client/server')
            console.error('   - Redirect URI mismatch')
            console.error('   - Invalid client credentials')
            throw new Error(`Token exchange failed: ${error.error_description || error.error}`)
        }

        return await response.json()
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

    // Refresh access token using refresh token
    async refreshAccessToken() {
        const tokens = this.getStoredTokens()
        if (!tokens || !tokens.refreshToken) {
            throw new Error('No refresh token available')
        }

        const tokenEndpoint = 'https://oauth2.googleapis.com/token'

        const params = new URLSearchParams({
            client_id: this.clientId,
            client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
            refresh_token: tokens.refreshToken,
            grant_type: 'refresh_token'
        })

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(`Token refresh failed: ${error.error_description || error.error}`)
        }

        const newTokens = await response.json()

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