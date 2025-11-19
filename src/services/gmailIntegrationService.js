import { googleOAuthService } from "./googleOAuthService.js";
import { securePost, secureFetch } from "../utils/secureApiClient.js";

const API_BASE_URL =
  "https://p28ja8leg9.execute-api.ap-south-1.amazonaws.com/Production";

class GmailIntegrationService {
  constructor() {
    this.api_base = API_BASE_URL;
    // Specific Gmail API endpoints
    this.gmail_tokens_url = `${API_BASE_URL}/gmail/tokens`;
    this.gmail_process_url = `${API_BASE_URL}/gmail/process`;
  }

  /**
   * Store Gmail OAuth tokens in the backend
   */
  async storeGmailTokens(userEmail, tokens) {
    try {
      console.log("🔄 Storing Gmail tokens for user:", userEmail);

      const response = await securePost(this.gmail_tokens_url, {
        user_email: userEmail,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: tokens.expiresIn || 3600,
        id_token: tokens.idToken,
      });

      const data = await response.json();

      if (response.ok) {
        console.log("✅ Gmail tokens stored successfully");
        return {
          success: true,
          message: data.message,
        };
      } else {
        console.error("❌ Failed to store Gmail tokens:", data);
        return {
          success: false,
          message: data.error || "Failed to store Gmail tokens",
        };
      }
    } catch (error) {
      console.error("Error storing Gmail tokens:", error);
      return {
        success: false,
        message: "Network error occurred while storing tokens",
      };
    }
  }

