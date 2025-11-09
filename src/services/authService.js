import { restaurantService } from "./api.js";
import { googleOAuthService } from "./googleOAuthService.js";
import { gmailIntegrationService } from "./gmailIntegrationService.js";
import { autoEmailProcessingService } from "./autoEmailProcessingService.js";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://your-api-gateway-url.amazonaws.com/prod";

class AuthService {
  async login(businessEmail, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ businessEmail, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store auth data
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("token", data.token);

        // Fetch user restaurants after successful login
        try {
          const restaurantData = await restaurantService.getUserRestaurants(
            data.user.businessEmail,
          );
          console.log("User restaurants fetched:", restaurantData);

          // Store restaurant data in localStorage for quick access
          localStorage.setItem(
            "userRestaurants",
            JSON.stringify(restaurantData),
          );

          return {
            success: true,
            user: data.user,
            token: data.token,
            restaurants: restaurantData,
          };
        } catch (restaurantError) {
          console.warn("Failed to fetch user restaurants:", restaurantError);
          // Don't fail login if restaurant fetch fails
          return {
            success: true,
            user: data.user,
            token: data.token,
            restaurants: { restaurantIds: [], objectKeysCount: 0 },
          };
        }
      } else {
        return {
          success: false,
          message: data.message || "Login failed",
        };
      }
    } catch (error) {
      console.error("Login error:", error);
      return {
        success: false,
        message: "Network error occurred",
      };
    }
  }

  async signup(userData) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          message: data.message || "Account created successfully",
        };
      } else {
        return {
          success: false,
          message: data.message || "Signup failed",
        };
      }
    } catch (error) {
      console.error("Signup error:", error);
      return {
        success: false,
        message: "Network error occurred",
      };
    }
  }

  async verifyToken(token) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        // Fetch user restaurants after successful token verification
        try {
          const restaurantData = await restaurantService.getUserRestaurants(
            data.user.businessEmail,
          );
          console.log("User restaurants refreshed:", restaurantData);

          // Update stored restaurant data
          localStorage.setItem(
            "userRestaurants",
            JSON.stringify(restaurantData),
          );

          return {
            success: true,
            user: data.user,
            restaurants: restaurantData,
          };
        } catch (restaurantError) {
          console.warn("Failed to refresh user restaurants:", restaurantError);
          // Don't fail verification if restaurant fetch fails
          return {
            success: true,
            user: data.user,
            restaurants: JSON.parse(
              localStorage.getItem("userRestaurants") ||
                '{"restaurantIds":[],"objectKeysCount":0}',
            ),
          };
        }
      } else {
        return {
          success: false,
          message: data.message || "Token verification failed",
        };
      }
    } catch (error) {
      console.error("Token verification error:", error);
      return {
        success: false,
        message: "Network error occurred",
      };
    }
  }

  logout() {
    console.log("🚪 AuthService: logout() called - clearing localStorage");
    console.trace("Logout call stack:");
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("userRestaurants");
    localStorage.removeItem("authMethod");
  }

  getCurrentUser() {
    const user = localStorage.getItem("user");
    return user ? JSON.parse(user) : null;
  }

  getToken() {
    return localStorage.getItem("token");
  }

  getUserRestaurants() {
    const restaurants = localStorage.getItem("userRestaurants");
    return restaurants
      ? JSON.parse(restaurants)
      : { restaurantIds: [], objectKeysCount: 0 };
  }

  // Google OAuth Methods - SIMPLIFIED
  async handleGoogleCallback(code, state) {
    try {
      console.log("🚀 Starting Google OAuth callback handling");

      const result = await googleOAuthService.handleCallback(code, state);

      if (result.success) {
        console.log("✅ OAuth token exchange successful");
        console.log("🔍 Context:", result.context);
        console.log("� User email:", result.user.email);

        // Check if user exists in our database
        const userCheck = await this.verifyGoogleUserExists(result.user.email);
        console.log("👤 User check result:", userCheck);

        if (userCheck.userExists) {
          // User exists - proceed with login
          console.log("✅ Existing user - logging in directly");

          const userData = {
            id: result.user.id,
            email: result.user.email,
            businessEmail: result.user.email,
            name: result.user.name,
            picture: result.user.picture,
            emailVerified: result.user.emailVerified,
            authMethod: userCheck.user.authMethod,
          };

          localStorage.setItem("user", JSON.stringify(userData));
          localStorage.setItem("authMethod", userCheck.user.authMethod);

          try {
            const restaurantData = await restaurantService.getUserRestaurants(
              userData.email,
            );
            localStorage.setItem(
              "userRestaurants",
              JSON.stringify(restaurantData),
            );

            return {
              success: true,
              user: userData,
              restaurants: restaurantData,
              authMethod: userCheck.user.authMethod,
              isNewUser: false,
            };
          } catch (restaurantError) {
            console.warn("Failed to fetch user restaurants:", restaurantError);
            return {
              success: true,
              user: userData,
              restaurants: { restaurantIds: [], objectKeysCount: 0 },
              authMethod: userCheck.user.authMethod,
              isNewUser: false,
            };
          }
        } else {
          // User doesn't exist
          if (result.context === "login") {
            console.log(
              "� New user detected during LOGIN - redirecting to signup",
            );
            googleOAuthService.clearTokens();

            return {
              success: false,
              shouldRedirectToSignup: true,
              message: "Account not found. Please sign up first.",
              googleUserData: {
                googleId: result.user.id,
                email: result.user.email,
                name: result.user.name,
                picture: result.user.picture,
                emailVerified: result.user.emailVerified,
              },
            };
          } else {
            // This is signup - proceed to signup form
            console.log("🆕 New user signup - showing signup form");
            return {
              success: true,
              isNewUser: true,
              googleUserData: {
                googleId: result.user.id,
                email: result.user.email,
                name: result.user.name,
                picture: result.user.picture,
                emailVerified: result.user.emailVerified,
              },
              authMethod: "google",
            };
          }
        }
      } else {
        console.warn("❌ OAuth token exchange failed");
        return {
          success: false,
          message: result.error || "Google authentication failed",
        };
      }
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      throw error;
    }
  }

  async verifyGoogleUserExists(email) {
    try {
      console.log("🔍 Checking if Google user exists:", email);

      const response = await fetch(
        `${API_BASE_URL}/auth/check-user?email=${encodeURIComponent(email)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const data = await response.json();

      console.log("📋 User existence check response:", {
        status: response.status,
        data: data,
      });

      if (!response.ok || !data.success) {
        console.error("❌ User check failed:", data.message);
        return {
          userExists: false,
        };
      }

      if (data.exists) {
        // User exists - determine auth method
        if (data.hasGoogleId) {
          console.log("✅ Existing Google user found");
          return {
            userExists: true,
            user: {
              authMethod: data.authMethod,
              restaurantName: data.restaurantName,
              hasPassword: data.hasPassword || false, // Check if user also has password
            },
          };
        } else {
          console.log("🔗 Existing user found (needs linking)");
          return {
            userExists: true,
            user: {
              authMethod: "traditional",
              restaurantName: data.restaurantName,
              requiresLinking: true,
            },
          };
        }
      } else {
        // User doesn't exist
        console.log("❌ New user detected");
        return {
          userExists: false,
        };
      }
    } catch (error) {
      console.error("Error checking user existence:", error);
      // If check fails, assume user doesn't exist
      return {
        userExists: false,
      };
    }
  }

  getAuthMethod() {
    return localStorage.getItem("authMethod") || "traditional";
  }

  // Verify Google authentication status - SIMPLIFIED
  async verifyGoogleAuth() {
    try {
      const user = this.getCurrentUser();
      if (!user) {
        return { success: false, message: "No user found" };
      }

      // Fetch user restaurants
      try {
        const restaurantData = await restaurantService.getUserRestaurants(
          user.email,
        );
        return {
          success: true,
          user: user,
          restaurants: restaurantData,
        };
      } catch (restaurantError) {
        console.warn(
          "Failed to fetch restaurants for Google user:",
          restaurantError,
        );
        return {
          success: true,
          user: user,
          restaurants: { restaurantIds: [], objectKeysCount: 0 },
        };
      }
    } catch (error) {
      console.error("Google auth verification error:", error);
      return { success: false, message: "Authentication verification failed" };
    }
  }

  // Initiate Google OAuth login - SIMPLIFIED
  async loginWithGoogle() {
    try {
      console.log("🚀 Starting Google OAuth login");

      // Clear previous session data
      sessionStorage.removeItem("oauth_context");
      sessionStorage.setItem("oauth_context", "login");

      // Start OAuth flow for login
      googleOAuthService.initiateOAuth(false); // isNewUser = false

      return {
        success: true,
        message: "Redirecting to Google for authentication...",
      };
    } catch (error) {
      console.error("Failed to initiate Google OAuth login:", error);
      return {
        success: false,
        message: "Failed to start Google authentication",
      };
    }
  }

  // Initiate Google OAuth signup - SIMPLIFIED
  async signupWithGoogle() {
    try {
      console.log("🚀 Starting Google OAuth signup");

      // Clear previous session data
      sessionStorage.removeItem("oauth_context");
      sessionStorage.setItem("oauth_context", "signup");

      // Start OAuth flow for signup
      googleOAuthService.initiateOAuth(true); // isNewUser = true

      return {
        success: true,
        message: "Redirecting to Google for authentication...",
      };
    } catch (error) {
      console.error("Failed to initiate Google OAuth signup:", error);
      return {
        success: false,
        message: "Failed to start Google authentication",
      };
    }
  }

  // Complete Google signup/account linking
  async completeGoogleSignup(userData) {
    try {
      console.log(
        "🔄 Completing Google signup/account linking for:",
        userData.email,
      );

      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (response.ok) {
        console.log("✅ Google signup/linking completed successfully");

        // Use email as businessEmail if businessEmail is not provided
        const businessEmail = userData.businessEmail || userData.email;
        console.log("📧 Using businessEmail:", businessEmail);

        // Store user data FIRST before fetching restaurants
        const userInfo = {
          id: userData.googleId,
          email: userData.email,
          businessEmail: businessEmail,
          name: userData.name,
          picture: userData.picture,
          emailVerified: userData.emailVerified,
          authMethod: "google",
          restaurantName: userData.restaurantName,
        };

        // Save to localStorage BEFORE calling getUserRestaurants
        localStorage.setItem("user", JSON.stringify(userInfo));
        localStorage.setItem("authMethod", "google");

        console.log("✅ User data saved to localStorage:", businessEmail);

        // Store Gmail tokens for email processing
        try {
          console.log("🔄 Initializing Gmail integration...");
          await gmailIntegrationService.initializeGmailIntegration(
            businessEmail,
          );
          console.log("✅ Gmail integration initialized for new user");

          // Subscribe to Gmail push notifications for real-time processing
          console.log("🔔 Subscribing to Gmail watch notifications...");
          const watchResult =
            await gmailIntegrationService.subscribeToGmailWatch(businessEmail);
          if (watchResult.success) {
            console.log("✅ Gmail watch subscription successful");
          } else {
            console.warn(
              "⚠️ Gmail watch subscription failed:",
              watchResult.message,
            );
          }
        } catch (gmailError) {
          console.warn(
            "⚠️ Failed to initialize Gmail integration:",
            gmailError,
          );
          // Don't block - continue with signup
        }

        // Start auto-processing emails immediately (don't wait for it to complete)
        console.log("🚀 Starting auto email processing for:", businessEmail);
        autoEmailProcessingService
          .startAutoProcessing(businessEmail)
          .then(() => console.log("✅ Auto email processing completed"))
          .catch((err) =>
            console.warn("⚠️ Auto email processing had errors:", err),
          );

        // Fetch user restaurants - now localStorage has the email
        try {
          console.log("🔍 Fetching restaurants for:", businessEmail);
          const restaurantData =
            await restaurantService.getUserRestaurants(businessEmail);
          console.log("✅ Restaurants fetched:", restaurantData);
          localStorage.setItem(
            "userRestaurants",
            JSON.stringify(restaurantData),
          );

          return {
            success: true,
            user: userInfo,
            restaurants: restaurantData,
            message: data.message || "Account setup completed successfully",
          };
        } catch (restaurantError) {
          console.warn(
            "Failed to fetch restaurants after Google signup:",
            restaurantError,
          );
          return {
            success: true,
            user: userInfo,
            restaurants: { restaurantIds: [], objectKeysCount: 0 },
            message: data.message || "Account setup completed successfully",
          };
        }
      } else {
        return {
          success: false,
          message: data.message || "Failed to complete Google signup",
          errorType: data.errorType,
        };
      }
    } catch (error) {
      console.error("Google signup completion error:", error);
      return {
        success: false,
        message: "Network error occurred during signup completion",
      };
    }
  }

  // Link Google account to existing traditional account
  async linkGoogleAccount(userData) {
    try {
      console.log(
        "🔗 Linking Google account to existing account:",
        userData.email,
      );

      // For account linking, we only need the Google data and force link flag
      // The existing account already has restaurant details
      const linkData = {
        googleId: userData.googleId,
        email: userData.email,
        businessEmail: userData.email,
        name: userData.name,
        picture: userData.picture,
        emailVerified: userData.emailVerified,
        forceLinkAccount: true, // This tells the backend to proceed with linking
        // Add minimal required fields to pass validation
        restaurantName: "Existing Account", // Placeholder - will be ignored in linking
        phoneNumber: "0000000000", // Placeholder - will be ignored in linking
        state: "N/A", // Placeholder - will be ignored in linking
        city: "N/A", // Placeholder - will be ignored in linking
      };

      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(linkData),
      });

      const data = await response.json();

      if (response.ok) {
        console.log("✅ Google account linking completed successfully");

        // Store updated user data
        const userInfo = {
          id: userData.googleId,
          email: userData.email,
          businessEmail: userData.email,
          name: userData.name,
          picture: userData.picture,
          emailVerified: userData.emailVerified,
          authMethod: "linked", // Changed from 'google' to 'linked'
        };

        localStorage.setItem("user", JSON.stringify(userInfo));
        localStorage.setItem("authMethod", "linked");

        // Initialize Gmail integration and subscribe to watch notifications
        try {
          console.log(
            "🔄 Initializing Gmail integration for linked account...",
          );
          await gmailIntegrationService.initializeGmailIntegration(
            userInfo.businessEmail,
          );
          console.log("✅ Gmail integration initialized");

          // Subscribe to Gmail push notifications
          console.log("🔔 Subscribing to Gmail watch notifications...");
          const watchResult =
            await gmailIntegrationService.subscribeToGmailWatch(
              userInfo.businessEmail,
            );
          if (watchResult.success) {
            console.log("✅ Gmail watch subscription successful");
          } else {
            console.warn(
              "⚠️ Gmail watch subscription failed:",
              watchResult.message,
            );
          }
        } catch (gmailError) {
          console.warn(
            "⚠️ Failed to initialize Gmail integration:",
            gmailError,
          );
          // Don't block - continue with linking
        }

        // Fetch user restaurants
        try {
          const restaurantData = await restaurantService.getUserRestaurants(
            userInfo.businessEmail,
          );
          localStorage.setItem(
            "userRestaurants",
            JSON.stringify(restaurantData),
          );

          return {
            success: true,
            user: userInfo,
            restaurants: restaurantData,
            message: data.message || "Google account linked successfully",
          };
        } catch (restaurantError) {
          console.warn(
            "Failed to fetch restaurants after account linking:",
            restaurantError,
          );
          return {
            success: true,
            user: userInfo,
            restaurants: { restaurantIds: [], objectKeysCount: 0 },
            message: data.message || "Google account linked successfully",
          };
        }
      } else {
        console.error("❌ Account linking failed:", data);
        return {
          success: false,
          message: data.message || "Failed to link Google account",
          errorType: data.errorType,
        };
      }
    } catch (error) {
      console.error("Google account linking error:", error);
      return {
        success: false,
        message: "Network error occurred during account linking",
      };
    }
  }

  isAuthenticated() {
    const user = this.getCurrentUser();
    const authMethod = this.getAuthMethod();

    if (authMethod === "google") {
      return !!user;
    } else {
      return !!this.getToken();
    }
  }
}

export const authService = new AuthService();
