import React, { useState, useEffect } from 'react'
import Select from 'react-select'
import { API_BASE_URL } from '../../utils/constants'
import { validateSelections } from '../../utils/helpers'
import { thresholdService } from '../../services/thresholdService'
import { userRestaurantMappingService } from '../../services/userRestaurantMappingService'
import flatpickr from 'flatpickr'

const ReportControls = ({ onGetReport, loading, userRestaurants }) => {
    const [selectedRestaurants, setSelectedRestaurants] = useState([]) // Will store restaurant IDs from ProfilePage
    const [selectedChannels, setSelectedChannels] = useState([])
    const [selectedPlatformIds, setSelectedPlatformIds] = useState([]) // Final platform IDs for API
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [groupBy, setGroupBy] = useState('total')
    const [discountThreshold, setDiscountThreshold] = useState(10)
    const [adsThreshold, setAdsThreshold] = useState(5)
    const [thresholdLoading, setThresholdLoading] = useState(false)
    const [thresholdError, setThresholdError] = useState(null)
    const [restaurantLastDates, setRestaurantLastDates] = useState({})
    const [fetchingDates, setFetchingDates] = useState({})
    const [restaurantOptions, setRestaurantOptions] = useState([])
    const [optionsLoading, setOptionsLoading] = useState(false)
    const [selectedRestaurantInfo, setSelectedRestaurantInfo] = useState({})
    const [restaurantMappings, setRestaurantMappings] = useState([])

    useEffect(() => {
        // Initialize flatpickr
        const dateInput = document.getElementById('dateRange')
        if (dateInput) {
            flatpickr(dateInput, {
                mode: 'range',
                dateFormat: 'Y-m-d',
                onChange: (selectedDates) => {
                    if (selectedDates.length === 2) {
                        const pad = (num) => String(num).padStart(2, '0')
                        const format = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
                        setStartDate(format(selectedDates[0]))
                        setEndDate(format(selectedDates[1]))
                    }
                }
            })
        }

        // Load threshold settings
        loadThresholdSettings()
    }, [])

    // Update restaurant options when userRestaurants changes
    useEffect(() => {
        const updateRestaurantOptions = async () => {
            if (!userRestaurants?.restaurantIds || userRestaurants.restaurantIds.length === 0) {
                setRestaurantOptions([])
                return
            }

            setOptionsLoading(true)
            try {
                // Get restaurant mappings to see if user has organized any restaurants
                const restaurantMappings = await userRestaurantMappingService.getUserRestaurantMappings()
                setRestaurantMappings(restaurantMappings)

                const options = []
                const assignedPlatformIds = new Set()

                // First, add organized restaurant groups
                if (restaurantMappings && restaurantMappings.length > 0) {
                    restaurantMappings.forEach(restaurant => {
                        // Add the restaurant group to options
                        options.push({
                            value: restaurant.id,
                            label: restaurant.name,
                            platforms: restaurant.platforms,
                            isGroup: true
                        })

                        // Track which platform IDs are assigned to groups
                        Object.values(restaurant.platforms || {}).forEach(platformId => {
                            if (platformId) assignedPlatformIds.add(platformId)
                        })
                    })
                }

                // Then, add unassigned platform IDs directly
                userRestaurants.restaurantIds.forEach(restaurantId => {
                    if (!assignedPlatformIds.has(restaurantId)) {
                        options.push({
                            value: restaurantId,
                            label: restaurantId, // Show the raw ID for unassigned
                            platforms: { [userRestaurantMappingService.guessChannelForId(restaurantId)]: restaurantId },
                            isGroup: false
                        })
                    }
                })

                setRestaurantOptions(options)
                console.log('Restaurant options created:', options.length, 'total options')
            } catch (error) {
                console.error('Error setting up restaurant options:', error)
                setRestaurantOptions([])
            } finally {
                setOptionsLoading(false)
            }
        }

        updateRestaurantOptions()
    }, [userRestaurants])

    // Listen for restaurant mapping changes (when user updates profile)
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'restaurantMappings') {
                console.log('Restaurant mappings updated, refreshing options...')
                // Trigger a refresh of restaurant options
                if (userRestaurants?.restaurantIds) {
                    const updateRestaurantOptions = async () => {
                        try {
                            const restaurantMappings = await userRestaurantMappingService.getUserRestaurantMappings()
                            setRestaurantMappings(restaurantMappings)

                            const options = []
                            const assignedPlatformIds = new Set()

                            // First, add organized restaurant groups
                            if (restaurantMappings && restaurantMappings.length > 0) {
                                restaurantMappings.forEach(restaurant => {
                                    options.push({
                                        value: restaurant.id,
                                        label: restaurant.name,
                                        platforms: restaurant.platforms,
                                        isGroup: true
                                    })

                                    Object.values(restaurant.platforms || {}).forEach(platformId => {
                                        if (platformId) assignedPlatformIds.add(platformId)
                                    })
                                })
                            }

                            // Then, add unassigned platform IDs directly
                            userRestaurants.restaurantIds.forEach(restaurantId => {
                                if (!assignedPlatformIds.has(restaurantId)) {
                                    options.push({
                                        value: restaurantId,
                                        label: restaurantId,
                                        platforms: { [userRestaurantMappingService.guessChannelForId(restaurantId)]: restaurantId },
                                        isGroup: false
                                    })
                                }
                            })

                            setRestaurantOptions(options)
                            console.log('Restaurant options refreshed:', options.length, 'total options')
                        } catch (error) {
                            console.error('Error refreshing restaurant options:', error)
                        }
                    }
                    updateRestaurantOptions()
                }
            }
        }

        window.addEventListener('storage', handleStorageChange)
        return () => window.removeEventListener('storage', handleStorageChange)
    }, [userRestaurants])

    const loadThresholdSettings = async () => {
        setThresholdLoading(true)
        setThresholdError(null)

        try {
            const result = await thresholdService.getThresholds()
            if (result.success && result.data) {
                setDiscountThreshold(result.data.discountThreshold)
                setAdsThreshold(result.data.adsThreshold)
            }
        } catch (error) {
            console.error('Failed to load threshold settings:', error)
            setThresholdError('Failed to load saved thresholds. Using defaults.')
        } finally {
            setThresholdLoading(false)
        }
    }

    const fetchLastAvailableDate = async (restaurantId) => {
        setFetchingDates(prev => ({ ...prev, [restaurantId]: true }))

        try {
            // Get business email from localStorage
            const user = JSON.parse(localStorage.getItem('user') || '{}')
            const businessEmail = user.businessEmail || user.email

            let platformIds = [restaurantId] // Default: treat as direct platform ID

            // Check if this is a restaurant group
            const restaurant = restaurantMappings.find(r => r.id === restaurantId)
            if (restaurant) {
                // This is a restaurant group - get all platform IDs
                platformIds = Object.values(restaurant.platforms || {}).filter(id => id && id.trim())
                console.log(`Restaurant group ${restaurant.name} has platform IDs:`, platformIds)
            } else {
                console.log(`Using direct platform ID ${restaurantId}`)
            }

            if (platformIds.length === 0) {
                throw new Error('No platform IDs found for restaurant')
            }

            // Make API calls for all platform IDs
            const datePromises = platformIds.map(async (platformId) => {
                const requestBody = { restaurantId: platformId }
                if (businessEmail) {
                    requestBody.businessEmail = businessEmail
                }

                try {
                    const response = await fetch(`${API_BASE_URL}/get-last-date`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });
                    const data = await response.json();

                    if (data.success && data.data.lastDate) {
                        return {
                            platformId,
                            date: data.data.lastDate,
                            totalDates: data.data.totalDatesFound || 0,
                            success: true
                        }
                    } else {
                        return {
                            platformId,
                            success: false,
                            message: data.data?.message || 'No data available'
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching last date for ${platformId}:`, error)
                    return {
                        platformId,
                        success: false,
                        message: 'Error fetching data'
                    }
                }
            })

            const results = await Promise.all(datePromises)
            console.log(`Restaurant ${restaurantId} results:`, results)

            // Find the most recent date among all successful results
            const successfulResults = results.filter(r => r.success && r.date)

            if (successfulResults.length > 0) {
                // Sort by date (most recent first) and get the latest
                successfulResults.sort((a, b) => new Date(b.date) - new Date(a.date))
                const mostRecent = successfulResults[0]

                // Calculate total dates across all platforms
                const totalDatesAcrossAll = successfulResults.reduce((sum, r) => sum + (r.totalDates || 0), 0)

                setRestaurantLastDates(prev => ({
                    ...prev,
                    [restaurantId]: {
                        date: mostRecent.date,
                        hasData: true,
                        totalDates: totalDatesAcrossAll,
                        restaurantId: restaurantId,
                        platformResults: results, // Store all results (successful and failed)
                        activePlatforms: successfulResults.length
                    }
                }))
            } else {
                // No successful results
                const failedMessages = results.map(r => `${r.platformId}: ${r.message || 'No data'}`).join('; ')
                setRestaurantLastDates(prev => ({
                    ...prev,
                    [restaurantId]: {
                        hasData: false,
                        message: `No data found for any platform (${failedMessages})`,
                        platformResults: results,
                        activePlatforms: 0
                    }
                }))
            }
        } catch (error) {
            console.error('Error fetching last available date:', error)
            setRestaurantLastDates(prev => ({
                ...prev,
                [restaurantId]: {
                    hasData: false,
                    message: 'Error fetching data'
                }
            }))
        } finally {
            setFetchingDates(prev => ({ ...prev, [restaurantId]: false }))
        }
    }

    const handleRestaurantChange = async (selectedOption) => {
        if (selectedOption && !selectedRestaurants.includes(selectedOption.value)) {
            const restaurantId = selectedOption.value
            setSelectedRestaurants(prev => [...prev, restaurantId])

            // Store restaurant info for display
            const restaurant = restaurantMappings.find(r => r.id === restaurantId)
            if (restaurant) {
                // This is a restaurant group from ProfilePage
                setSelectedRestaurantInfo(prev => ({
                    ...prev,
                    [restaurantId]: restaurant
                }))
            } else {
                // This is a direct platform ID - create a basic info object
                setSelectedRestaurantInfo(prev => ({
                    ...prev,
                    [restaurantId]: {
                        id: restaurantId,
                        name: selectedOption.label, // This will be the ID itself for direct platform IDs
                        platforms: selectedOption.platforms,
                        isGroup: selectedOption.isGroup || false
                    }
                }))
            }

            // Fetch last available date immediately for this restaurant
            await fetchLastAvailableDate(restaurantId)

            // Update platform IDs based on current channel selection
            updatePlatformIds([...selectedRestaurants, restaurantId], selectedChannels)
        }
    }

    const removeRestaurant = (restaurantId) => {
        const newSelectedRestaurants = selectedRestaurants.filter(id => id !== restaurantId)
        setSelectedRestaurants(newSelectedRestaurants)

        // Clean up restaurant info
        setSelectedRestaurantInfo(prev => {
            const newInfo = { ...prev }
            delete newInfo[restaurantId]
            return newInfo
        })

        // Update platform IDs
        updatePlatformIds(newSelectedRestaurants, selectedChannels)
    }

    // Update platform IDs based on selected restaurants and channels
    const updatePlatformIds = (restaurants, channels) => {
        const platformIds = []

        restaurants.forEach(restaurantId => {
            // Check if this is a restaurant group or direct platform ID
            const restaurant = restaurantMappings.find(r => r.id === restaurantId)

            if (restaurant) {
                // This is a restaurant group - get platform IDs for selected channels
                channels.forEach(channel => {
                    const platformId = restaurant.platforms[channel]
                    if (platformId && platformId.trim() !== '') {
                        platformIds.push(platformId)
                    }
                })
            } else {
                // This is a direct platform ID - check if it matches selected channels
                const guessedChannel = userRestaurantMappingService.guessChannelForId(restaurantId)
                if (channels.includes(guessedChannel)) {
                    platformIds.push(restaurantId)
                }
            }
        })

        console.log('Updated platform IDs:', platformIds, 'from restaurants:', restaurants, 'and channels:', channels)
        setSelectedPlatformIds(platformIds)

        // Fetch last available dates for the restaurants (not platform IDs)
        restaurants.forEach(restaurantId => {
            fetchLastAvailableDate(restaurantId)
        })
    }

    const handleDiscountThresholdChange = async (value) => {
        const numValue = parseFloat(value) || 0
        setDiscountThreshold(numValue)

        // Save to DynamoDB
        await saveThresholdSetting('discountThreshold', numValue)
    }

    const handleAdsThresholdChange = async (value) => {
        const numValue = parseFloat(value) || 0
        setAdsThreshold(numValue)

        // Save to DynamoDB
        await saveThresholdSetting('adsThreshold', numValue)
    }

    const saveThresholdSetting = async (type, value) => {
        try {
            const updateData = {
                userId: 'default_user'
            }
            updateData[type] = value

            const result = await thresholdService.updateThresholds(updateData)
            if (!result.success) {
                console.error('Failed to save threshold:', result.error)
                setThresholdError(`Failed to save ${type}: ${result.error}`)
            } else {
                setThresholdError(null)
            }
        } catch (error) {
            console.error('Error saving threshold:', error)
            setThresholdError(`Failed to save ${type}`)
        }
    }

    const handleChannelChange = (channel, checked) => {
        const newSelectedChannels = checked
            ? [...selectedChannels, channel]
            : selectedChannels.filter(c => c !== channel)

        setSelectedChannels(newSelectedChannels)
        updatePlatformIds(selectedRestaurants, newSelectedChannels)
    }

    const handleSelectAllChannels = (checked) => {
        const newSelectedChannels = checked
            ? channels.map(channel => channel.value)
            : []

        setSelectedChannels(newSelectedChannels)
        updatePlatformIds(selectedRestaurants, newSelectedChannels)
    }

    const handleSubmit = () => {
        // Validate using the actual user selections
        if (!validateSelections(selectedRestaurants, selectedChannels, startDate, endDate)) {
            alert('Please select at least one restaurant, one channel, and a date range.')
            return
        }

        // Recalculate platform IDs to ensure they're up to date
        const platformIds = []
        selectedRestaurants.forEach(restaurantId => {
            const restaurant = restaurantMappings.find(r => r.id === restaurantId)

            if (restaurant) {
                // Restaurant group - get platform IDs for selected channels
                selectedChannels.forEach(channel => {
                    const platformId = restaurant.platforms[channel]
                    if (platformId && platformId.trim() !== '') {
                        platformIds.push(platformId)
                    }
                })
            } else {
                // Direct platform ID - check if it matches selected channels
                const guessedChannel = userRestaurantMappingService.guessChannelForId(restaurantId)
                if (selectedChannels.includes(guessedChannel)) {
                    platformIds.push(restaurantId)
                }
            }
        })

        if (platformIds.length === 0) {
            alert('No data available for the selected restaurants and channels. Please check your channel selections.')
            return
        }

        console.log('Submitting report with platform IDs:', platformIds)

        onGetReport({
            restaurants: platformIds,
            channels: selectedChannels,
            startDate,
            endDate,
            groupBy,
            thresholds: {
                discount: discountThreshold,
                ads: adsThreshold
            },
            restaurantInfo: selectedRestaurantInfo
        })
    }

    const channels = [
        { value: 'zomato', label: 'Zomato' },
        { value: 'swiggy', label: 'Swiggy' },
        // { value: 'takeaway', label: 'Takeaway' },
        // { value: 'subs', label: 'Subscriptions' }
    ]

    const groupByOptions = [
        { value: 'total', label: 'Total Summary' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' }
    ]

    // Custom styles for react-select to match your theme
    const customSelectStyles = {
        control: (provided, state) => ({
            ...provided,
            padding: '0.5rem 1rem',
            border: `2px solid ${state.isFocused ? '#6366f1' : '#e2e8f0'}`,
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            color: '#0f172a',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            boxShadow: state.isFocused
                ? '0 0 0 4px rgba(99, 102, 241, 0.15), 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
                : '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
            backdropFilter: 'blur(10px)',
            fontFamily: "'Inter', system-ui, sans-serif",
            minHeight: '56px',
            transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            transform: state.isFocused ? 'translateY(-2px) scale(1.02)' : 'none',
            '&:hover': {
                borderColor: '#6366f1',
                transform: 'translateY(-2px) scale(1.02)',
                background: 'linear-gradient(135deg, #ffffff 0%, rgba(99, 102, 241, 0.05) 100%)',
            }
        }),
        option: (provided, state) => ({
            ...provided,
            padding: '1rem 1.5rem',
            background: state.isSelected
                ? 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)'
                : state.isFocused
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)'
                    : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            color: state.isSelected ? 'white' : '#0f172a',
            fontWeight: state.isSelected ? '600' : '500',
            fontFamily: "'Inter', system-ui, sans-serif",
            borderRadius: '12px',
            margin: '4px 8px',
            fontSize: '1rem',
            lineHeight: '1.5',
            transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            backdropFilter: 'blur(10px)',
            cursor: 'pointer',
            '&:hover': {
                background: state.isSelected
                    ? 'linear-gradient(135deg, #4f46e5 0%, #2563eb 100%)'
                    : 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
                color: 'white',
                transform: 'translateX(4px)',
            }
        }),
        menu: (provided) => ({
            ...provided,
            borderRadius: '16px',
            border: '2px solid #6366f1',
            boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
            marginTop: '4px',
            backdropFilter: 'blur(20px)',
            background: '#ffffff',
            overflow: 'hidden'
        }),
        menuList: (provided) => ({
            ...provided,
            padding: '8px 0',
            borderRadius: '16px'
        }),
        placeholder: (provided) => ({
            ...provided,
            color: '#64748b',
            fontWeight: '500',
            fontSize: '1rem'
        }),
        singleValue: (provided) => ({
            ...provided,
            color: '#0f172a',
            fontWeight: '500'
        }),
        dropdownIndicator: (provided, state) => ({
            ...provided,
            color: '#6366f1',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : 'none',
            '&:hover': {
                color: '#4f46e5'
            }
        }),
        indicatorSeparator: () => ({
            display: 'none'
        })
    }

    // Helper function to find restaurant and channel from platform ID using user mappings
    const findRestaurantAndChannel = (platformId) => {
        const restaurantInfo = userRestaurantMappingService.findRestaurantByPlatformId(platformId)

        if (restaurantInfo) {
            return restaurantInfo
        }

        // Fallback: if no mapping found, guess based on ID pattern
        return {
            restaurantName: platformId,
            channel: userRestaurantMappingService.guessChannelForId(platformId),
            restaurantId: 'unknown'
        }
    }

    return (
        <div className="card">
            <h2 className="card-header">Get Consolidated Report</h2>

            <div className="form-group">
                <h4 className="form-label">1. Select Restaurant(s)</h4>
                {!userRestaurants ? (
                    <div style={{
                        padding: '1rem',
                        textAlign: 'center',
                        color: 'var(--primary-gray)',
                        fontStyle: 'italic',
                        border: '2px dashed #e2e8f0',
                        borderRadius: '20px',
                        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
                    }}>
                        Loading your restaurants...
                    </div>
                ) : userRestaurants.restaurantIds?.length === 0 ? (
                    <div style={{
                        padding: '1rem',
                        textAlign: 'center',
                        color: 'var(--primary-gray)',
                        fontStyle: 'italic',
                        border: '2px dashed #e2e8f0',
                        borderRadius: '20px',
                        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
                    }}>
                        No restaurants found in your account. Please upload some data files first.
                    </div>
                ) : (
                    <Select
                        value={null}
                        onChange={handleRestaurantChange}
                        options={restaurantOptions}
                        styles={customSelectStyles}
                        placeholder={optionsLoading ? "Loading restaurants..." : "Choose a restaurant to add..."}
                        isSearchable={true}
                        isClearable={false}
                        isLoading={optionsLoading}
                        isDisabled={optionsLoading}
                        menuPortalTarget={document.body}
                        menuPosition="fixed"
                    />
                )}

                {selectedRestaurants.length > 0 && (
                    <div className="selected-items">
                        {selectedRestaurants.map(restaurantId => {
                            // Get restaurant info
                            const restaurant = selectedRestaurantInfo[restaurantId]
                            const displayName = restaurant?.name || restaurantId

                            // Get last date info
                            const lastDateInfo = restaurantLastDates[restaurantId]
                            const isLoading = fetchingDates[restaurantId]

                            return (
                                <div key={restaurantId} className="selected-tag">
                                    <div>
                                        <span style={{ fontWeight: '600' }}>{displayName}</span>
                                        {isLoading && (
                                            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '2px' }}>
                                                Loading last date...
                                            </div>
                                        )}
                                        {!isLoading && lastDateInfo?.hasData && (
                                            <div style={{ fontSize: '0.8rem', color: '#ffffff', marginTop: '2px' }}>
                                                {lastDateInfo.activePlatforms > 1 ? (
                                                    // Show individual platform dates
                                                    lastDateInfo.platformResults
                                                        .filter(r => r.success)
                                                        .map((result, index) => {
                                                            // Get platform display name
                                                            const restaurant = restaurantMappings.find(r => r.id === restaurantId)
                                                            let platformName = result.platformId
                                                            if (restaurant) {
                                                                const platformChannel = Object.entries(restaurant.platforms || {})
                                                                    .find(([channel, id]) => id === result.platformId)?.[0]
                                                                if (platformChannel) {
                                                                    platformName = platformChannel.charAt(0).toUpperCase() + platformChannel.slice(1)
                                                                }
                                                            }

                                                            return (
                                                                <div key={result.platformId}>
                                                                    {platformName}: {result.date} ({result.totalDates} days)
                                                                </div>
                                                            )
                                                        })
                                                ) : (
                                                    // Single platform - show simple format
                                                    `Last data: ${lastDateInfo.date} (${lastDateInfo.totalDates} days)`
                                                )}
                                            </div>
                                        )}
                                        {!isLoading && lastDateInfo && !lastDateInfo.hasData && (
                                            <div style={{ fontSize: '0.8rem', color: '#ffffff', marginTop: '2px' }}>
                                                {lastDateInfo.message || 'No data available'}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className="remove-tag"
                                        onClick={() => removeRestaurant(restaurantId)}
                                        title="Remove restaurant"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                )}

                {selectedRestaurants.length === 0 && (
                    <p style={{
                        marginTop: '0.75rem',
                        fontSize: '0.9rem',
                        color: 'var(--primary-gray)',
                        fontStyle: 'italic',
                        textAlign: 'center'
                    }}>
                        No restaurants selected yet
                    </p>
                )}
            </div>

            <div className="form-group">
                <h4 className="form-label">2. Select Channel(s)</h4>
                <div className="checkbox-group">
                    <div className="checkbox-item" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                        <input
                            type="checkbox"
                            id="select-all-channels"
                            checked={selectedChannels.length === channels.length}
                            onChange={(e) => handleSelectAllChannels(e.target.checked)}
                            style={{ fontWeight: 'bold' }}
                        />
                        <label htmlFor="select-all-channels" style={{ fontWeight: '600', color: '#6366f1' }}>
                            Select All Channels
                        </label>
                    </div>
                    {channels.map(channel => (
                        <div key={channel.value} className="checkbox-item">
                            <input
                                type="checkbox"
                                id={`channel-${channel.value}`}
                                checked={selectedChannels.includes(channel.value)}
                                onChange={(e) => handleChannelChange(channel.value, e.target.checked)}
                            />
                            <label htmlFor={`channel-${channel.value}`}>{channel.label}</label>
                        </div>
                    ))}
                </div>
            </div>

            <div className="form-group">
                <h4 className="form-label">3. Select Date Range</h4>
                <input
                    id="dateRange"
                    type="text"
                    placeholder="Click to select date range"
                    className="form-control"
                    readOnly
                />
                {startDate && endDate && (
                    <p style={{
                        marginTop: '0.5rem',
                        fontSize: '0.9rem',
                        color: 'var(--primary-black)',
                        fontWeight: '600'
                    }}>
                        Selected: {startDate} to {endDate}
                    </p>
                )}
            </div>

            {selectedChannels.length === 1 && (
                <div className="form-group">
                    <h4 className="form-label">4. Set Percentage Thresholds (Single Channel Selected)</h4>
                    {thresholdError && (
                        <div style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            marginBottom: '1rem',
                            fontSize: '0.8rem',
                            color: '#dc2626'
                        }}>
                            ⚠️ {thresholdError}
                        </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label htmlFor="discountThreshold" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600' }}>
                                Discount Threshold (%) {thresholdLoading && '⏳'}
                            </label>
                            <input
                                id="discountThreshold"
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={discountThreshold}
                                onChange={(e) => handleDiscountThresholdChange(e.target.value)}
                                disabled={thresholdLoading}
                                className="form-control"
                                placeholder="e.g., 10"
                                style={{ padding: '0.5rem' }}
                            />
                        </div>
                        <div>
                            <label htmlFor="adsThreshold" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600' }}>
                                Ads Threshold (%) {thresholdLoading && '⏳'}
                            </label>
                            <input
                                id="adsThreshold"
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={adsThreshold}
                                onChange={(e) => handleAdsThresholdChange(e.target.value)}
                                disabled={thresholdLoading}
                                className="form-control"
                                placeholder="e.g., 5"
                                style={{ padding: '0.5rem' }}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="form-group">
                <h4 className="form-label">{selectedChannels.length === 1 ? '5' : '4'}. Group Data By</h4>
                <div className="radio-group">
                    {groupByOptions.map(option => (
                        <div key={option.value} className="radio-item">
                            <input
                                type="radio"
                                id={`groupBy-${option.value}`}
                                name="groupBy"
                                value={option.value}
                                checked={groupBy === option.value}
                                onChange={(e) => setGroupBy(e.target.value)}
                            />
                            <label htmlFor={`groupBy-${option.value}`}>{option.label}</label>
                        </div>
                    ))}
                </div>
            </div>

            <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={loading}
            >
                {loading ? 'Getting Report...' : 'Get Report'}
            </button>
        </div>
    )
}

export default ReportControls