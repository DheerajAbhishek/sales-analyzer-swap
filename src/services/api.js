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

    // Helper function to split date range into weekly chunks
    getWeeklyChunks(startDate, endDate) {
        const chunks = []
        const startD = new Date(startDate)
        const endD = new Date(endDate)
        
        let chunkStart = new Date(startD)
        while (chunkStart <= endD) {
            let chunkEnd = new Date(chunkStart)
            chunkEnd.setDate(chunkEnd.getDate() + 6) // 7-day chunks
            if (chunkEnd > endD) {
                chunkEnd = new Date(endD)
            }
            chunks.push({
                startDate: chunkStart.toISOString().split('T')[0],
                endDate: chunkEnd.toISOString().split('T')[0]
            })
            chunkStart = new Date(chunkEnd)
            chunkStart.setDate(chunkStart.getDate() + 1)
        }
        return chunks
    },

    // Helper to merge multiple insight results
    mergeInsightResults(results, branchId, originalStartDate, originalEndDate) {
        const merged = {
            restaurantId: branchId,
            startDate: originalStartDate,
            endDate: originalEndDate,
            body: {
                consolidatedInsights: {
                    noOfOrders: 0,
                    grossSale: 0,
                    gstOnOrder: 0,
                    discounts: 0,
                    packings: 0,
                    ads: 0,
                    commissionAndTaxes: 0,
                    netSale: 0,
                    nbv: 0
                },
                discountBreakdown: {}
            }
        }

        for (const result of results) {
            const insights = result?.body?.consolidatedInsights || {}
            merged.body.consolidatedInsights.noOfOrders += insights.noOfOrders || 0
            merged.body.consolidatedInsights.grossSale += insights.grossSale || 0
            merged.body.consolidatedInsights.gstOnOrder += insights.gstOnOrder || 0
            merged.body.consolidatedInsights.discounts += insights.discounts || 0
            merged.body.consolidatedInsights.packings += insights.packings || 0
            merged.body.consolidatedInsights.ads += insights.ads || 0
            merged.body.consolidatedInsights.commissionAndTaxes += insights.commissionAndTaxes || 0
            merged.body.consolidatedInsights.netSale += insights.netSale || 0
        }

        // Recalculate derived values
        const c = merged.body.consolidatedInsights
        c.nbv = c.grossSale - c.discounts
        c.discountPercent = c.grossSale > 0 ? (c.discounts / c.grossSale * 100) : 0
        c.commissionPercent = c.grossSale > 0 ? (c.commissionAndTaxes / c.grossSale * 100) : 0
        c.adsPercent = c.grossSale > 0 ? (c.ads / c.grossSale * 100) : 0

        return merged
    },

    async getOnDemandInsights(branchId, startDate, endDate, channel) {
        const ON_DEMAND_API_URL = 'https://xiphvj43ij.execute-api.ap-south-1.amazonaws.com/Prod/fetch-from-rista';
        
        // Split into weekly chunks for faster fetching
        const weeklyChunks = this.getWeeklyChunks(startDate, endDate)
        console.log(`🔄 Splitting ${startDate} to ${endDate} into ${weeklyChunks.length} weekly chunks for ${branchId}/${channel}`)

        // Fetch each chunk with staggered timing
        const STAGGER_DELAY = 300 // 300ms between requests
        const results = []

        for (let i = 0; i < weeklyChunks.length; i++) {
            const chunk = weeklyChunks[i]
            
            // Add delay between requests (except first)
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY))
            }

            const apiUrl = `${ON_DEMAND_API_URL}?branchId=${branchId}&startDate=${chunk.startDate}&endDate=${chunk.endDate}&channel=${channel}`
            console.log(`📡 Fetching chunk ${i + 1}/${weeklyChunks.length}: ${chunk.startDate} to ${chunk.endDate}`)

            try {
                const response = await fetch(apiUrl)
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}))
                    console.error(`❌ Chunk ${i + 1} failed:`, error)
                    continue // Skip failed chunks instead of failing entirely
                }
                const data = await response.json()
                results.push(data)
            } catch (err) {
                console.error(`❌ Chunk ${i + 1} error:`, err)
            }
        }

        if (results.length === 0) {
            throw new Error('Failed to get on-demand insights from Rista API - all chunks failed')
        }

        // Merge all chunk results
        console.log(`✅ Successfully fetched ${results.length}/${weeklyChunks.length} chunks, merging...`)
        return this.mergeInsightResults(results, branchId, startDate, endDate)
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

