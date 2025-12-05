import { API_BASE_URL } from "../utils/constants";
import { secureFetch, securePost, rateLimitedFetch } from "../utils/secureApiClient";

// Helper function to get user info for API calls
const getUserInfo = () => {
  const user = localStorage.getItem("user");
  if (!user) return null;

  let parsed;
  try {
    parsed = JSON.parse(user);
  } catch (error) {
    console.error("Failed to parse user data from localStorage:", error);
    return null;
  }
  // Ensure businessEmail is set (for Google users, it might only be in 'email')
  if (!parsed.businessEmail && parsed.email) {
    parsed.businessEmail = parsed.email;
  }
  return parsed;
};

// Helper function to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  const user = getUserInfo();

  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(user?.businessEmail && { "business-email": user.businessEmail }),
  };
};

export const uploadFileService = {
  async getUploadUrl(filename, contentType = "application/octet-stream") {
    const user = getUserInfo();
    const businessEmail = user?.businessEmail || null;
    const payload = businessEmail
      ? { filename, contentType, businessEmail }
      : { filename, contentType };

    const response = await securePost(`${API_BASE_URL}/upload-url`, payload);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to get upload URL");
    }

    const data = await response.json();
    return data.body ? JSON.parse(data.body) : data;
  },

  async uploadFile(url, fields, file) {
    // Use FormData for POST upload (avoids CORS preflight)
    const formData = new FormData();

    // Add all the fields from presigned POST
    Object.keys(fields).forEach((key) => {
      formData.append(key, fields[key]);
    });

    // File must be the last field
    formData.append("file", file);

    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} ${errorText}`);
    }

    return response;
  },

  // Convenience method to handle the full upload flow
  async uploadFileComplete(file) {
    try {
      // Step 1: Get presigned POST data
      const { url, fields, key } = await this.getUploadUrl(
        file.name,
        file.type || "application/octet-stream",
      );

      // Step 2: Upload to S3 using POST with FormData
      await this.uploadFile(url, fields, file);

      return { success: true, key };
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  },

  async processBatch(fileKeys) {
    const user = getUserInfo();
    const businessEmail = user?.businessEmail || null;
    const payload = businessEmail
      ? { files: fileKeys, businessEmail }
      : { files: fileKeys };

    const response = await securePost(`${API_BASE_URL}/batch-process`, payload);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Batch processing failed to start.");
    }

    const data = await response.json();
    return data.body ? JSON.parse(data.body) : data;
  },

  async getJobStatus(jobId) {
    const response = await rateLimitedFetch(`${API_BASE_URL}/job-status?jobId=${jobId}`);

    if (!response.ok) {
      throw new Error("Failed to get job status");
    }

    const data = await response.json();
    const result = data.body ? JSON.parse(data.body) : data;

    // Check if job completed successfully and refresh restaurants
    if (result.status === "SUCCEEDED" || result.status === "COMPLETED") {
      try {
        await restaurantService.refreshUserRestaurants();
      } catch (refreshError) {
        console.warn(
          "Failed to refresh restaurants after job completion:",
          refreshError,
        );
        // Don't fail the job status if restaurant refresh fails
      }
    }

    return result;
  },
};
export const reportService = {
  async getConsolidatedInsights(
    restaurantId,
    startDate,
    endDate,
    groupBy = null,
  ) {
    let apiUrl = `${API_BASE_URL}/consolidated-insights?restaurantId=${restaurantId}&startDate=${startDate}&endDate=${endDate}`;
    const businessEmail = localStorage.getItem("user")
      ? JSON.parse(localStorage.getItem("user")).businessEmail
      : null;
    if (businessEmail) {
      apiUrl += `&businessEmail=${encodeURIComponent(businessEmail)}`;
    }
    if (groupBy && groupBy !== "total") {
      apiUrl += `&groupBy=${groupBy}`;
    }

    const response = await rateLimitedFetch(apiUrl);

    if (!response.ok) {
      throw new Error("Failed to get consolidated insights");
    }

    return response.json();
  },
};

export const expenseService = {
  async saveExpenses(restaurantId, month, expenses) {
    const payload = {
      restaurantId,
      month,
      expenses,
    };

    const response = await securePost(`${API_BASE_URL}/expenses`, payload);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to save data.");
    }

    return response.json();
  },

  async getExpenses(restaurantId, month) {
    const response = await secureFetch(
      `${API_BASE_URL}/expenses?restaurantId=${restaurantId}&month=${month}`,
      { method: "GET" }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Could not load saved expenses.");
    }

    return response.json();
  },
};

export const restaurantService = {
  // Cache DISABLED - Always fetch from API for real-time data
  async getUserRestaurants(businessEmail = null) {
    try {
      // Get business email from localStorage if not provided
      const email =
        businessEmail ||
        (localStorage.getItem("user")
          ? JSON.parse(localStorage.getItem("user")).businessEmail
          : null);

      if (!email) {
        throw new Error("Business email not found");
      }

      // Always make API request (no caching)
      const response = await secureFetch(
        `${API_BASE_URL}/user-restaurants?businessEmail=${encodeURIComponent(email)}`,
        { method: "GET" }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || "Failed to fetch user restaurants",
        );
      }

      const data = await response.json();
      const result = data.body ? JSON.parse(data.body) : data;
      return result;
    } catch (error) {
      console.error("Error fetching user restaurants:", error);
      throw error;
    }
  },

  async refreshUserRestaurants() {
    try {
      // Get email from localStorage
      let email = null;
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        email = user.businessEmail || user.email;
      }

      if (!email) {
        throw new Error("User email not found in localStorage");
      }
      const restaurantData = await this.getUserRestaurants(email);

      // Dispatch custom event to notify components of the update
      window.dispatchEvent(
        new CustomEvent("userRestaurantsUpdated", {
          detail: restaurantData,
        }),
      );

      return restaurantData;
    } catch (error) {
      console.error("Error refreshing user restaurants:", error);
      throw error;
    }
  },
};

// Restaurant Mapping API Service
export const restaurantMappingService = {
  // Save user restaurant mappings to backend
  async saveRestaurantMappings(mappings) {
    try {
      const user = getUserInfo();
      if (!user?.businessEmail) {
        throw new Error("User email not found");
      }
      const payload = {
        businessEmail: user.businessEmail,
        mappings: mappings,
        updatedAt: new Date().toISOString(),
      };

      const response = await securePost(`${API_BASE_URL}/restaurant-mappings`, payload);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Save failed with error:", errorData);
        throw new Error(
          errorData.message || "Failed to save restaurant mappings",
        );
      }

      const data = await response.json();
      return {
        success: true,
        data: data.body ? JSON.parse(data.body) : data,
      };
    } catch (error) {
      console.error("Error saving restaurant mappings:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  // Get user restaurant mappings from backend
  async getRestaurantMappings() {
    try {
      const user = getUserInfo();
      if (!user?.businessEmail) {
        throw new Error("User email not found");
      }

      const response = await secureFetch(
        `${API_BASE_URL}/restaurant-mappings?businessEmail=${encodeURIComponent(user.businessEmail)}`,
        { method: "GET" }
      );

      if (!response.ok) {
        if (response.status === 404) {
          // No mappings found - return empty array
          return {
            success: true,
            data: [],
          };
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || "Failed to fetch restaurant mappings",
        );
      }

      const data = await response.json();
      // Handle different response formats
      let mappings = [];
      if (data.body) {
        // If wrapped in body (API Gateway proxy integration)
        const parsed = JSON.parse(data.body);
        mappings = parsed.mappings || [];
      } else {
        // Direct response
        mappings = data.mappings || [];
      }
      return {
        success: true,
        data: mappings,
      };
    } catch (error) {
      console.error("Error fetching restaurant mappings:", error);
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }
  },

  // Save restaurant metadata (names, custom settings) to backend
  async saveRestaurantMetadata(metadata) {
    try {
      const user = getUserInfo();
      if (!user?.businessEmail) {
        throw new Error("User email not found");
      }

      const payload = {
        businessEmail: user.businessEmail,
        metadata: metadata,
        updatedAt: new Date().toISOString(),
      };

      const response = await securePost(`${API_BASE_URL}/restaurant-metadata`, payload);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || "Failed to save restaurant metadata",
        );
      }

      const data = await response.json();
      return {
        success: true,
        data: data.body ? JSON.parse(data.body) : data,
      };
    } catch (error) {
      console.error("Error saving restaurant metadata:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  // Get restaurant metadata from backend
  async getRestaurantMetadata() {
    try {
      const user = getUserInfo();
      if (!user?.businessEmail) {
        throw new Error("User email not found");
      }

      const response = await secureFetch(
        `${API_BASE_URL}/restaurant-metadata?businessEmail=${encodeURIComponent(user.businessEmail)}`,
        { method: "GET" }
      );

      if (!response.ok) {
        if (response.status === 404) {
          // No metadata found - return empty object
          return {
            success: true,
            data: {},
          };
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || "Failed to fetch restaurant metadata",
        );
      }

      const data = await response.json();
      const metadata = data.body ? JSON.parse(data.body) : data;

      return {
        success: true,
        data: metadata.metadata || {},
      };
    } catch (error) {
      console.error("Error fetching restaurant metadata:", error);
      return {
        success: false,
        error: error.message,
        data: {},
      };
    }
  },
};

// Rista API Service - for fetching restaurant data from Rista POS
export const ristaService = {
  /**
   * Fetch branches from Rista API using the user's API credentials
   * @param {string} apiKey - Rista API key
   * @param {string} apiSecret - Rista API secret
   * @returns {Promise<{success: boolean, branches?: Array, error?: string}>}
   */
  async fetchBranches(apiKey, apiSecret) {
    try {
      const response = await fetch(`${API_BASE_URL}/rista-branches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey,
          secretKey: apiSecret,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || "Failed to fetch branches",
        };
      }

      // Parse response body if needed
      const result = data.body ? JSON.parse(data.body) : data;

      return {
        success: true,
        branches: result.branches || [],
      };
    } catch (error) {
      console.error("Error fetching Rista branches:", error);
      return {
        success: false,
        error: error.message || "Failed to connect to Rista API",
      };
    }
  },

  /**
   * Fetch sales data from Rista API for specified branches, channels, and date range
   * @param {string} apiKey - Rista API key
   * @param {string} apiSecret - Rista API secret
   * @param {Array<string>} branchIds - Array of branch IDs to fetch
   * @param {Array<string>} channels - Array of channel names (e.g., ["Takeaway"])
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  async fetchSales(apiKey, apiSecret, branchIds, channels, startDate, endDate) {
    try {
      const response = await fetch(`${API_BASE_URL}/rista-sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey,
          secretKey: apiSecret,
          branchIds,
          channels,
          startDate,
          endDate,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || "Failed to fetch sales data",
        };
      }

      // Parse response body if needed
      const result = data.body ? JSON.parse(data.body) : data;

      // Response now matches consolidated-insights format
      return {
        success: true,
        data: result,  // Contains: restaurantId, consolidatedInsights, discountBreakdown, etc.
      };
    } catch (error) {
      console.error("Error fetching Rista sales:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch sales data",
      };
    }
  },

  /**
   * Get stored Rista credentials for the current user
   * @returns {Promise<{success: boolean, hasCredentials: boolean, apiKey?: string, apiSecret?: string}>}
   */
  async getCredentials() {
    try {
      const user = getUserInfo();
      if (!user?.businessEmail) {
        return { success: false, error: "User not logged in" };
      }

      const response = await fetch(
        `${API_BASE_URL}/rista-credentials?businessEmail=${encodeURIComponent(user.businessEmail)}`,
        {
          method: "GET",
          headers: getAuthHeaders(),
        }
      );

      const data = await response.json();
      const result = data.body ? JSON.parse(data.body) : data;

      return result;
    } catch (error) {
      console.error("Error fetching Rista credentials:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Save Rista credentials for the current user
   * @param {string} apiKey - Rista API key
   * @param {string} apiSecret - Rista API secret
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async saveCredentials(apiKey, apiSecret) {
    try {
      const user = getUserInfo();
      if (!user?.businessEmail) {
        return { success: false, error: "User not logged in" };
      }

      const response = await fetch(`${API_BASE_URL}/rista-credentials`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ apiKey, apiSecret }),
      });

      const data = await response.json();
      const result = data.body ? JSON.parse(data.body) : data;

      return result;
    } catch (error) {
      console.error("Error saving Rista credentials:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get stored Rista branch mappings for the current user
   * @returns {Promise<{success: boolean, mappings?: Array}>}
   */
  async getMappings() {
    try {
      const user = getUserInfo();
      if (!user?.businessEmail) {
        return { success: false, error: "User not logged in" };
      }

      const response = await fetch(
        `${API_BASE_URL}/rista-mappings?businessEmail=${encodeURIComponent(user.businessEmail)}`,
        {
          method: "GET",
          headers: getAuthHeaders(),
        }
      );

      const data = await response.json();
      const result = data.body ? JSON.parse(data.body) : data;

      return result;
    } catch (error) {
      console.error("Error fetching Rista mappings:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Save Rista branch mappings for the current user
   * @param {Array} mappings - Array of mapping objects
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async saveMappings(mappings) {
    try {
      const user = getUserInfo();
      if (!user?.businessEmail) {
        return { success: false, error: "User not logged in" };
      }

      const response = await fetch(`${API_BASE_URL}/rista-mappings`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ mappings }),
      });

      const data = await response.json();
      const result = data.body ? JSON.parse(data.body) : data;

      return result;
    } catch (error) {
      console.error("Error saving Rista mappings:", error);
      return { success: false, error: error.message };
    }
  },
};
