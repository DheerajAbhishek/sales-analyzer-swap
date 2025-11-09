import { API_BASE_URL } from "../utils/constants.js";

export const dateService = {
  async getLastAvailableDate(restaurantId, businessEmail = null) {
    try {
      const requestBody = { restaurantId };
      if (businessEmail) {
        requestBody.businessEmail = businessEmail;
      }

      const response = await fetch(`${API_BASE_URL}/get-last-date`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching last available date:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  async checkMissingDates(
    restaurantId,
    startDate,
    endDate,
    businessEmail = null,
  ) {
    try {
      const requestBody = {
        restaurantId,
        startDate,
        endDate,
      };
      if (businessEmail) {
        requestBody.businessEmail = businessEmail;
      }

      const response = await fetch(`${API_BASE_URL}/check-missing-dates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error checking missing dates:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