export const ristaService = {
    // Lambda endpoint base URL - update this after deploying the Lambda functions
    RISTA_LAMBDA_URL: 'https://xiphvj43ij.execute-api.ap-south-1.amazonaws.com/Prod',

    // Get credentials from environment
    getCredentials() {
        return {
            apiKey: import.meta.env.VITE_RISTA_API_KEY,
            secretKey: import.meta.env.VITE_RISTA_SECRET_KEY
        }
    },

    // Fetch branches using API credentials from .env via Lambda
    async fetchBranches() {
        const { apiKey, secretKey } = this.getCredentials()
        const response = await fetch(`${this.RISTA_LAMBDA_URL}/rista-branches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey, secretKey })
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || `Failed to fetch branches: ${response.status}`)
        }

        const data = await response.json()
        // Handle Lambda response format (body might be stringified)
        if (typeof data.body === 'string') {
            return JSON.parse(data.body)
        }
        return data.body || data
    },

    // Fetch sales data for a specific branch and channel via Lambda
    async fetchSalesData(branchId, startDate, endDate, channelName) {
        const { apiKey, secretKey } = this.getCredentials()
        const response = await fetch(`${this.RISTA_LAMBDA_URL}/rista-sales`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey,
                secretKey,
                branchId,
                startDate,
                endDate,
                channelName
            })
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || `Failed to fetch sales data: ${response.status}`)
        }

        const data = await response.json()
        // Handle Lambda response format (body might be stringified)
        if (typeof data.body === 'string') {
            return JSON.parse(data.body)
        }
        return data.body || data
    },

    // Helper to split date range into chunks
    getDateChunks(startDate, endDate, chunkDays = 7) {
        const chunks = []
        const start = new Date(startDate)
        const end = new Date(endDate)

        let chunkStart = new Date(start)
        while (chunkStart <= end) {
            let chunkEnd = new Date(chunkStart)
            chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1)
            if (chunkEnd > end) {
                chunkEnd = new Date(end)
            }
            chunks.push({
                startDate: chunkStart.toISOString().split('T')[0],
                endDate: chunkEnd.toISOString().split('T')[0]
            })
            chunkStart = new Date(chunkEnd)
            chunkStart.setDate(chunkStart.getDate() + 1)
        }
        return chunks
    },

    // Fetch a single chunk of inventory data
    async fetchInventoryChunk(branchId, startDate, endDate, dataTypes, skuCodes = null) {
        const { apiKey, secretKey } = this.getCredentials()
        const requestBody = {
            apiKey,
            secretKey,
            branchId,
            startDate,
            endDate,
            dataTypes
        }

        if (skuCodes && skuCodes.length > 0) {
            requestBody.skuCodes = skuCodes
        }

        const response = await fetch(`${this.RISTA_LAMBDA_URL}/rista-inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || `Failed to fetch inventory data: ${response.status}`)
        }

        const data = await response.json()
        if (typeof data.body === 'string') {
            return JSON.parse(data.body)
        }
        return data.body || data
    },

    // Merge multiple inventory results into one
    mergeInventoryResults(results, branchId, originalStartDate, originalEndDate) {
        const merged = {
            branchId,
            startDate: originalStartDate,
            endDate: originalEndDate,
            data: {},
            summary: {
                totalPurchaseOrderAmount: 0,
                totalGrnAmount: 0,
                totalTransferAmount: 0,
                totalShrinkageAmount: 0,
                totalAdjustmentAmount: 0,
                totalAuditAmount: 0,
                totalAuditVariance: 0
            }
        }

        for (const result of results) {
            if (!result || !result.data) continue

            // Merge summary totals
            if (result.summary) {
                merged.summary.totalPurchaseOrderAmount += result.summary.totalPurchaseOrderAmount || 0
                merged.summary.totalGrnAmount += result.summary.totalGrnAmount || 0
                merged.summary.totalTransferAmount += result.summary.totalTransferAmount || 0
                merged.summary.totalShrinkageAmount += result.summary.totalShrinkageAmount || 0
                merged.summary.totalAdjustmentAmount += result.summary.totalAdjustmentAmount || 0
                merged.summary.totalAuditAmount += result.summary.totalAuditAmount || 0
                merged.summary.totalAuditVariance += result.summary.totalAuditVariance || 0
            }

            // Merge data for each type
            for (const [dataType, typeData] of Object.entries(result.data)) {
                if (!merged.data[dataType]) {
                    merged.data[dataType] = {
                        rawCount: 0,
                        consolidated: this.initConsolidated(dataType)
                    }
                }

                merged.data[dataType].rawCount += typeData.rawCount || 0

                // Merge consolidated data
                if (typeData.consolidated) {
                    this.mergeConsolidated(merged.data[dataType].consolidated, typeData.consolidated, dataType)
                }
            }
        }

        return merged
    },

    // Initialize empty consolidated structure
    initConsolidated(dataType) {
        switch (dataType) {
            case 'po':
                return { totalRecords: 0, approvedRecords: 0, totalItemsAmount: 0, totalTaxAmount: 0, totalAmount: 0, suppliers: {}, items: {}, categories: {} }
            case 'grn':
                return { totalRecords: 0, totalItemsAmount: 0, totalTaxAmount: 0, totalAmount: 0, suppliers: {}, items: {} }
            case 'transfer':
                return { totalRecords: 0, totalItemsAmount: 0, totalAmount: 0, destinations: {}, items: {} }
            case 'shrinkage':
                return { totalRecords: 0, totalAmount: 0, reasons: {}, items: {} }
            case 'adjustment':
                return { totalRecords: 0, totalAmount: 0, adjustmentTypes: {}, items: {} }
            case 'audit':
                return { totalRecords: 0, finalRecords: 0, totalAmount: 0, totalVarianceAmount: 0, categories: {}, items: {} }
            case 'activity':
                return { totalItems: 0, items: {} }
            default:
                return {}
        }
    },

    // Merge consolidated data
    mergeConsolidated(target, source, dataType) {
        if (!source) return

        // Merge numeric totals
        for (const key of ['totalRecords', 'approvedRecords', 'finalRecords', 'totalItemsAmount', 'totalTaxAmount', 'totalAmount', 'totalVarianceAmount', 'totalItems']) {
            if (source[key] !== undefined) {
                target[key] = (target[key] || 0) + source[key]
            }
        }

        // Merge object maps (suppliers, destinations, categories, etc.)
        for (const mapKey of ['suppliers', 'destinations', 'reasons', 'adjustmentTypes']) {
            if (source[mapKey]) {
                if (!target[mapKey]) target[mapKey] = {}
                for (const [key, value] of Object.entries(source[mapKey])) {
                    target[mapKey][key] = (target[mapKey][key] || 0) + value
                }
            }
        }

        // Special handling for categories (can be simple number or object with amounts)
        if (source.categories) {
            if (!target.categories) target.categories = {}
            for (const [key, value] of Object.entries(source.categories)) {
                if (typeof value === 'number') {
                    target.categories[key] = (target.categories[key] || 0) + value
                } else if (typeof value === 'object') {
                    // For audit categories which have { totalAmount, varianceAmount }
                    if (!target.categories[key]) {
                        target.categories[key] = { totalAmount: 0, varianceAmount: 0 }
                    }
                    target.categories[key].totalAmount = (target.categories[key].totalAmount || 0) + (value.totalAmount || 0)
                    target.categories[key].varianceAmount = (target.categories[key].varianceAmount || 0) + (value.varianceAmount || 0)
                }
            }
        }

        // Merge items specially (they have nested properties)
        if (source.items) {
            if (!target.items) target.items = {}
            for (const [sku, itemData] of Object.entries(source.items)) {
                if (!target.items[sku]) {
                    target.items[sku] = { ...itemData }
                } else {
                    // Merge numeric properties
                    for (const prop of ['quantity', 'totalAmount', 'variance', 'openingStock', 'closingStock', 'consumption', 'received', 'transferred', 'shrinkage']) {
                        if (itemData[prop] !== undefined) {
                            target.items[sku][prop] = (target.items[sku][prop] || 0) + itemData[prop]
                        }
                    }
                }
            }
        }
    },

    // Fetch inventory data for a specific branch via Lambda
    // Automatically chunks requests into 7-day periods to avoid API Gateway timeout
    // dataTypes can include: grn, transfer, shrinkage, adjustment, activity, stock
    async fetchInventoryData(branchId, startDate, endDate, dataTypes = ['grn', 'transfer', 'shrinkage', 'adjustment', 'activity'], skuCodes = null) {
        const chunks = this.getDateChunks(startDate, endDate, 7)

        console.log(`Fetching inventory data in ${chunks.length} chunks for ${branchId}`)

        // Fetch all chunks in parallel
        const chunkPromises = chunks.map(chunk =>
            this.fetchInventoryChunk(branchId, chunk.startDate, chunk.endDate, dataTypes, skuCodes)
                .catch(err => {
                    console.error(`Error fetching chunk ${chunk.startDate} to ${chunk.endDate}:`, err)
                    return null // Return null for failed chunks, don't fail entire request
                })
        )

        const results = await Promise.all(chunkPromises)
        const validResults = results.filter(r => r !== null)

        if (validResults.length === 0) {
            throw new Error('Failed to fetch any inventory data')
        }

        // Merge all results
        return this.mergeInventoryResults(validResults, branchId, startDate, endDate)
    },

    // Fetch current stock levels for a branch
    async fetchCurrentStock(branchId, skuCodes = null) {
        return this.fetchInventoryData(branchId, new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0], ['stock'], skuCodes)
    },

    // Fetch GRN (Goods Received Notes) data only
    async fetchGrnData(branchId, startDate, endDate) {
        return this.fetchInventoryData(branchId, startDate, endDate, ['grn'])
    },

    // Fetch shrinkage/wastage data only
    async fetchShrinkageData(branchId, startDate, endDate) {
        return this.fetchInventoryData(branchId, startDate, endDate, ['shrinkage'])
    },

    // Fetch item activity/consumption data only
    async fetchItemActivity(branchId, startDate, endDate) {
        return this.fetchInventoryData(branchId, startDate, endDate, ['activity'])
    }
}
