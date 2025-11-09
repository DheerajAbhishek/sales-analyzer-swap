import { reportService } from "./api.js";
import { dateService } from "./dateService.js";

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
   * Automatically load last month's data for existing users (login scenario)
   * Uses the working get-last-date endpoint
   */
  async loadLastMonthData(userRestaurants) {
    try {
      console.log(
        "🚀 Auto-loading recent data for user restaurants:",
        userRestaurants,
      );

      if (
        !userRestaurants?.restaurantIds ||
        userRestaurants.restaurantIds.length === 0
      ) {
        console.log("📭 No restaurants found for auto-load");
        return null;
      }

      // Get business email from localStorage
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const businessEmail = user.businessEmail || user.email;

      if (!businessEmail) {
        console.log("📧 No business email found for auto-load");
        return null;
      }

      // Get the first restaurant ID to find recent data
      const firstRestaurantId = userRestaurants.restaurantIds[0];
      console.log("🔍 Finding recent data for restaurant:", firstRestaurantId);

      // Use the working dateService to get last available date
      const result = await dateService.getLastAvailableDate(
        firstRestaurantId,
        businessEmail,
      );

      if (!result.success || !result.data?.lastDate) {
        console.log("📅 No recent data found for auto-load");
        return null;
      }

      const lastDate = result.data.lastDate;
      console.log("📅 Last available date found:", lastDate);

      // Calculate last month's date range (30 days back from last available date)
      const endDate = new Date(lastDate);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30); // 30 days back

      const startDateStr = this.formatDate(startDate);
      const endDateStr = this.formatDate(endDate);

      console.log(`📊 Auto-loading data from ${startDateStr} to ${endDateStr}`);

      // Try to fetch data for available restaurant IDs (limit to first 3 for performance)
      const restaurantIds = userRestaurants.restaurantIds.slice(0, 3);
      const fetchPromises = restaurantIds.map(async (restaurantId) => {
        try {
          console.log(`📈 Fetching data for restaurant: ${restaurantId}`);
          const result = await reportService.getConsolidatedInsights(
            restaurantId,
            startDateStr,
            endDateStr,
            null, // Total summary
          );
          return {
            success: true,
            data: result,
            detail: {
              id: restaurantId,
              name: `Restaurant ${restaurantId}`,
              platform: "auto",
              key: restaurantId,
            },
          };
        } catch (error) {
          console.warn(
            `⚠️ Failed to fetch data for ${restaurantId}:`,
            error.message,
          );
          return {
            success: false,
            error: error.message,
            detail: {
              id: restaurantId,
              name: `Restaurant ${restaurantId}`,
              platform: "auto",
              key: restaurantId,
            },
          };
        }
      });

      const results = await Promise.all(fetchPromises);
      const successfulResults = results.filter((result) => result.success);

      if (successfulResults.length === 0) {
        console.log("📭 No data available for any restaurant in auto-load");
        return null;
      }

      // Parse successful results
      const parsedResults = successfulResults.map((result) => {
        const res = result.data;
        if (typeof res.body === "string") return JSON.parse(res.body);
        return res;
      });

      const successfulDetails = successfulResults.map(
        (result) => result.detail,
      );

      console.log(
        `✅ Auto-loaded data for ${successfulResults.length} restaurants`,
      );

      // Return dashboard data in the same format as manual reports
      return {
        results: parsedResults,
        details: successfulDetails,
        selections: {
          restaurants: restaurantIds,
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
        excludedChannels: results
          .filter((result) => !result.success)
          .map((result) => ({
            name: result.detail.name,
            platform: result.detail.platform,
            reason: result.error,
          })),
        autoLoaded: true, // Flag to indicate this was auto-loaded
        autoLoadPeriod: `${startDateStr} to ${endDateStr}`,
      };
    } catch (error) {
      console.error("❌ Error in auto-load service:", error);
      return null;
    }
  }

  /**
   * Check if user should get auto-loaded data (existing user vs new signup)
   */
  shouldAutoLoad(userRestaurants, isNewUser = false) {
    // Don't auto-load for new users (signups)
    if (isNewUser) {
      console.log("🆕 New user - skipping auto-load");
      return false;
    }

    // Auto-load for existing users with restaurants
    if (
      userRestaurants?.restaurantIds &&
      userRestaurants.restaurantIds.length > 0
    ) {
      console.log("👤 Existing user with restaurants - will auto-load");
      return true;
    }

    console.log("📭 User has no restaurants - skipping auto-load");
    return false;
  }
}

export const autoLoadService = new AutoLoadService();
