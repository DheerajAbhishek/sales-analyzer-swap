import { API_BASE_URL } from '../utils/constants';

export const uploadFileService = {
    async getUploadUrl(filename, contentType = 'application/octet-stream') {
        const businessEmail = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).businessEmail : null
        const payload = businessEmail ? { filename, contentType, businessEmail } : { filename, contentType }
        const response = await fetch(`${API_BASE_URL}/upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get upload URL');
        }

        const data = await response.json();
        return data.body ? JSON.parse(data.body) : data;
    },

    async uploadFile(url, fields, file) {
        // Use FormData for POST upload (avoids CORS preflight)
        const formData = new FormData();

        // Add all the fields from presigned POST
        Object.keys(fields).forEach(key => {
            formData.append(key, fields[key]);
        });

        // File must be the last field
        formData.append('file', file);

        const response = await fetch(url, {
            method: 'POST',
            body: formData
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
                file.type || 'application/octet-stream'
            );

            // Step 2: Upload to S3 using POST with FormData
            await this.uploadFile(url, fields, file);

            return { success: true, key };
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    },

    async processBatch(fileKeys) {
        const businessEmail = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).businessEmail : null
        const payload = businessEmail ? { files: fileKeys, businessEmail } : { files: fileKeys }
        const response = await fetch(`${API_BASE_URL}/batch-process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Batch processing failed to start.');
        }

        const data = await response.json();
        return data.body ? JSON.parse(data.body) : data;
    },

    async getJobStatus(jobId) {
        const response = await fetch(`${API_BASE_URL}/job-status?jobId=${jobId}`);

        if (!response.ok) {
            throw new Error('Failed to get job status');
        }

        const data = await response.json();
        const result = data.body ? JSON.parse(data.body) : data;

        // Check if job completed successfully and refresh restaurants
        if (result.status === 'SUCCEEDED' || result.status === 'COMPLETED') {
            try {
                console.log('Job completed successfully, refreshing user restaurants...');
                await restaurantService.refreshUserRestaurants();
                console.log('User restaurants refreshed after job completion');
            } catch (refreshError) {
                console.warn('Failed to refresh restaurants after job completion:', refreshError);
                // Don't fail the job status if restaurant refresh fails
            }
        }

        return result;
    }
};
export const reportService = {
    async getConsolidatedInsights(restaurantId, startDate, endDate, groupBy = null) {
        let apiUrl = `${API_BASE_URL}/consolidated-insights?restaurantId=${restaurantId}&startDate=${startDate}&endDate=${endDate}`;
        const businessEmail = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).businessEmail : null
        if (businessEmail) {
            apiUrl += `&businessEmail=${encodeURIComponent(businessEmail)}`;
        }
        if (groupBy && groupBy !== 'total') {
            apiUrl += `&groupBy=${groupBy}`;
        }

        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error('Failed to get consolidated insights');
        }

        return response.json();
    }
};

export const expenseService = {
    async saveExpenses(restaurantId, month, expenses) {
        const response = await fetch(`${API_BASE_URL}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurantId,
                month,
                expenses
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to save data.');
        }

        return response.json();
    },

    async getExpenses(restaurantId, month) {
        const response = await fetch(`${API_BASE_URL}/expenses?restaurantId=${restaurantId}&month=${month}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Could not load saved expenses.');
        }

        return response.json();
    }
};

export const restaurantService = {
    async getUserRestaurants(businessEmail = null) {
        try {
            // Get business email from localStorage if not provided
            const email = businessEmail || (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).businessEmail : null);

            if (!email) {
                throw new Error('Business email not found');
            }

            const response = await fetch(`${API_BASE_URL}/user-restaurants?businessEmail=${encodeURIComponent(email)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                    // Temporarily removed 'business-email' header to avoid CORS
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to fetch user restaurants');
            }

            const data = await response.json();
            return data.body ? JSON.parse(data.body) : data;
        } catch (error) {
            console.error('Error fetching user restaurants:', error);
            throw error;
        }
    },

    async refreshUserRestaurants() {
        try {
            const restaurantData = await this.getUserRestaurants();

            // Update stored restaurant data
            localStorage.setItem('userRestaurants', JSON.stringify(restaurantData));

            // Dispatch custom event to notify components of the update
            window.dispatchEvent(new CustomEvent('userRestaurantsUpdated', {
                detail: restaurantData
            }));

            return restaurantData;
        } catch (error) {
            console.error('Error refreshing user restaurants:', error);
            throw error;
        }
    }
};