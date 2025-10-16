# Google OAuth 2.0 + OpenID Connect Setup Guide

This guide will help you set up Google OAuth 2.0 with OpenID Connect for your Sales Dashboard application.

## Prerequisites

1. Google Cloud Console account
2. Your client ID and client secret from Google Cloud Console

## Step 1: Configure Google Cloud Console

### 1.1 Create OAuth 2.0 Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "APIs & Services" > "Credentials"
3. Click "Create Credentials" > "OAuth 2.0 Client IDs"
4. Choose "Web application" as the application type
5. Add authorized redirect URIs:
   - For development: `http://localhost:5173/auth/callback`
   - For production: `https://yourdomain.com/auth/callback`

### 1.2 Enable Required APIs
1. Go to "APIs & Services" > "Library"
2. Enable the following APIs:
   - **Google+ API** (for user profile)
   - **Gmail API** (for email access)
   - **Google Drive API** (for drive access)
   - **Google Identity** (for OpenID Connect)

## Step 2: Environment Configuration

Update your `.env` file with your Google OAuth credentials:

```env
# Replace 'your-google-client-id-here' with your actual client ID
VITE_GOOGLE_CLIENT_ID=your-google-client-id-here

# Replace 'your-google-client-secret-here' with your actual client secret
VITE_GOOGLE_CLIENT_SECRET=your-google-client-secret-here

# Update this based on your deployment
VITE_OAUTH_REDIRECT_URI=http://localhost:5173/auth/callback
```

## Step 3: OAuth Scopes

The application requests the following scopes:
- `openid` - For OpenID Connect identity
- `email` - For user's email address
- `profile` - For user's basic profile information
- `https://www.googleapis.com/auth/gmail.readonly` - For Gmail access
- `https://www.googleapis.com/auth/drive.readonly` - For Google Drive access

## Step 4: Security Features

### CSRF Protection
- State parameter is generated and verified for each OAuth flow
- State is stored in sessionStorage and cleared after use

### Token Management
- Access tokens are automatically refreshed when expired
- Refresh tokens are securely stored
- Tokens are automatically revoked on logout

### Secure Storage
- Tokens are stored in localStorage (consider upgrading to secure httpOnly cookies for production)
- User data is encrypted in storage

## Step 5: API Integration

### Available Methods

#### Authentication
- `authService.loginWithGoogle()` - Initiate Google OAuth flow
- `authService.handleGoogleCallback(code, state)` - Handle OAuth callback
- `authService.logout()` - Logout and revoke tokens

#### Google API Access
- `googleOAuthService.getGmailMessages(query, maxResults)` - Access Gmail
- `googleOAuthService.getDriveFiles(query, maxResults)` - Access Google Drive
- `googleOAuthService.getUserProfile()` - Get user profile
- `googleOAuthService.makeAuthenticatedRequest(url, options)` - Make any Google API call

## Step 6: Usage Examples

### Basic Authentication Flow
```javascript
// Initiate login
await authService.loginWithGoogle()

// Check authentication status
const isAuthenticated = authService.isAuthenticated()
const authMethod = authService.getAuthMethod() // 'google' or 'traditional'
```

### Access Gmail Messages
```javascript
// Get recent emails
const messages = await googleOAuthService.getGmailMessages('is:unread', 10)

// Search for specific emails
const salesEmails = await googleOAuthService.getGmailMessages('subject:sales', 20)
```

### Access Google Drive Files
```javascript
// Get recent files
const files = await googleOAuthService.getDriveFiles('', 10)

// Search for spreadsheets
const spreadsheets = await googleOAuthService.getDriveFiles('mimeType="application/vnd.google-apps.spreadsheet"', 5)
```

## Step 7: Production Deployment

### Security Considerations
1. **HTTPS Required**: Google OAuth requires HTTPS in production
2. **Secure Storage**: Consider using secure httpOnly cookies instead of localStorage
3. **Environment Variables**: Never expose client secret in frontend code (use backend proxy)
4. **Domain Validation**: Ensure redirect URIs match your production domain

### Backend Integration
For production, consider:
1. Moving OAuth token exchange to your backend
2. Using backend proxy for Google API calls
3. Implementing proper session management
4. Adding rate limiting and security headers

## Step 8: Testing

### Development Testing
1. Start the development server: `npm run dev`
2. Navigate to `http://localhost:5173/login`
3. Click "Continue with Google"
4. Complete OAuth flow
5. Verify successful authentication and API access

### Troubleshooting
- Check browser console for OAuth errors
- Verify redirect URI matches Google Cloud Console settings
- Ensure all required APIs are enabled
- Check network tab for failed API requests

## Step 9: Integration with Existing System

The OAuth system integrates seamlessly with your existing authentication:
- Users can choose between traditional login or Google OAuth
- Both methods store user data in the same format
- Restaurant data fetching works with both authentication methods
- Logout clears both traditional and Google auth tokens

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify your Google Cloud Console configuration
3. Ensure all environment variables are set correctly
4. Test with incognito/private browsing mode