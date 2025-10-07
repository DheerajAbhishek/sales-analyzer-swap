const API_BASE_URL = 'https://xiphvj43ij.execute-api.ap-south-1.amazonaws.com/Prod';

export const dateService = {
    async getLastAvailableDate(restaurantId) {
        try {
            const response = await fetch(`${API_BASE_URL}/get-last-date`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ restaurantId })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching last available date:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};
