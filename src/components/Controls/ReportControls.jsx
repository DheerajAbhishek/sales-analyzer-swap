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
            if (!userRestaurants?.restaurantIds) {
                setRestaurantOptions([])
                return
            }

            setOptionsLoading(true)
            try {
                // Get unique restaurants from mappings
                const restaurantMappings = await userRestaurantMappingService.getUserRestaurantMappings()
                setRestaurantMappings(restaurantMappings) // Store mappings for later use

                const uniqueRestaurants = new Map()

                // Create restaurant options from mappings
                restaurantMappings.forEach(restaurant => {
                    if (!uniqueRestaurants.has(restaurant.id)) {
                        uniqueRestaurants.set(restaurant.id, {
                            value: restaurant.id,
                            label: restaurant.name,
                            platforms: restaurant.platforms
                        })
                    }
                })

                setRestaurantOptions(Array.from(uniqueRestaurants.values()))
            } catch (error) {
                console.error('Error updating restaurant options:', error)
                // Fallback to simple ID-based options
                const fallbackOptions = userRestaurants.restaurantIds
                    ?.map(restaurantId => ({
                        value: restaurantId,
                        label: restaurantId
                    })) || []
                setRestaurantOptions(fallbackOptions)
            } finally {
                setOptionsLoading(false)
            }
        }

        updateRestaurantOptions()
    }, [userRestaurants, selectedRestaurants])

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
            const response = await fetch(`${API_BASE_URL}/get-last-date`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ restaurantId })
            });
            const data = await response.json();

            console.log(`Restaurant ${restaurantId} response:`, data);

            if (data.success && data.data.lastDate) {
                setRestaurantLastDates(prev => ({
                    ...prev,
                    [restaurantId]: {
                        date: data.data.lastDate,
                        hasData: true,
                        totalDates: data.data.totalDatesFound || 0,
                        restaurantId: restaurantId
                    }
                }))
            } else {
                setRestaurantLastDates(prev => ({
                    ...prev,
                    [restaurantId]: {
                        hasData: false,
                        message: data.data?.message || 'No data available'
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
                setSelectedRestaurantInfo(prev => ({
                    ...prev,
                    [restaurantId]: restaurant
                }))
            }

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
            const restaurant = restaurantMappings.find(r => r.id === restaurantId)
            if (restaurant) {
                channels.forEach(channel => {
                    const platformId = restaurant.platforms[channel]
                    if (platformId && platformId.trim() !== '') {
                        platformIds.push(platformId)
                    }
                })
            }
        })

        setSelectedPlatformIds(platformIds)

        // Fetch last available dates for the platform IDs
        platformIds.forEach(platformId => {
            fetchLastAvailableDate(platformId)
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
        if (checked) {
            setSelectedChannels(channels.map(channel => channel.value))
        } else {
            setSelectedChannels([])
        }
    }

    const handleSubmit = () => {
        if (!validateSelections(selectedPlatformIds, selectedChannels, startDate, endDate)) {
            alert('Please select at least one restaurant, one channel, and a date range.')
            return
        }

        onGetReport({
            restaurants: selectedPlatformIds, // Use platform IDs instead of restaurant IDs
            channels: selectedChannels,
            startDate,
            endDate,
            groupBy,
            thresholds: {
                discount: discountThreshold,
                ads: adsThreshold
            }
        })
    }

    const channels = [
        { value: 'zomato', label: 'Zomato' },
        { value: 'swiggy', label: 'Swiggy' },
        { value: 'takeaway', label: 'Takeaway' },
        { value: 'subs', label: 'Subscriptions' }
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

                            return (
                                <div key={restaurantId} className="selected-tag">
                                    <div>
                                        <span>{displayName}</span>
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

            <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--primary-gray)' }}>
                <p><strong>Selected:</strong></p>
                <p>{selectedRestaurants.length} restaurant(s)</p>
                <p>{selectedChannels.length} channel(s)</p>
                <p>{selectedPlatformIds.length} platform ID(s) will be queried</p>
                <p>{startDate && endDate ? 'Date range set' : 'No date range'}</p>
            </div>
        </div>
    )
}

export default ReportControls