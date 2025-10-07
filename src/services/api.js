import { API_BASE_URL } from '../utils/constants';

export const uploadFileService = {
    async getUploadUrl(filename) {
        const response = await fetch(`${API_BASE_URL}/get-upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        const data = await response.json();
        return data.body ? JSON.parse(data.body) : data;
    },

    async uploadFile(uploadUrl, file) {
        await fetch(uploadUrl, { method: 'PUT', body: file });
    },

    async processBatch(fileKeys) {
        const response = await fetch(`${API_BASE_URL}/process-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: fileKeys })
        });

        if (!response.ok) {
            throw new Error('Batch processing failed to start.');
        }

        const data = await response.json();
        return data.body ? JSON.parse(data.body) : data;
    },

    async getJobStatus(jobId) {
        const response = await fetch(`${API_BASE_URL}/job-status?jobId=${jobId}`);
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
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save data.');
        }

        return response.json();
    },

    async getExpenses(restaurantId, month) {
        const response = await fetch(`${API_BASE_URL}/expenses?restaurantId=${restaurantId}&month=${month}`);
        if (!response.ok) {
            throw new Error('Could not load saved expenses.');
        }
        return response.json();
    }
};