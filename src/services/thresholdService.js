import { THRESHOLD_API_BASE_URL } from '../utils/threshold-api-constants';

export const thresholdService = {
    /**
     * Get threshold settings for a user
     * @param {string} userId - User identifier (optional, defaults to 'default_user')
     * @returns {Promise<Object>} Threshold settings
     */
    async getThresholds(userId = 'default_user') {
        try {
            const response = await fetch(`${THRESHOLD_API_BASE_URL}/threshold-settings?userId=${userId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                return {
                    success: true,
                    data: data.data
                };
            } else {
                throw new Error(data.error || 'Failed to get threshold settings');
            }
        } catch (error) {
            // Silently handle error and return default values
            return {
                success: false,
                error: error.message,
                // Return default values on error
                data: {
                    userId: userId,
                    discountThreshold: 10.0,
                    adsThreshold: 5.0
                }
            };
        }
    },

    /**
     * Save new threshold settings
     * @param {Object} settings - Threshold settings
     * @param {string} settings.userId - User identifier
     * @param {number} settings.discountThreshold - Discount threshold percentage
     * @param {number} settings.adsThreshold - Ads threshold percentage
     * @returns {Promise<Object>} Save result
     */
    async saveThresholds(settings) {
        try {
            // Validate settings
            if (typeof settings.discountThreshold !== 'number' ||
                settings.discountThreshold < 0 ||
                settings.discountThreshold > 100) {
                throw new Error('Discount threshold must be a number between 0 and 100');
            }

            if (typeof settings.adsThreshold !== 'number' ||
                settings.adsThreshold < 0 ||
                settings.adsThreshold > 100) {
                throw new Error('Ads threshold must be a number between 0 and 100');
            }

            const response = await fetch(`${THRESHOLD_API_BASE_URL}/threshold-settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: settings.userId || 'default_user',
                    discountThreshold: settings.discountThreshold,
                    adsThreshold: settings.adsThreshold
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                return {
                    success: true,
                    data: data.data,
                    message: data.message
                };
            } else {
                throw new Error(data.error || 'Failed to save threshold settings');
            }
        } catch (error) {
            // Silently handle error
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Update existing threshold settings
     * @param {Object} settings - Threshold settings to update
     * @param {string} settings.userId - User identifier
     * @param {number} [settings.discountThreshold] - Discount threshold percentage (optional)
     * @param {number} [settings.adsThreshold] - Ads threshold percentage (optional)
     * @returns {Promise<Object>} Update result
     */
    async updateThresholds(settings) {
        try {
            // Validate settings if provided
            if (settings.discountThreshold !== undefined) {
                if (typeof settings.discountThreshold !== 'number' ||
                    settings.discountThreshold < 0 ||
                    settings.discountThreshold > 100) {
                    throw new Error('Discount threshold must be a number between 0 and 100');
                }
            }

            if (settings.adsThreshold !== undefined) {
                if (typeof settings.adsThreshold !== 'number' ||
                    settings.adsThreshold < 0 ||
                    settings.adsThreshold > 100) {
                    throw new Error('Ads threshold must be a number between 0 and 100');
                }
            }

            const response = await fetch(`${THRESHOLD_API_BASE_URL}/threshold-settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                return {
                    success: true,
                    data: data.data,
                    message: data.message
                };
            } else {
                throw new Error(data.error || 'Failed to update threshold settings');
            }
        } catch (error) {
            // Silently handle error
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Delete threshold settings for a user
     * @param {string} userId - User identifier
     * @returns {Promise<Object>} Delete result
     */
    async deleteThresholds(userId = 'default_user') {
        try {
            const response = await fetch(`${THRESHOLD_API_BASE_URL}/threshold-settings?userId=${userId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                return {
                    success: true,
                    message: data.message
                };
            } else {
                throw new Error(data.error || 'Failed to delete threshold settings');
            }
        } catch (error) {
            // Silently handle error
            return {
                success: false,
                error: error.message
            };
        }
    }
};