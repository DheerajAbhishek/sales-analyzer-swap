import { API_BASE_URL } from '../utils/constants';

export const uploadFileService = {
    async getUploadUrl(filename, contentType = 'application/octet-stream') {
        const response = await fetch(`${API_BASE_URL}/get-upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename,
                contentType
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get upload URL');
        }

        const data = await response.json();
        return data.body ? JSON.parse(data.body) : data;
    },

    async uploadFile(uploadUrl, file, contentType) {
        // CRITICAL: Must include Content-Type header matching the presigned URL
        const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': contentType || file.type
            },
            body: file
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }

        return response;
    },

    // Convenience method to handle the full upload flow
    async uploadFileComplete(file) {
        try {
            // Step 1: Get presigned URL with content type
            const { uploadUrl, key, contentType } = await this.getUploadUrl(
                file.name,
                file.type || 'application/octet-stream'
            );

            // Step 2: Upload to S3 with matching content type
            await this.uploadFile(uploadUrl, file, contentType);

            return { success: true, key, uploadUrl };
        } catch (error) {
            // Silently handle upload errors
            throw error;
        }
    },

    async processBatch(fileKeys) {
        const response = await fetch(`${API_BASE_URL}/process-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: fileKeys })
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
        return data.body ? JSON.parse(data.body) : data;
    }
};

export const reportService = {
    async getConsolidatedInsights(restaurantId, startDate, endDate, groupBy = null) {
        let apiUrl = `${API_BASE_URL}/get-consolidated-insights?restaurantId=${restaurantId}&startDate=${startDate}&endDate=${endDate}`;
        if (groupBy && groupBy !== 'total') {
            apiUrl += `&groupBy=${groupBy}`;
        }

        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error('Failed to get consolidated insights');
        }

        return response.json();
    },

    async getOnDemandInsights(branchId, startDate, endDate, channel) {
        const ON_DEMAND_API_URL = 'https://xiphvj43ij.execute-api.ap-south-1.amazonaws.com/Prod/fetch-from-rista';
        const apiUrl = `${ON_DEMAND_API_URL}?branchId=${branchId}&startDate=${startDate}&endDate=${endDate}&channel=${channel}`;
        
        const response = await fetch(apiUrl);
    
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get on-demand insights from Rista API');
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