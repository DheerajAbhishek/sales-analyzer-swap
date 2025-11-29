import React, { useState, useEffect } from 'react';
import { dateService } from '../../services/dateService';

const MissingDatesIndicator = ({
    timeSeriesData,
    selections,
    dataType,
    allRestaurantDetails
}) => {
    const [missingDatesInfo, setMissingDatesInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);

    // Disable this check for on-demand channels
    const { channels } = selections;
    const onDemandChannels = ['takeaway', 'corporate'];
    const allChannelsAreOnDemand = channels && channels.length > 0 && channels.every(ch => onDemandChannels.includes(ch));

    if (allChannelsAreOnDemand) {
        return null; // Do not render for on-demand channels
    }

    useEffect(() => {
        const checkMissingDates = async () => {
            // Handle both possible date field names (dateFrom/dateTo or startDate/endDate)
            const dateFrom = selections?.dateFrom || selections?.startDate;
            const dateTo = selections?.dateTo || selections?.endDate;

            if (!dateFrom || !dateTo || !allRestaurantDetails?.length) {
                console.log('❌ Missing required data for missing dates check:', {
                    dateFrom,
                    dateTo,
                    startDate: selections?.startDate,
                    endDate: selections?.endDate,
                    restaurantDetails: allRestaurantDetails,
                    selectionsKeys: Object.keys(selections || {})
                });
                return;
            }

            setLoading(true);

            try {
                // Check missing dates for all selected restaurants/channels
                const allMissingDatesResults = [];

                for (const detail of allRestaurantDetails) {
                    console.log(`🔍 Checking missing dates for restaurant: ${detail.name} (${detail.id})`);

                    const result = await dateService.checkMissingDates(
                        detail.id,
                        dateFrom,
                        dateTo
                    );

                    // Handle the API response structure correctly
                    const missingDates = result?.data?.missingDates || result?.missingDates || [];
                    console.log(`📊 Missing dates for ${detail.name}:`, missingDates);

                    if (missingDates && missingDates.length > 0) {
                        allMissingDatesResults.push({
                            restaurantId: detail.id,
                            restaurantName: detail.name,
                            platform: detail.platform, // Add platform information
                            missingDates: missingDates,
                            totalMissing: missingDates.length
                        });
                    }
                }

                console.log('� All missing dates results:', allMissingDatesResults);

                if (allMissingDatesResults.length > 0) {
                    // Calculate total missing dates across all restaurants
                    const totalMissingCount = allMissingDatesResults.reduce(
                        (sum, result) => sum + result.totalMissing,
                        0
                    );

                    setMissingDatesInfo({
                        results: allMissingDatesResults,
                        totalMissingCount,
                        hasMultipleRestaurants: allMissingDatesResults.length > 1
                    });
                } else {
                    setMissingDatesInfo({
                        results: [],
                        totalMissingCount: 0,
                        hasMultipleRestaurants: allRestaurantDetails.length > 1
                    });
                }

            } catch (error) {
                console.error('❌ Error checking missing dates:', error);
                setMissingDatesInfo(null);
            } finally {
                setLoading(false);
            }
        };

        checkMissingDates();
    }, [selections?.dateFrom, selections?.dateTo, selections?.startDate, selections?.endDate, allRestaurantDetails]);

    // Show loading state
    if (loading) {
        return (
            <div style={{
                background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                border: '1px solid #9ca3af',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2em' }}>🔍</span>
                    <p style={{ margin: 0, fontWeight: '600', color: '#374151', fontSize: '0.9rem' }}>
                        Checking for missing data periods across all channels...
                    </p>
                </div>
            </div>
        );
    }

    // If no missing dates info available
    if (!missingDatesInfo) {
        return null;
    }

    // If no missing dates found
    if (missingDatesInfo.totalMissingCount === 0) {
        const dateFrom = selections?.dateFrom || selections?.startDate;
        const dateTo = selections?.dateTo || selections?.endDate;
        const daysDiff = Math.ceil((new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24));

        return (
            <div style={{
                background: 'linear-gradient(135deg, #e0f2fe 0%, #b3e5fc 100%)',
                border: '1px solid #0288d1',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2em' }}>📊</span>
                    <div>
                        <p style={{ margin: 0, fontWeight: '600', color: '#01579b', fontSize: '0.9rem' }}>
                            Complete Data Coverage - All Channels
                        </p>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#0277bd' }}>
                            All {daysDiff + 1} day{daysDiff !== 0 ? 's' : ''} have data available across all selected channels
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Format date for display
    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    // Group consecutive dates
    const groupConsecutiveDates = (dates) => {
        if (dates.length === 0) return [];

        const sortedDates = [...dates].sort();
        const groups = [];
        let currentGroup = [sortedDates[0]];

        for (let i = 1; i < sortedDates.length; i++) {
            const current = new Date(sortedDates[i]);
            const previous = new Date(sortedDates[i - 1]);
            const dayDiff = (current - previous) / (1000 * 60 * 60 * 24);

            if (dayDiff === 1) {
                currentGroup.push(sortedDates[i]);
            } else {
                groups.push(currentGroup);
                currentGroup = [sortedDates[i]];
            }
        }
        groups.push(currentGroup);

        return groups;
    };

    // Format date groups for display
    const formatDateGroups = (groups) => {
        return groups.map(group => {
            if (group.length === 1) {
                return formatDate(group[0]);
            } else {
                return `${formatDate(group[0])} - ${formatDate(group[group.length - 1])}`;
            }
        });
    };

    return (
        <div style={{
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            border: '1px solid #f59e0b',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '16px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1.2em' }}>⚠️</span>
                <div>
                    <p style={{ margin: 0, fontWeight: '600', color: '#92400e', fontSize: '0.9rem' }}>
                        Missing Data Periods
                    </p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#a16207' }}>
                        {missingDatesInfo.totalMissingCount} total missing dates across {missingDatesInfo.results.length} channel{missingDatesInfo.results.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => setExpanded(!expanded)}
                    style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: '1px solid #f59e0b',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        color: '#92400e',
                        cursor: 'pointer',
                        fontWeight: '500'
                    }}
                >
                    {expanded ? 'Hide' : 'Show'} Details
                </button>
            </div>

            {expanded && (
                <div style={{
                    background: 'rgba(255, 255, 255, 0.5)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    color: '#78350f'
                }}>
                    {missingDatesInfo.results.map((result, index) => {
                        const dateGroups = groupConsecutiveDates(result.missingDates);
                        const formattedGroups = formatDateGroups(dateGroups);

                        return (
                            <div key={result.restaurantId} style={{ marginBottom: index < missingDatesInfo.results.length - 1 ? '12px' : '0' }}>
                                <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>
                                    {result.restaurantName.replace(' (Auto-loaded)', '')} - {result.platform.charAt(0).toUpperCase() + result.platform.slice(1)} - {result.totalMissing} missing dates:
                                </p>
                                <p style={{ margin: 0, lineHeight: '1.4', paddingLeft: '12px' }}>
                                    {formattedGroups.join(', ')}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MissingDatesIndicator;