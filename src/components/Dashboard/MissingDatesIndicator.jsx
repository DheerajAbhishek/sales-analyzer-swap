import React, { useState, useEffect } from 'react';
import { dateService } from '../../services/dateService';

const MissingDatesIndicator = ({
    timeSeriesData,
    selections,
    dataType,
    allRestaurantDetails,
    dashboardData
}) => {
    const [missingDatesInfo, setMissingDatesInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const { channels } = selections;
    const onDemandChannels = ['takeaway', 'corporate'];
    const hasOnDemandChannels = channels && channels.length > 0 && channels.some(ch => onDemandChannels.includes(ch));

    useEffect(() => {
        const checkMissingDates = async () => {
            const dateFrom = selections?.dateFrom || selections?.startDate;
            const dateTo = selections?.dateTo || selections?.endDate;

            if (!dateFrom || !dateTo || !allRestaurantDetails?.length) {
                console.log('[MISSING_DATES] Missing required data');
                return;
            }

            setLoading(true);

            try {
                const allMissingDatesResults = [];

                // For on-demand channels, get missing dates from Lambda response
                if (hasOnDemandChannels && dashboardData?.results) {
                    console.log('[MISSING_DATES] Checking on-demand channels, results:', dashboardData.results);

                    for (let i = 0; i < dashboardData.results.length; i++) {
                        const result = dashboardData.results[i];
                        const detail = dashboardData.details[i];

                        console.log(`[MISSING_DATES] Result ${i}:`, {
                            platform: detail.platform,
                            missingDates: result?.missingDates,
                            dataCoverage: result?.dataCoverage
                        });

                        // Only process if this is an on-demand channel
                        if (!onDemandChannels.includes(detail.platform)) {
                            continue;
                        }

                        if (result?.missingDates && Array.isArray(result.missingDates) && result.missingDates.length > 0) {
                            console.log(`[MISSING_DATES] ${detail.name} (${detail.platform}):`, result.missingDates);
                            allMissingDatesResults.push({
                                restaurantId: detail.id,
                                restaurantName: detail.name,
                                platform: detail.platform,
                                missingDates: result.missingDates,
                                dataCoverage: result.dataCoverage,
                                totalMissing: result.missingDates.length
                            });
                        }
                    }
                }

                // For traditional channels, use dateService
                for (const detail of allRestaurantDetails) {
                    // Skip if this is an on-demand channel and we already processed it above
                    if (onDemandChannels.includes(detail.platform)) {
                        continue;
                    }

                    const result = await dateService.checkMissingDates(
                        detail.id,
                        dateFrom,
                        dateTo
                    );

                    const missingDates = result?.data?.missingDates || result?.missingDates || [];
                    console.log(`[MISSING_DATES] ${detail.name}:`, missingDates);

                    if (missingDates && missingDates.length > 0) {
                        allMissingDatesResults.push({
                            restaurantId: detail.id,
                            restaurantName: detail.name,
                            platform: detail.platform,
                            missingDates: missingDates,
                            totalMissing: missingDates.length
                        });
                    }
                }

                if (allMissingDatesResults.length > 0) {
                    // Merge missing dates for same restaurant if both takeaway and corporate exist
                    const mergedResults = {};

                    for (const result of allMissingDatesResults) {
                        const key = result.restaurantId;

                        if (!mergedResults[key]) {
                            mergedResults[key] = {
                                restaurantId: result.restaurantId,
                                restaurantName: result.restaurantName,
                                platform: result.platform,
                                missingDates: [...result.missingDates],
                                dataCoverage: result.dataCoverage,
                                totalMissing: result.totalMissing,
                                channels: [result.platform]
                            };
                        } else {
                            // When merging multiple channels for same restaurant,
                            // a date is only "missing" if it's missing from ALL channels
                            // So we need the INTERSECTION of missing dates
                            const currentMissing = new Set(mergedResults[key].missingDates);
                            const newMissing = new Set(result.missingDates);
                            const intersection = Array.from(currentMissing).filter(date => newMissing.has(date));

                            mergedResults[key].missingDates = intersection;
                            mergedResults[key].totalMissing = intersection.length;
                            mergedResults[key].channels.push(result.platform);

                            // Recalculate coverage after merging
                            const dateFrom = selections?.dateFrom || selections?.startDate;
                            const dateTo = selections?.dateTo || selections?.endDate;
                            if (dateFrom && dateTo) {
                                const totalDays = Math.ceil((new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24)) + 1;
                                const daysWithData = totalDays - mergedResults[key].totalMissing;
                                mergedResults[key].dataCoverage = `${daysWithData}/${totalDays}`;
                            }

                            // Update platform display for merged entries
                            if (mergedResults[key].channels.length === 2) {
                                mergedResults[key].platform = `${mergedResults[key].channels.join(' & ')}`;
                            }
                        }
                    }

                    const finalResults = Object.values(mergedResults);
                    const totalMissingCount = finalResults.reduce(
                        (sum, result) => sum + result.totalMissing,
                        0
                    );

                    setMissingDatesInfo({
                        results: finalResults,
                        totalMissingCount,
                        hasMultipleRestaurants: finalResults.length > 1
                    });
                } else {
                    setMissingDatesInfo({
                        results: [],
                        totalMissingCount: 0,
                        hasMultipleRestaurants: allRestaurantDetails.length > 1
                    });
                }

            } catch (error) {
                console.error('[MISSING_DATES] Error checking:', error);
                setMissingDatesInfo(null);
            } finally {
                setLoading(false);
            }
        };

        checkMissingDates();
    }, [selections?.dateFrom, selections?.dateTo, selections?.startDate, selections?.endDate, allRestaurantDetails, dashboardData]);

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
                    <span style={{ fontSize: '1.2em' }}>→</span>
                    <p style={{ margin: 0, fontWeight: '600', color: '#374151', fontSize: '0.9rem' }}>
                        Checking for missing data periods...
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
                    <span style={{ fontSize: '1.2em' }}>OK</span>
                    <div>
                        <p style={{ margin: 0, fontWeight: '600', color: '#01579b', fontSize: '0.9rem' }}>
                            Complete Data Coverage
                        </p>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#0277bd' }}>
                            All {daysDiff + 1} day(s) have data available
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
                <span style={{ fontSize: '1.2em' }}>!</span>
                <div>
                    <p style={{ margin: 0, fontWeight: '600', color: '#92400e', fontSize: '0.9rem' }}>
                        Missing Data Periods
                    </p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#a16207' }}>
                        {missingDatesInfo.totalMissingCount} total missing dates across {missingDatesInfo.results.length} channel(s)
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
                        console.log('[MISSING_DATES] Rendering result:', result);
                        const dateGroups = groupConsecutiveDates(result.missingDates);
                        const formattedGroups = formatDateGroups(dateGroups);
                        console.log('[MISSING_DATES] Date groups:', dateGroups);
                        console.log('[MISSING_DATES] Formatted groups:', formattedGroups);

                        return (
                            <div key={result.restaurantId} style={{ marginBottom: index < missingDatesInfo.results.length - 1 ? '12px' : '0' }}>
                                <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>
                                    {result.restaurantName} ({result.platform})
                                    {result.dataCoverage && ` - ${result.dataCoverage} dates`}
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
