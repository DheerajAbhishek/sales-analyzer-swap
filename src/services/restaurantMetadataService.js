import { restaurantMappingService } from './api.js'

// Service for managing restaurant metadata
export const restaurantMetadataService = {
    // Get all restaurant metadata (try backend first, fallback to localStorage)
    async getRestaurantMetadata() {
        try {
            // Try to get from backend first
            const backendResult = await restaurantMappingService.getRestaurantMetadata()

            if (backendResult.success && backendResult.data) {
                // Save to localStorage as backup
                localStorage.setItem('restaurantMetadata', JSON.stringify(backendResult.data))
                return backendResult.data
            }
        } catch (error) {
            console.warn('Failed to fetch metadata from backend, using localStorage:', error)
        }

        // Fallback to localStorage
        try {
            const metadata = localStorage.getItem('restaurantMetadata')
            return metadata ? JSON.parse(metadata) : {}
        } catch (error) {
            console.error('Error parsing restaurant metadata:', error)
            return {}
        }
    },

    // Get metadata for a specific restaurant
    async getRestaurantData(restaurantId) {
        const allMetadata = await this.getRestaurantMetadata()
        return allMetadata[restaurantId] || {
            id: restaurantId,
            name: restaurantId,
            channel: 'zomato'
        }
    },

    // Save metadata for a specific restaurant
    async saveRestaurantData(restaurantId, data) {
        try {
            const allMetadata = await this.getRestaurantMetadata()
            allMetadata[restaurantId] = {
                ...allMetadata[restaurantId],
                ...data,
                id: restaurantId, // Ensure ID is always set
                updatedAt: new Date().toISOString()
            }

            let backendSuccess = false

            try {
                // Save to backend first
                const backendResult = await restaurantMappingService.saveRestaurantMetadata(allMetadata)
                backendSuccess = backendResult.success

                if (!backendSuccess) {
                    console.warn('Backend metadata save failed:', backendResult.error)
                }
            } catch (error) {
                console.warn('Failed to save metadata to backend:', error)
            }

            // Always save to localStorage as backup
            localStorage.setItem('restaurantMetadata', JSON.stringify(allMetadata))

            // Dispatch event to notify other components
            window.dispatchEvent(new CustomEvent('restaurantMetadataUpdated', {
                detail: {
                    restaurantId,
                    data: allMetadata[restaurantId],
                    backendSaved: backendSuccess
                }
            }))

            return {
                success: true,
                data: allMetadata[restaurantId],
                backendSaved: backendSuccess,
                message: backendSuccess ? 'Saved successfully' : 'Saved locally (backend unavailable)'
            }
        } catch (error) {
            console.error('Error saving restaurant metadata:', error)
            return { success: false, error: error.message }
        }
    },

    // Initialize metadata for new restaurants
    async initializeRestaurantData(restaurantIds) {
        const allMetadata = await this.getRestaurantMetadata()
        let hasChanges = false

        restaurantIds.forEach(restaurantId => {
            if (!allMetadata[restaurantId]) {
                allMetadata[restaurantId] = {
                    id: restaurantId,
                    name: restaurantId,
                    channel: 'zomato',
                    createdAt: new Date().toISOString()
                }
                hasChanges = true
            }
        })

        if (hasChanges) {
            let backendSuccess = false

            try {
                // Save to backend
                const backendResult = await restaurantMappingService.saveRestaurantMetadata(allMetadata)
                backendSuccess = backendResult.success
            } catch (error) {
                console.warn('Failed to save initialized metadata to backend:', error)
            }

            // Always save to localStorage
            localStorage.setItem('restaurantMetadata', JSON.stringify(allMetadata))

            window.dispatchEvent(new CustomEvent('restaurantMetadataInitialized', {
                detail: { metadata: allMetadata, backendSaved: backendSuccess }
            }))
        }

        return allMetadata
    },

    // Get display name for a restaurant
    async getDisplayName(restaurantId) {
        const data = await this.getRestaurantData(restaurantId)
        return data.name !== restaurantId ? `${data.name} (${restaurantId})` : restaurantId
    },

    // Get channel color/indicator
    getChannelInfo(channel) {
        const channels = {
            zomato: { label: 'Zomato', color: '#ef4444', indicator: '🍴' },
            swiggy: { label: 'Swiggy', color: '#f59e0b', indicator: '🛵' },
            takeaway: { label: 'Takeaway', color: '#10b981', indicator: '🥡' },
            subs: { label: 'Subscriptions', color: '#6366f1', indicator: '🔄' }
        }
        return channels[channel] || channels.zomato
    },

    // Clear all metadata (for testing/reset)
    async clearMetadata() {
        localStorage.removeItem('restaurantMetadata')
        window.dispatchEvent(new CustomEvent('restaurantMetadataCleared'))

        // Note: We don't delete from backend here as that would require a separate API call
        // You may want to add a backend delete endpoint if needed
    },

    // Sync local data with backend (useful for conflict resolution)
    async syncWithBackend() {
        try {
            const backendResult = await restaurantMappingService.getRestaurantMetadata()

            if (backendResult.success) {
                localStorage.setItem('restaurantMetadata', JSON.stringify(backendResult.data))

                window.dispatchEvent(new CustomEvent('restaurantMetadataUpdated', {
                    detail: { metadata: backendResult.data, backendSaved: true }
                }))

                return { success: true, data: backendResult.data }
            }

            return { success: false, error: backendResult.error }
        } catch (error) {
            console.error('Error syncing metadata with backend:', error)
            return { success: false, error: error.message }
        }
    }
}