  /**
   * Check if user has valid Gmail tokens stored
   */
  async checkGmailTokens(userEmail) {
    try {
      console.log("🔍 Checking Gmail tokens for user:", userEmail);
      console.log(
        "🧪 TESTING: Using POST method to check tokens (temporary workaround)",
      );

      // Temporary: Use POST to the base tokens URL with user_email in body
      const response = await securePost(this.gmail_tokens_url, {
        action: "check_tokens",
        user_email: userEmail,
      });

      console.log("📊 Response status:", response.status);
      console.log("📊 Response ok:", response.ok);
      console.log(
        "📊 Response headers:",
        Object.fromEntries(response.headers.entries()),
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Response error details:", errorText);
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();
      console.log("📊 Response data:", data);

      if (response.ok) {
        console.log("✅ Gmail token status retrieved:", data);
        return {
          success: true,
          hasTokens: data.has_tokens,
          isExpired: data.is_expired,
          expiresAt: data.expires_at,
        };
      } else if (response.status === 404) {
        console.log("📭 No Gmail tokens found for user");
        return {
          success: true,
          hasTokens: false,
          isExpired: true,
        };
      } else {
        console.error("❌ Failed to check Gmail tokens:", data);
        return {
          success: false,
          message: data.error || "Failed to check Gmail tokens",
        };
      }
    } catch (error) {
      console.error("Error checking Gmail tokens:", error);
      return {
        success: false,
        message: "Network error occurred while checking tokens",
      };
    }
  }

  /**
   * Process emails from a specific sender
   */
  async processEmailsFromSender(userEmail, senderEmail, maxResults = 150) {
    try {
      console.log(
        `🔄 Processing Excel files from ${senderEmail} for user: ${userEmail}`,
      );

      const response = await securePost(this.gmail_process_url, {
        user_email: userEmail,
        sender_email: senderEmail,
        max_results: maxResults,
      });

      const data = await response.json();

      if (response.ok) {
        console.log("✅ Email processing completed:", data);
        return {
          success: true,
          processedFiles: data.processed_files,
          files: data.files,
          webhookTriggered: data.webhook_triggered,
          message: data.message,
        };
      } else {
        console.error("❌ Email processing failed:", data);
        return {
          success: false,
          message: data.error || "Failed to process emails",
        };
      }
    } catch (error) {
      console.error("Error processing emails:", error);
      return {
        success: false,
        message: "Network error occurred while processing emails",
      };
    }
  }

  /**
   * Remove Gmail tokens for a user
   */
  async removeGmailTokens(userEmail) {
    try {
      console.log("🗑️ Removing Gmail tokens for user:", userEmail);

      const response = await secureFetch(
        `${this.gmail_tokens_url}/${encodeURIComponent(userEmail)}`,
        {
          method: "DELETE",
        },
      );

      const data = await response.json();

      if (response.ok) {
        console.log("✅ Gmail tokens removed successfully");
        return {
          success: true,
          message: data.message,
        };
      } else {
        console.error("❌ Failed to remove Gmail tokens:", data);
        return {
          success: false,
          message: data.error || "Failed to remove Gmail tokens",
        };
      }
    } catch (error) {
      console.error("Error removing Gmail tokens:", error);
      return {
        success: false,
        message: "Network error occurred while removing tokens",
      };
    }
  }

  /**
   * Initialize Gmail integration for a user
   * This should be called after successful OAuth authentication
   */
  async initializeGmailIntegration(userEmail) {
    try {
      console.log("🚀 Initializing Gmail integration for user:", userEmail);

      // Get tokens from Google OAuth service
      const tokens = googleOAuthService.getStoredTokens();

      if (!tokens) {
        console.error("❌ No Google OAuth tokens found");
        return {
          success: false,
          message: "No Google OAuth tokens found. Please authenticate first.",
        };
      }

      // Store tokens in backend
      const storeResult = await this.storeGmailTokens(userEmail, tokens);

      if (storeResult.success) {
        console.log("✅ Gmail integration initialized successfully");
        return {
          success: true,
          message: "Gmail integration initialized successfully",
          tokenStatus: {
            hasTokens: true,
            isExpired: false,
          },
        };
      } else {
        return storeResult;
      }
    } catch (error) {
      console.error("Error initializing Gmail integration:", error);
      return {
        success: false,
        message: "Failed to initialize Gmail integration",
      };
    }
  }

  /**
   * Check if Gmail integration is properly set up for a user
   */
  async isGmailIntegrationReady(userEmail) {
    try {
      const tokenStatus = await this.checkGmailTokens(userEmail);

      if (!tokenStatus.success) {
        return {
          ready: false,
          reason: "Unable to check token status",
        };
      }

      if (!tokenStatus.hasTokens) {
        return {
          ready: false,
          reason: "No Gmail tokens found",
        };
      }

      if (tokenStatus.isExpired) {
        return {
          ready: false,
          reason: "Gmail tokens have expired",
        };
      }

      return {
        ready: true,
        tokenStatus: tokenStatus,
      };
    } catch (error) {
      console.error("Error checking Gmail integration readiness:", error);
      return {
        ready: false,
        reason: "Error checking integration status",
      };
    }
  }

  /**
   * Get Gmail authorization URL for re-authentication
   */
  getGmailAuthUrl() {
    return googleOAuthService.getAuthUrl();
  }

  /**
   * Subscribe to Gmail push notifications
   */
  async subscribeToGmailWatch(userEmail) {
    try {
      console.log(
        "🔔 Subscribing to Gmail watch notifications for:",
        userEmail,
      );

      const response = await securePost(`${API_BASE_URL}/gmail/watch/subscribe`, {
        userEmail: userEmail,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log("✅ Gmail watch subscription successful");
        return {
          success: true,
          historyId: data.historyId,
          expiration: data.expiration,
        };
      } else {
        console.error("❌ Failed to subscribe to Gmail watch:", data);
        return {
          success: false,
          message: data.message || "Failed to subscribe to Gmail notifications",
        };
      }
    } catch (error) {
      console.error("Error subscribing to Gmail watch:", error);
      return {
        success: false,
        message: "Network error during subscription",
      };
    }
  }

  /**
   * Process Gmail authentication callback and initialize integration
   */
  async handleGmailAuthCallback(code, state, userEmail) {
    try {
      console.log("🔄 Handling Gmail auth callback for user:", userEmail);

      // Handle OAuth callback
      const oauthResult = await googleOAuthService.handleCallback(code, state);

      if (!oauthResult.success) {
        return {
          success: false,
          message: "OAuth authentication failed",
        };
      }

      // Initialize Gmail integration
      const integrationResult =
        await this.initializeGmailIntegration(userEmail);

      return {
        success: integrationResult.success,
        message: integrationResult.message,
        user: oauthResult.user,
        tokens: oauthResult.tokens,
      };
    } catch (error) {
      console.error("Error handling Gmail auth callback:", error);
      return {
        success: false,
        message: "Failed to complete Gmail authentication",
      };
    }
  }
}

export const gmailIntegrationService = new GmailIntegrationService();
