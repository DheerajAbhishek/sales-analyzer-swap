import { restaurantMappingService } from "./api.js";

// Service for managing user-defined restaurant mappings
export const userRestaurantMappingService = {
  // Get all user restaurant mappings (try backend first, fallback to localStorage)
  async getUserRestaurantMappings() {
    try {
      // Try to get from backend first
      const backendResult =
        await restaurantMappingService.getRestaurantMappings();

      if (backendResult.success && backendResult.data) {
        // Save to localStorage as backup
        localStorage.setItem(
          "userRestaurantMappings",
          JSON.stringify(backendResult.data),
        );
        return backendResult.data;
      }
    } catch (error) {
      console.warn(
        "Failed to fetch mappings from backend, using localStorage:",
        error,
      );
    }

    // Fallback to localStorage
    try {
      const mappings = localStorage.getItem("userRestaurantMappings");
      return mappings ? JSON.parse(mappings) : [];
    } catch (error) {
      console.error("Error parsing user restaurant mappings:", error);
      return [];
    }
  },

  // Save user restaurant mappings (save to both backend and localStorage)
  async saveUserRestaurantMappings(mappings) {
    let backendSuccess = false;

    try {
      // Save to backend first
      const backendResult =
        await restaurantMappingService.saveRestaurantMappings(mappings);
      backendSuccess = backendResult.success;

      if (!backendSuccess) {
        console.warn("Backend save failed:", backendResult.error);
      }
    } catch (error) {
      console.warn("Failed to save mappings to backend:", error);
    }

    try {
      // Always save to localStorage as backup/cache
      localStorage.setItem("userRestaurantMappings", JSON.stringify(mappings));

      // Dispatch event to notify other components
      window.dispatchEvent(
        new CustomEvent("userRestaurantMappingsUpdated", {
          detail: { mappings, backendSaved: backendSuccess },
        }),
      );

      return {
        success: true,
        backendSaved: backendSuccess,
        message: backendSuccess
          ? "Saved successfully"
          : "Saved locally (backend unavailable)",
      };
    } catch (error) {
      console.error("Error saving user restaurant mappings:", error);
      return { success: false, error: error.message };
    }
  },

  // Find restaurant info by platform ID
  async findRestaurantByPlatformId(platformId) {
    const mappings = await this.getUserRestaurantMappings();

    for (const restaurant of mappings) {
      for (const [channel, mappedPlatformId] of Object.entries(
        restaurant.platforms,
      )) {
        if (mappedPlatformId === platformId) {
          return {
            restaurantName: restaurant.name,
            channel: channel,
            restaurantId: restaurant.id,
            restaurant: restaurant,
          };
        }
      }
    }

    return null;
  },

  // Get all platform IDs for a restaurant
  async getRestaurantPlatformIds(restaurantId) {
    const mappings = await this.getUserRestaurantMappings();
    const restaurant = mappings.find((r) => r.id === restaurantId);

    if (!restaurant) return [];

    return Object.values(restaurant.platforms).filter(
      (id) => id && id.trim() !== "",
    );
  },

  // Get unused platform IDs
  async getUnusedPlatformIds(allPlatformIds) {
    const mappings = await this.getUserRestaurantMappings();
    const usedIds = new Set();

    mappings.forEach((restaurant) => {
      Object.values(restaurant.platforms).forEach((platformId) => {
        if (platformId) usedIds.add(platformId);
      });
    });

    return allPlatformIds.filter((id) => !usedIds.has(id));
  },

  // Initialize default mappings for new user
  async initializeDefaultMappings(platformIds) {
    const existingMappings = await this.getUserRestaurantMappings();

    if (existingMappings.length > 0) {
      return existingMappings; // Don't overwrite existing mappings
    }

    // Create default restaurant for each platform ID
    const defaultMappings = platformIds.map((platformId, index) => ({
      id: `restaurant_${Date.now()}_${index}`,
      name: `Restaurant ${index + 1}`,
      platforms: {
        [this.guessChannelForId(platformId)]: platformId,
      },
      createdAt: new Date().toISOString(),
    }));

    await this.saveUserRestaurantMappings(defaultMappings);
    return defaultMappings;
  },

  // Guess channel based on platform ID pattern
  guessChannelForId(platformId) {
    if (platformId.includes("subs")) return "subs";
    if (platformId.length === 6) return "swiggy"; // Swiggy IDs are typically 6 digits
    if (platformId.length === 8) return "zomato"; // Zomato IDs are typically 8 digits
    return "zomato"; // Default fallback
  },

  // Create restaurant-to-platform mapping for API calls
  async createApiMapping() {
    const mappings = await this.getUserRestaurantMappings();
    const apiMapping = {};

    mappings.forEach((restaurant) => {
      const restaurantKey = restaurant.id;
      apiMapping[restaurantKey] = {
        name: restaurant.name,
        zomato: restaurant.platforms.zomato || "",
        swiggy: restaurant.platforms.swiggy || "",
        takeaway: restaurant.platforms.takeaway || "",
        subs: restaurant.platforms.subs || "",
      };
    });

    return apiMapping;
  },

  // Clear all mappings (for testing/reset)
  async clearMappings() {
    localStorage.removeItem("userRestaurantMappings");
    window.dispatchEvent(new CustomEvent("userRestaurantMappingsCleared"));

    // Note: We don't delete from backend here as that would require a separate API call
    // You may want to add a backend delete endpoint if needed
  },

  // Sync local data with backend (useful for conflict resolution)
  async syncWithBackend() {
    try {
      const backendResult =
        await restaurantMappingService.getRestaurantMappings();

      if (backendResult.success) {
        localStorage.setItem(
          "userRestaurantMappings",
          JSON.stringify(backendResult.data),
        );

        window.dispatchEvent(
          new CustomEvent("userRestaurantMappingsUpdated", {
            detail: { mappings: backendResult.data, backendSaved: true },
          }),
        );

        return { success: true, data: backendResult.data };
      }

      return { success: false, error: backendResult.error };
    } catch (error) {
      console.error("Error syncing with backend:", error);
      return { success: false, error: error.message };
    }
  },
};
