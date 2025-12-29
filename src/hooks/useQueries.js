import { useQuery } from '@tanstack/react-query'
import { reportService, ristaService } from '../services/api'

/**
 * Hook to fetch on-demand insights (takeaway/corporate) with caching
 */
export const useOnDemandInsights = (branchId, startDate, endDate, channel, groupBy = 'total', options = {}) => {
    return useQuery({
        queryKey: ['onDemandInsights', branchId, startDate, endDate, channel, groupBy],
        queryFn: () => reportService.getOnDemandInsights(branchId, startDate, endDate, channel, groupBy),
        enabled: !!(branchId && startDate && endDate && channel),
        staleTime: 10 * 60 * 1000, // 10 minutes for sales data
        ...options,
    })
}

/**
 * Hook to fetch consolidated insights (Zomato/Swiggy from S3) with caching
 */
export const useConsolidatedInsights = (restaurantId, startDate, endDate, groupBy, options = {}) => {
    return useQuery({
        queryKey: ['consolidatedInsights', restaurantId, startDate, endDate, groupBy],
        queryFn: () => reportService.getConsolidatedInsights(restaurantId, startDate, endDate, groupBy),
        enabled: !!(restaurantId && startDate && endDate),
        staleTime: 10 * 60 * 1000,
        ...options,
    })
}

/**
 * Hook to fetch inventory data with caching
 */
export const useInventoryData = (branchId, startDate, endDate, dataTypes, options = {}) => {
    return useQuery({
        queryKey: ['inventory', branchId, startDate, endDate, dataTypes],
        queryFn: () => ristaService.fetchInventoryData(branchId, startDate, endDate, dataTypes),
        enabled: !!(branchId && startDate && endDate),
        staleTime: 15 * 60 * 1000, // 15 minutes for inventory
        ...options,
    })
}

/**
 * Hook to fetch Rista branches with longer cache (rarely changes)
 */
export const useRistaBranches = (options = {}) => {
    return useQuery({
        queryKey: ['ristaBranches'],
        queryFn: () => ristaService.fetchBranches(),
        staleTime: 60 * 60 * 1000, // 1 hour - branches rarely change
        gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
        ...options,
    })
}

/**
 * Hook to fetch sales data via Rista API with caching
 */
export const useRistaSales = (branchId, startDate, endDate, channel, options = {}) => {
    return useQuery({
        queryKey: ['ristaSales', branchId, startDate, endDate, channel],
        queryFn: () => ristaService.fetchSalesData(branchId, startDate, endDate, channel),
        enabled: !!(branchId && startDate && endDate && channel),
        staleTime: 10 * 60 * 1000,
        ...options,
    })
}

/**
 * Hook to fetch multiple sales data in parallel with caching
 * This is useful for fetching multiple branch/channel combinations
 */
export const useSalesDataBatch = (requests, groupBy = 'total', options = {}) => {
    // requests is an array of { branchId, startDate, endDate, channel }
    return useQuery({
        queryKey: ['salesBatch', JSON.stringify(requests), groupBy],
        queryFn: async () => {
            const results = await Promise.allSettled(
                requests.map(req =>
                    reportService.getOnDemandInsights(req.branchId, req.startDate, req.endDate, req.channel, groupBy)
                )
            )
            return results.map((result, index) => ({
                ...requests[index],
                success: result.status === 'fulfilled',
                data: result.status === 'fulfilled' ? result.value : null,
                error: result.status === 'rejected' ? result.reason : null,
            }))
        },
        enabled: requests.length > 0,
        staleTime: 10 * 60 * 1000,
        ...options,
    })
}
