import { reportService } from "./api.js";

class AutoLoadService {
  /**
   * Format date to YYYY-MM-DD string
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Get restaurant names from userRestaurants data or fetch metadata
   */
  async getRestaurantNames(userRestaurants, restaurantIds) {
    const restaurantNames = [];

    // Try to get names from restaurant mappings first
    if (
      userRestaurants?.restaurantMappings &&
      userRestaurants.restaurantMappings.length > 0
    ) {
      restaurantIds.forEach((id) => {
        const mapping = userRestaurants.restaurantMappings.find(
          (r) => r.id === id,
        );
        if (
          mapping &&
          mapping.name &&
          !mapping.name.startsWith("Restaurant ")
        ) {
          restaurantNames.push({
            id: id,
            name: mapping.name,
            platform: mapping.platforms?.[0] || "unknown",
          });
        } else {
          restaurantNames.push({
            id: id,
            name: `Restaurant ${id}`,
            platform: "unknown",
          });
        }
      });
      return restaurantNames;
    } else {
      // No mappings available - try to fetch metadata for real names
      try {
        const { restaurantService } = await import("./api.js");
        const metadataPromises = restaurantIds.map(async (restaurantId) => {
          try {
            const metadata =
              await restaurantService.getRestaurantMetadata(restaurantId);
            return {
              id: restaurantId,
              name: metadata.restaurantName || `Restaurant ${restaurantId}`,
              platform: metadata.platform || "unknown",
            };
          } catch (error) {
            console.warn(
              `ΓÜá∩╕Å Failed to fetch metadata for ${restaurantId}:`,
              error.message,
            );
            return {
              id: restaurantId,
              name: `Restaurant ${restaurantId}`,
              platform: "unknown",
            };
          }
        });

        const results = await Promise.all(metadataPromises);
        return results;
      } catch (error) {
        console.error("Γ¥î Error fetching restaurant metadata:", error);
        // Final fallback to generic names
        return restaurantIds.map((id) => ({
          id: id,
          name: `Restaurant ${id}`,
          platform: "unknown",
        }));
      }
    }
  }

  /**
   * Automatically load last month's data for existing users (login scenario)
   * Simply fetches last month's data from consolidated insights
   */
  async loadLastMonthData(userRestaurants) {
    try {
      if (
        !userRestaurants?.restaurantIds ||
        userRestaurants.restaurantIds.length === 0
      ) {
        return null;
      }

      // Calculate last month's date range
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() - 1); // Yesterday

      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30); // 30 days back

      const startDateStr = this.formatDate(startDate);
      const endDateStr = this.formatDate(endDate);
      // Try restaurants one by one until we find data
      const allRestaurantIds = userRestaurants.restaurantIds;
      for (let i = 0; i < allRestaurantIds.length; i++) {
        const restaurantId = allRestaurantIds[i];
        try {
          // Get restaurant name for this specific restaurant
          const restaurantData = await this.getRestaurantNames(
            userRestaurants,
            [restaurantId],
          );
          const restaurant = restaurantData[0];
          const result = await reportService.getConsolidatedInsights(
            restaurantId,
            startDateStr,
            endDateStr,
            null, // Total summary
          );

          // Parse the response to check if it has actual data
          const parsed =
            typeof result.body === "string" ? JSON.parse(result.body) : result;

          // Check if we have meaningful data
          if (
            parsed.consolidatedInsights &&
            Object.keys(parsed.consolidatedInsights).length > 0
          ) {
            const insights = parsed.consolidatedInsights;
            if (insights.noOfOrders > 0 || insights.grossSale > 0) {
              // Return successful result for this single restaurant
              return {
                results: [parsed],
                details: [
                  {
                    id: restaurantId,
                    name: restaurant.name,
                    platform: restaurant.platform,
                    key: restaurantId,
                  },
                ],
                selections: {
                  restaurants: [restaurantId],
                  channels: ["zomato", "swiggy"], // Default channels
                  startDate: startDateStr,
                  endDate: endDateStr,
                  groupBy: "total",
                },
                groupBy: "total",
                thresholds: {
                  discount: 10,
                  ads: 5,
                },
                excludedChannels: [],
                autoLoaded: true, // Flag to indicate this was auto-loaded
                autoLoadPeriod: `${startDateStr} to ${endDateStr}`,
              };
            }
          }
        } catch (error) {
          console.warn(
            `ΓÜá∩╕Å Failed to fetch data for restaurant ${restaurantId}:`,
            error.message,
          );
          continue; // Try next restaurant
        }
      }

      // If we get here, no restaurant had data
      return null;
    } catch (error) {
      console.error("Γ¥î Error in auto-load service:", error);
      return null;
    }
  }

  /**
   * Check if user should get auto-loaded data (existing user vs new signup)
   */
  shouldAutoLoad(userRestaurants, isNewUser = false) {
    // Don't auto-load for new users (signups)
    if (isNewUser) {
      return false;
    }

    // Auto-load for existing users with restaurants
    if (
      userRestaurants?.restaurantIds &&
      userRestaurants.restaurantIds.length > 0
    ) {
      return true;
    }
    return false;
  }
}

export const autoLoadService = new AutoLoadService();
