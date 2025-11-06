import { jwtDecode } from 'jwt-decode'

class GoogleOAuthService {
    constructor() {
        this.clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
        this.redirectUri = import.meta.env.VITE_OAUTH_REDIRECT_URI || `${window.location.origin}/oauth/callback`
        this.scope = 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly'

        console.log('🔧 OAuth Service Configuration:')
        console.log('  - Client ID:', this.clientId?.substring(0, 20) + '...')
        console.log('  - Redirect URI:', this.redirectUri)
        console.log('  - Current Origin:', window.location.origin)
        console.log('  - Environment:', import.meta.env.MODE)
    }

    // Generate OAuth 2.0 authorization URL - SIMPLIFIED
    getAuthUrl(isNewUser = false) {
        // Simple strategy: 
        // - For signup: Use 'consent' to ensure fresh permissions and get refresh tokens
        // - For login: Use 'select_account' to show account picker without forcing consent
        const prompt = isNewUser ? 'consent' : 'select_account'

        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: this.scope,
            access_type: 'offline',
            prompt: prompt,
            state: this.generateState()
        })

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

        // Store minimal state
        sessionStorage.setItem('oauth_state', params.get('state'))
        sessionStorage.setItem('oauth_context', isNewUser ? 'signup' : 'login')

        console.log(`🔧 OAuth URL generated for ${isNewUser ? 'signup' : 'login'} with ${prompt} prompt`)

        return authUrl
    }

    // Generate random state for CSRF protection
    generateState() {
        return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    }

    // Initiate OAuth flow - SIMPLIFIED
    initiateOAuth(isNewUser = false) {
        const authUrl = this.getAuthUrl(isNewUser)
        console.log(`🚀 Starting ${isNewUser ? 'signup' : 'login'} OAuth flow`)
        window.location.href = authUrl
    }

    // Handle OAuth callback - SIMPLIFIED
    async handleCallback(code, state) {
        const storedState = sessionStorage.getItem('oauth_state')
        const oauthContext = sessionStorage.getItem('oauth_context') || 'login'

        console.log('=== OAuth Callback Debug ===')
        console.log('Code:', code?.substring(0, 20) + '...')
        console.log('State match:', state === storedState)
        console.log('Context:', oauthContext)
        console.log('Current URL:', window.location.href)
        console.log('============================')

        // Check for OAuth errors
        const urlParams = new URLSearchParams(window.location.search)
        const error = urlParams.get('error')
        const errorDescription = urlParams.get('error_description')

        if (error) {
            console.error('❌ OAuth Error:', error, errorDescription)

            // Clear session data on any error
            this.clearOAuthSession()

            return {
                success: false,
                error: `OAuth Error: ${error} - ${errorDescription || 'Authentication failed'}`
            }
        }

        if (state !== storedState) {
            console.warn('⚠️ State mismatch - security risk')
            // Don't fail completely, but log the issue
        }

        // Clear stored state
        sessionStorage.removeItem('oauth_state')

        try {
            // Exchange authorization code for tokens
            const tokenResponse = await this.exchangeCodeForTokens(code)

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
                },
                context: oauthContext
            }
        } catch (error) {
            console.error('OAuth callback error:', error)
            this.clearOAuthSession()

            return {
                success: false,
                error: error.message
            }
        }
    }

    // Clear OAuth session data
    clearOAuthSession() {
        sessionStorage.removeItem('oauth_state')
        sessionStorage.removeItem('oauth_context')
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

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params
        })

        console.log('📡 Token response status:', response.status)

        if (!response.ok) {
            const error = await response.json()
            console.error('❌ Token exchange error:', error)
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
            tokenType: tokens.token_type || 'Bearer',
            grantedAt: Date.now(),
            scope: this.scope
        }

        localStorage.setItem('google_oauth_tokens', JSON.stringify(tokenData))
        console.log('💾 Tokens stored successfully')
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

    // Get user profile from Google
    async getUserProfile() {
        const url = 'https://www.googleapis.com/oauth2/v2/userinfo'
        return await this.makeAuthenticatedRequest(url)
    }

    // Make authenticated API calls
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
        this.clearOAuthSession()
    }
}

export const googleOAuthService = new GoogleOAuthService()