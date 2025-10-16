import React, { useState, useEffect } from 'react'
import { authService } from '../services/authService'
import { restaurantMappingService } from '../services/api'

const ProfilePage = ({ user, onLogout, onBack }) => {
    const [platformIds, setPlatformIds] = useState([])
    const [restaurants, setRestaurants] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [editingRestaurant, setEditingRestaurant] = useState(null)
    const [creatingRestaurant, setCreatingRestaurant] = useState(false)
    const [newRestaurant, setNewRestaurant] = useState({ name: '', platforms: {} })
    const [unusedPlatformIds, setUnusedPlatformIds] = useState([])

    useEffect(() => {
        loadRestaurants()
    }, [])

    const loadRestaurants = async () => {
        try {
            setLoading(true)
            const userRestaurants = authService.getUserRestaurants()

            // Get all platform IDs from user's account
            const allPlatformIds = userRestaurants.restaurantIds || []
            setPlatformIds(allPlatformIds)

            // Try to load existing restaurant mappings from backend
            let mappings = []
            try {
                const response = await restaurantMappingService.getRestaurantMappings()
                if (response.success) {
                    mappings = response.data || []
                    console.log('Loaded mappings from backend:', mappings)
                    // Save to localStorage as backup
                    localStorage.setItem('restaurantMappings', JSON.stringify(mappings))
                }
            } catch (err) {
                console.log('Backend load failed, trying localStorage:', err)
                // Try to load from localStorage as fallback
                const localMappings = localStorage.getItem('restaurantMappings')
                if (localMappings) {
                    try {
                        mappings = JSON.parse(localMappings)
                        console.log('Loaded mappings from localStorage:', mappings)
                    } catch (parseErr) {
                        console.error('Failed to parse localStorage mappings:', parseErr)
                    }
                }
            }

            // If no mappings exist, create default ones
            if (mappings.length === 0) {
                mappings = allPlatformIds.map((platformId, index) => ({
                    id: `restaurant_${index + 1}`,
                    name: `Restaurant ${index + 1}`,
                    platforms: {
                        [guessChannelForId(platformId)]: platformId
                    },
                    createdAt: new Date().toISOString()
                }))
            }

            setRestaurants(mappings)
            updateUnusedPlatformIds(mappings, allPlatformIds)
        } catch (err) {
            setError('Failed to load restaurants')
            console.error('Error loading restaurants:', err)
        } finally {
            setLoading(false)
        }
    }

    // Helper function to guess the default channel based on platform ID pattern
    const guessChannelForId = (platformId) => {
        const id = platformId?.toString().toLowerCase() || ''
        if (id.includes('zomato') || id.includes('zom')) return 'zomato'
        if (id.includes('swiggy') || id.includes('swg')) return 'swiggy'
        if (id.includes('takeaway') || id.includes('take')) return 'takeaway'
        if (id.includes('sub') || id.includes('subscription')) return 'subs'
        return 'zomato' // default
    }

    // Helper function to update unused platform IDs
    const updateUnusedPlatformIds = (currentRestaurants, allPlatformIds) => {
        const usedIds = new Set()
        currentRestaurants.forEach(restaurant => {
            Object.values(restaurant.platforms || {}).forEach(platformId => {
                if (platformId) usedIds.add(platformId)
            })
        })
        const unused = allPlatformIds.filter(id => !usedIds.has(id))
        setUnusedPlatformIds(unused)
    }

    const handleEditRestaurant = (restaurantId) => {
        setEditingRestaurant(restaurantId)
    }

    const handleSaveRestaurant = async (restaurantId) => {
        try {
            setSaving(true)
            console.log('Saving restaurants:', restaurants)

            // Save to backend using the API service
            const result = await restaurantMappingService.saveRestaurantMappings(restaurants)
            console.log('Save result:', result)

            if (result.success) {
                setEditingRestaurant(null)
                setError(null)
                // Update unused platform IDs
                updateUnusedPlatformIds(restaurants, platformIds)
                // Save to localStorage as backup
                localStorage.setItem('restaurantMappings', JSON.stringify(restaurants))
                console.log('Successfully saved restaurant mappings')
            } else {
                setError('Failed to save restaurant data: ' + result.error)
                console.error('Save failed:', result.error)
            }
        } catch (err) {
            setError('Failed to save restaurant data: ' + err.message)
            console.error('Error saving restaurant:', err)
        } finally {
            setSaving(false)
        }
    }

    const handleCancelEdit = (restaurantId) => {
        setEditingRestaurant(null)
    }

    const handleInputChange = (restaurantId, field, value) => {
        setRestaurants(prev => prev.map(restaurant =>
            restaurant.id === restaurantId
                ? { ...restaurant, [field]: value }
                : restaurant
        ))
    }

    const handlePlatformChange = (restaurantId, channel, platformId) => {
        setRestaurants(prev => prev.map(restaurant =>
            restaurant.id === restaurantId
                ? {
                    ...restaurant,
                    platforms: {
                        ...restaurant.platforms,
                        [channel]: platformId
                    }
                }
                : restaurant
        ))
    }

    const handleCreateRestaurant = () => {
        setCreatingRestaurant(true)
        setNewRestaurant({ name: '', platforms: {} })
    }

    const handleSaveNewRestaurant = async () => {
        if (!newRestaurant.name.trim()) {
            setError('Restaurant name is required')
            return
        }

        setSaving(true)
        try {
            const restaurant = {
                id: `restaurant_${Date.now()}`,
                name: newRestaurant.name,
                platforms: newRestaurant.platforms,
                createdAt: new Date().toISOString()
            }

            const updatedRestaurants = [...restaurants, restaurant]
            setRestaurants(updatedRestaurants)

            // Save to backend using the API service
            const result = await restaurantMappingService.saveRestaurantMappings(updatedRestaurants)

            if (!result.success) {
                setError('Saved locally but failed to sync with server: ' + result.error)
            }

            setCreatingRestaurant(false)
            setNewRestaurant({ name: '', platforms: {} })
            setError(null)
            // Update unused platform IDs
            updateUnusedPlatformIds(updatedRestaurants, platformIds)
        } catch (err) {
            setError('Failed to save restaurant: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleCancelNewRestaurant = () => {
        setCreatingRestaurant(false)
        setNewRestaurant({ name: '', platforms: {} })
    }

    const handleDeleteRestaurant = async (restaurantId) => {
        if (window.confirm('Are you sure you want to delete this restaurant mapping?')) {
            setSaving(true)
            try {
                const updatedRestaurants = restaurants.filter(r => r.id !== restaurantId)
                setRestaurants(updatedRestaurants)

                // Save to backend using the API service
                const result = await restaurantMappingService.saveRestaurantMappings(updatedRestaurants)

                if (!result.success) {
                    setError('Deleted locally but failed to sync with server: ' + result.error)
                }

                // Update unused platform IDs
                updateUnusedPlatformIds(updatedRestaurants, platformIds)
            } catch (err) {
                setError('Failed to delete restaurant: ' + err.message)
            } finally {
                setSaving(false)
            }
        }
    }

    const getUsedPlatformIds = (excludeRestaurantId = null) => {
        const usedIds = new Set()
        restaurants.forEach(restaurant => {
            if (restaurant.id !== excludeRestaurantId) {
                Object.values(restaurant.platforms || {}).forEach(platformId => {
                    if (platformId) usedIds.add(platformId)
                })
            }
        })
        return usedIds
    }

    const handleLogout = () => {
        authService.logout()
        if (onLogout) onLogout()
    }

    const channels = [
        { value: 'zomato', label: 'Zomato' },
        { value: 'swiggy', label: 'Swiggy' },
        { value: 'takeaway', label: 'Takeaway' },
        { value: 'subs', label: 'Subscriptions' }
    ]

    if (loading) {
        return (
            <div className="profile-page">
                <div className="profile-container">
                    <div className="profile-header">
                        <h1>Profile</h1>
                        <button className="btn-back" onClick={onBack}>
                            ← Back to Dashboard
                        </button>
                    </div>
                    <div className="loading-state">
                        <div className="loading-spinner"></div>
                        <p>Loading profile...</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="profile-page">
            <div className="profile-container">
                <div className="profile-header">
                    <h1>Profile</h1>
                    <button className="btn-back" onClick={onBack}>
                        ← Back to Dashboard
                    </button>
                </div>

                {error && (
                    <div className="error-message">
                        {error}
                    </div>
                )}

                {/* User Info Section */}
                <div className="profile-section">
                    <h2>Account Information</h2>
                    <div className="user-info-card">
                        <div className="user-info-row">
                            <label>Business Name:</label>
                            <span>{user?.businessName || user?.restaurantName || user?.name || 'N/A'}</span>
                        </div>
                        <div className="user-info-row">
                            <label>Email:</label>
                            <span>{user?.businessEmail || user?.email}</span>
                        </div>
                        <div className="user-info-row">
                            <label>Authentication Method:</label>
                            <span>{authService.getAuthMethod() === 'google' ? 'Google OAuth' : 'Email & Password'}</span>
                        </div>
                        <div className="user-actions">
                            <button className="btn-logout" onClick={handleLogout}>
                                Logout
                            </button>
                        </div>
                    </div>
                </div>

                {/* Restaurants Section */}
                <div className="profile-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h2>Your Restaurants ({restaurants.length})</h2>
                        <button
                            className="btn-edit"
                            onClick={handleCreateRestaurant}
                            disabled={saving || creatingRestaurant}
                        >
                            + Add Restaurant
                        </button>
                    </div>

                    {/* Show unused platform IDs */}
                    {unusedPlatformIds.length > 0 && (
                        <div style={{
                            background: '#fef3c7',
                            border: '1px solid #f59e0b',
                            borderRadius: '8px',
                            padding: '1rem',
                            marginBottom: '1.5rem'
                        }}>
                            <strong>Unused Platform IDs:</strong> {unusedPlatformIds.join(', ')}
                            <br />
                            <small>These IDs from your uploaded data are not assigned to any restaurant.</small>
                        </div>
                    )}

                    {creatingRestaurant && (
                        <div className="restaurant-card" style={{ border: '2px dashed var(--primary-purple)' }}>
                            <div className="restaurant-header">
                                <div className="restaurant-id">New Restaurant</div>
                                <div>
                                    <button
                                        className="btn-save"
                                        onClick={handleSaveNewRestaurant}
                                        disabled={!newRestaurant.name.trim()}
                                        style={{ marginRight: '0.5rem' }}
                                    >
                                        Save
                                    </button>
                                    <button
                                        className="btn-cancel"
                                        onClick={handleCancelNewRestaurant}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                            <div className="restaurant-content">
                                <div className="form-group">
                                    <label>Restaurant Name:</label>
                                    <input
                                        type="text"
                                        value={newRestaurant.name}
                                        onChange={(e) => setNewRestaurant(prev => ({ ...prev, name: e.target.value }))}
                                        className="form-control"
                                        placeholder="Enter restaurant name"
                                        autoFocus
                                    />
                                </div>
                                {['zomato', 'swiggy', 'takeaway', 'subs'].map(channel => (
                                    <div key={channel} className="form-group">
                                        <label>{channel.charAt(0).toUpperCase() + channel.slice(1)} ID:</label>
                                        <select
                                            value={newRestaurant.platforms[channel] || ''}
                                            onChange={(e) => setNewRestaurant(prev => ({
                                                ...prev,
                                                platforms: { ...prev.platforms, [channel]: e.target.value }
                                            }))}
                                            className="form-control"
                                        >
                                            <option value="">Select Platform ID</option>
                                            {platformIds.filter(platformId => !getUsedPlatformIds().has(platformId)).map(platformId => (
                                                <option key={platformId} value={platformId}>
                                                    {platformId}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {restaurants.length === 0 && !creatingRestaurant ? (
                        <div className="empty-state">
                            <p>No restaurants configured yet.</p>
                            <p>Click "Add Restaurant" to start mapping your platform IDs.</p>
                        </div>
                    ) : (
                        <div className="restaurants-grid">
                            {restaurants.map((restaurant) => {
                                const isEditing = editingRestaurant === restaurant.id

                                return (
                                    <div key={restaurant.id} className="restaurant-card">
                                        <div className="restaurant-header">
                                            <div className="restaurant-id">{restaurant.name}</div>
                                            {!isEditing && (
                                                <div>
                                                    <button
                                                        className="btn-edit"
                                                        onClick={() => handleEditRestaurant(restaurant.id)}
                                                        disabled={saving}
                                                        style={{ marginRight: '0.5rem' }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        className="btn-cancel"
                                                        onClick={() => handleDeleteRestaurant(restaurant.id)}
                                                        disabled={saving}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="restaurant-content">
                                            <div className="form-group">
                                                <label>Restaurant Name:</label>
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={restaurant.name}
                                                        onChange={(e) => handleInputChange(restaurant.id, 'name', e.target.value)}
                                                        className="form-control"
                                                        placeholder="Enter restaurant name"
                                                    />
                                                ) : (
                                                    <div className="display-value">{restaurant.name}</div>
                                                )}
                                            </div>

                                            {['zomato', 'swiggy', 'takeaway', 'subs'].map(channel => (
                                                <div key={channel} className="form-group">
                                                    <label>{channel.charAt(0).toUpperCase() + channel.slice(1)} ID:</label>
                                                    {isEditing ? (
                                                        <select
                                                            value={restaurant.platforms[channel] || ''}
                                                            onChange={(e) => handlePlatformChange(restaurant.id, channel, e.target.value)}
                                                            className="form-control"
                                                        >
                                                            <option value="">No Platform ID</option>
                                                            {platformIds.filter(platformId =>
                                                                !getUsedPlatformIds(restaurant.id).has(platformId) ||
                                                                restaurant.platforms[channel] === platformId
                                                            ).map(platformId => (
                                                                <option key={platformId} value={platformId}>
                                                                    {platformId}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <div className="display-value">
                                                            {restaurant.platforms[channel] || 'Not set'}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {isEditing && (
                                            <div className="restaurant-actions">
                                                <button
                                                    className="btn-save"
                                                    onClick={() => handleSaveRestaurant(restaurant.id)}
                                                    disabled={saving || !restaurant.name.trim()}
                                                >
                                                    {saving ? 'Saving...' : 'Save'}
                                                </button>
                                                <button
                                                    className="btn-cancel"
                                                    onClick={() => handleCancelEdit(restaurant.id)}
                                                    disabled={saving}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>                {/* Instructions */}
                <div className="profile-section">
                    <h2>How to Use</h2>
                    <div className="instructions">
                        <div className="instruction-item">
                            <strong>Restaurant Name:</strong> Give your restaurants meaningful names that help you identify them easily in reports and dashboards.
                        </div>
                        <div className="instruction-item">
                            <strong>Platform IDs:</strong> Map your platform IDs (from uploaded data) to the correct channels (Zomato, Swiggy, Takeaway, Subscriptions). You can assign multiple platform IDs to a single restaurant if it operates on multiple channels.
                        </div>
                        <div className="instruction-item">
                            <strong>Unused IDs:</strong> Any platform IDs from your uploaded data that aren't assigned to a restaurant will be shown as "unused" - make sure to assign them to get complete reports.
                        </div>
                        <div className="instruction-item">
                            <strong>Multiple Locations:</strong> If you have multiple restaurant locations, create separate restaurant entries for each location to track them individually.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ProfilePage