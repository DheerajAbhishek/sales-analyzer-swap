import React, { useState, useEffect } from "react";
import SummaryCards from "./SummaryCards.jsx";
import ChartsGrid from "../Charts/ChartsGrid.jsx";
import ChartFilter from "../Charts/ChartFilter.jsx";
import ExpensesSection from "../PnL/ExpensesSection.jsx";
import MissingDatesIndicator from "./MissingDatesIndicator.jsx";
import { isFullMonthSelection } from "../../utils/helpers";
import { METRICS_CONFIG } from "../../utils/constants";

const Dashboard = ({ data, user }) => {
    const { results, details, selections, groupBy, thresholds } = data;
    const [processedData, setProcessedData] = useState(null);
    const [monthlyData, setMonthlyData] = useState(null);
    const [showPnL, setShowPnL] = useState(false);
    const [selectedCharts, setSelectedCharts] = useState(["grossSale"]);

    const handleFilterChange = (newSelectedCharts) => {
        setSelectedCharts(newSelectedCharts);
    };

    useEffect(() => {
        // Log each result individually to see the structure
        results?.forEach((result, index) => {
        });

        if (groupBy === "total") {
            const processed = processTotalSummary(results, details);
            setProcessedData(processed);

            // Process monthly data for comparison
            const monthly = processMonthlyData(results, details);
            setMonthlyData(monthly);

            // Check if P&L should be shown
            const { restaurants, channels, startDate, endDate } = selections;
            const shouldShowPnL =
                restaurants.length === 1 &&
                channels.length === 4 &&
                isFullMonthSelection(startDate, endDate);
            setShowPnL(shouldShowPnL);
        } else {
            const processed = processTimeSeries(results, details);
            setProcessedData(processed);

            // Process monthly data even for weekly/monthly views
            const monthly = processMonthlyData(results, details);
            setMonthlyData(monthly);
            setShowPnL(false);
        }
    }, [data]);

    const processTotalSummary = (results, details) => {
        const individualRestaurantData = [];
        const combinedData = {
            noOfOrders: 0,
            grossSale: 0,
            gstOnOrder: 0,
            discounts: 0,
            packings: 0,
            ads: 0,
            commissionAndTaxes: 0,
            payout: 0,
            netSale: 0,
            nbv: 0,
        };
        let discountBreakdownData = {};
        // Build channel mapping - when auto is selected, it returns results for swiggy and zomato
        const channelMapping = ["swiggy", "zomato"];

        // Iterate through each result (one per restaurant-channel combination)
        results.forEach((apiResult, index) => {
            const detail = details[index];
            if (!detail) {
                return;
            }

            // Get channel - if platform is 'auto', use the channel mapping based on index
            let channel = detail.platform || "unknown";

            // If channel is 'auto', try to infer from the API response structure or use mapping
            if (channel === "auto") {
                // Try to get from API response first
                channel =
                    apiResult?.body?.channel ||
                    apiResult?.channel ||
                    apiResult?.body?.platform ||
                    apiResult?.platform;

                // If still not found, try to infer from discount breakdown structure
                if (!channel && apiResult?.discountBreakdown) {
                    // Check if discount breakdown has platform-specific keys
                    const breakdownKeys = Object.keys(apiResult.discountBreakdown);
                    // Swiggy has keys like "60", "50", etc. (percentage discounts)
                    // Zomato has keys like "Flat Γé╣100 off", "20% off upto Γé╣50", etc. (descriptive)
                    const hasPercentageKeys = breakdownKeys.some(
                        (key) => /^\d+$/.test(key) && key !== "TOTAL",
                    );
                    const hasDescriptiveKeys = breakdownKeys.some(
                        (key) =>
                            key.includes("Γé╣") || key.includes("off") || key.includes("upto"),
                    );

                    if (hasPercentageKeys && !hasDescriptiveKeys) {
                        channel = "swiggy";
                    } else if (hasDescriptiveKeys) {
                        channel = "zomato";
                    }
                }

                // Final fallback - this is risky and should be replaced with explicit backend response
                if (!channel || channel === "auto") {
                    console.error(
                        `Γ¥î CRITICAL: Unable to determine channel for index ${index}. Backend must provide explicit channel information.`,
                    );
                    channel = "unknown";
                } else {
                }
            }
            const restaurantName = detail.name || `Restaurant ${index + 1}`;
            // Check if this result has data
            if (!apiResult || apiResult.message || !apiResult.consolidatedInsights) {
                // Add zero values
                individualRestaurantData.push({
                    name: `${restaurantName} (${channel})`,
                    platform: channel,
                    restaurantId: detail.id,
                    metrics: {
                        noOfOrders: 0,
                        grossSale: 0,
                        gstOnOrder: 0,
                        discounts: 0,
                        packings: 0,
                        ads: 0,
                        commissionAndTaxes: 0,
                        payout: 0,
                        netSale: 0,
                        nbv: 0,
                        grossSaleAfterGST: 0,
                        commissionPercent: 0,
                        discountPercent: 0,
                        adsPercent: 0,
                    },
                });
                return;
            }

            const insights = apiResult.consolidatedInsights;
            // Add this restaurant-channel's data to individual results
            const grossSaleAfterGST = insights.grossSale - (insights.gstOnOrder || 0);
            individualRestaurantData.push({
                name: `${restaurantName} (${channel})`,
                platform: channel,
                restaurantId: detail.id,
                metrics: {
                    ...insights,
                    grossSaleAfterGST,
                    commissionPercent:
                        insights.nbv > 0
                            ? (insights.commissionAndTaxes / insights.nbv) * 100
                            : 0,
                    discountPercent:
                        grossSaleAfterGST > 0
                            ? (insights.discounts / grossSaleAfterGST) * 100
                            : 0,
                    adsPercent:
                        grossSaleAfterGST > 0
                            ? (insights.ads / grossSaleAfterGST) * 100
                            : 0,
                },
            });

            // Add to combined totals
            Object.keys(combinedData).forEach((key) => {
                combinedData[key] += insights[key] || 0;
            });

            // Get discount breakdown if available
            if (apiResult.discountBreakdown) {
                const channelKey = `${channel}_${restaurantName}`;
                discountBreakdownData[channelKey] = {
                    ...apiResult.discountBreakdown,
                    platform: channel,
                    restaurantName: restaurantName,
                };
            }
        });

        // Calculate combined percentages
        const combinedGrossSaleAfterGST =
            combinedData.grossSale - combinedData.gstOnOrder;
        combinedData.grossSaleAfterGST = combinedGrossSaleAfterGST;
        combinedData.commissionPercent =
            combinedData.nbv > 0
                ? (combinedData.commissionAndTaxes / combinedData.nbv) * 100
                : 0;
        combinedData.discountPercent =
            combinedGrossSaleAfterGST > 0
                ? (combinedData.discounts / combinedGrossSaleAfterGST) * 100
                : 0;
        combinedData.adsPercent =
            combinedGrossSaleAfterGST > 0
                ? (combinedData.ads / combinedGrossSaleAfterGST) * 100
                : 0;
        return {
            type: "total",
            combinedData,
            individualData: individualRestaurantData,
            discountBreakdown:
                Object.keys(discountBreakdownData).length > 0
                    ? discountBreakdownData
                    : null,
        };
    };

    const processMonthlyData = (results, details) => {
        const monthlyData = {};
        const keysToSum = [
            "noOfOrders",
            "grossSale",
            "gstOnOrder",
            "discounts",
            "packings",
            "ads",
            "commissionAndTaxes",
            "payout",
            "netSale",
            "nbv",
        ];
        results.forEach((data, index) => {
            const timeSeriesData =
                data.body?.timeSeriesData || data.timeSeriesData || [];
            // Always process from timeSeriesData when available (for all groupBy modes)
            if (timeSeriesData && timeSeriesData.length > 0) {
                timeSeriesData.forEach((periodData, periodIndex) => {
                    const period = periodData.period;
                    const monthKey = period.substring(0, 7); // Gets YYYY-MM
                    if (!monthlyData[monthKey]) {
                        monthlyData[monthKey] = {};
                        keysToSum.forEach((key) => (monthlyData[monthKey][key] = 0));
                    }

                    // Sum data from all platforms for this period
                    const platforms = ["zomato", "swiggy", "takeaway", "subs"];
                    platforms.forEach((platform) => {
                        const platformData = periodData[platform] || {};
                        keysToSum.forEach((key) => {
                            if (platformData[key] && typeof platformData[key] === "number") {
                                const oldValue = monthlyData[monthKey][key];
                                monthlyData[monthKey][key] += platformData[key];
                            }
                        });
                    });
                });
            } else if (groupBy === "total") {
                // Fallback for total view if timeSeriesData is not available
                // (This shouldn't normally happen, but kept for safety)
                const insights =
                    data.body?.consolidatedInsights || data.consolidatedInsights || {};
                if (Object.keys(insights).length > 0) {
                    const yearMonth = selections.startDate.substring(0, 7);
                    if (!monthlyData[yearMonth]) {
                        monthlyData[yearMonth] = {};
                        keysToSum.forEach((key) => (monthlyData[yearMonth][key] = 0));
                    }
                    keysToSum.forEach((key) => {
                        if (insights[key] && typeof insights[key] === "number") {
                            monthlyData[yearMonth][key] += insights[key];
                        }
                    });
                }
            }
        });
        // Calculate derived metrics for each month
        Object.keys(monthlyData).forEach((month) => {
            const data = monthlyData[month];
            data.grossSaleAfterGST = data.grossSale - (data.gstOnOrder || 0);
            data.commissionPercent =
                data.nbv > 0 ? (data.commissionAndTaxes / data.nbv) * 100 : 0;
            data.discountPercent =
                data.grossSaleAfterGST > 0
                    ? (data.discounts / data.grossSaleAfterGST) * 100
                    : 0;
            data.adsPercent =
                data.grossSaleAfterGST > 0
                    ? (data.ads / data.grossSaleAfterGST) * 100
                    : 0;
        });
        // Return monthly data regardless of the number of months
        return monthlyData;
    };

    const processTimeSeries = (results, details) => {
        const timeSeries = {};
        const selectedChannels = selections.channels || [];

        // Determine if we should show zero values for missing channels
        const shouldShowZeroValues = selectedChannels.length > 1;
        results.forEach((data, index) => {
            const channel = selectedChannels[index];
            // Skip results that don't have data
            if (!data || data.message || !data.timeSeriesData) {
                return;
            }

            const timeData = data.body?.timeSeriesData || data.timeSeriesData || [];

            // Only process if we have actual time data
            if (timeData.length === 0) {
                return;
            }
            timeData.forEach((periodData, periodIndex) => {
                let period = periodData.period;
                if (groupBy === "month") {
                    period = period.substring(0, 7); // "YYYY-MM-DD" -> "YYYY-MM"
                }

                if (!timeSeries[period]) {
                    timeSeries[period] = {};
                }

                // Extract all platform keys from the period data (excluding 'period' key)
                const platformKeys = Object.keys(periodData).filter(
                    (k) => k !== "period",
                );

                if (periodIndex === 0) {
                }

                // Process each platform in this period
                platformKeys.forEach((platform) => {
                    const platformData = periodData[platform];

                    if (periodIndex === 0) {
                    }

                    // Add or merge platform data
                    if (!timeSeries[period][platform]) {
                        timeSeries[period][platform] = platformData;
                    } else {
                        // Merge if somehow we have duplicate platform data
                        for (const key in platformData) {
                            if (typeof platformData[key] === "number") {
                                timeSeries[period][platform][key] =
                                    (timeSeries[period][platform][key] || 0) + platformData[key];
                            } else {
                                timeSeries[period][platform][key] = platformData[key];
                            }
                        }
                    }
                });
            });
        });
        return {
            type: "timeSeries",
            timeSeriesData: timeSeries,
        };
    };

    if (!processedData) {
        return (
            <div className="card">
                <div className="status loading">Processing data...</div>
            </div>
        );
    }

    // Calculate total summary from time series data when in weekly/monthly view
    const calculateSummaryFromTimeSeries = (timeSeriesData) => {
        const summary = {
            combinedData: {
                noOfOrders: 0,
                grossSale: 0,
                gstOnOrder: 0,
                discounts: 0,
                packings: 0,
                ads: 0,
                commissionAndTaxes: 0,
                payout: 0,
                netSale: 0,
                nbv: 0,
            },
            individualData: [],
        };

        const selectedChannels = selections.channels || [];
        const shouldShowZeroValues = selectedChannels.length > 1;
        // Initialize restaurant-wise data
        const restaurantData = {};

        // Sum up all metrics for each period
        Object.values(timeSeriesData).forEach((periodData) => {
            Object.entries(periodData).forEach(([platform, metrics]) => {
                // Check if platform has meaningful data
                const hasData = Object.values(metrics).some(
                    (value) => typeof value === "number" && value > 0,
                );

                if (!hasData && !shouldShowZeroValues) {
                    return;
                }

                if (!hasData && shouldShowZeroValues) {
                }

                // Add to combined totals (only meaningful values contribute to totals)
                if (hasData) {
                    Object.keys(summary.combinedData).forEach((key) => {
                        if (typeof metrics[key] === "number") {
                            summary.combinedData[key] += metrics[key];
                        }
                    });
                }

                // Accumulate restaurant-wise data (include zeros when shouldShowZeroValues is true)
                if (!restaurantData[platform]) {
                    restaurantData[platform] = {
                        noOfOrders: 0,
                        grossSale: 0,
                        gstOnOrder: 0,
                        discounts: 0,
                        packings: 0,
                        ads: 0,
                        commissionAndTaxes: 0,
                        payout: 0,
                        netSale: 0,
                        nbv: 0,
                    };
                }
                Object.keys(restaurantData[platform]).forEach((key) => {
                    if (typeof metrics[key] === "number") {
                        restaurantData[platform][key] += metrics[key];
                    }
                });
            });
        });

        // Calculate percentages for combined data
        const grossSaleAfterGST =
            summary.combinedData.grossSale - (summary.combinedData.gstOnOrder || 0);
        summary.combinedData.grossSaleAfterGST = grossSaleAfterGST;
        summary.combinedData.commissionPercent =
            summary.combinedData.nbv > 0
                ? (summary.combinedData.commissionAndTaxes / summary.combinedData.nbv) *
                100
                : 0;
        summary.combinedData.discountPercent =
            grossSaleAfterGST > 0
                ? (summary.combinedData.discounts / grossSaleAfterGST) * 100
                : 0;
        summary.combinedData.adsPercent =
            grossSaleAfterGST > 0
                ? (summary.combinedData.ads / grossSaleAfterGST) * 100
                : 0;

        // Process individual restaurant data (only platforms with actual data)
        Object.entries(restaurantData).forEach(([platform, metrics]) => {
            const grossSaleAfterGST = metrics.grossSale - (metrics.gstOnOrder || 0);
            summary.individualData.push({
                name: platform,
                platform,
                metrics: {
                    ...metrics,
                    grossSaleAfterGST,
                    commissionPercent:
                        metrics.nbv > 0
                            ? (metrics.commissionAndTaxes / metrics.nbv) * 100
                            : 0,
                    discountPercent:
                        grossSaleAfterGST > 0
                            ? (metrics.discounts / grossSaleAfterGST) * 100
                            : 0,
                    adsPercent:
                        grossSaleAfterGST > 0 ? (metrics.ads / grossSaleAfterGST) * 100 : 0,
                },
            });
        });
        return summary;
    };

    // Get the appropriate summary data based on groupBy
    const totalSummary =
        groupBy === "total"
            ? processedData
            : processedData.type === "timeSeries"
                ? calculateSummaryFromTimeSeries(processedData.timeSeriesData)
                : null;

    const { startDate, endDate } = selections;

    // Generate restaurant names prefix for title
    let restaurantPrefix = "";
    let fullRestaurantList = "";
    let shouldShowHover = false;

    if (details && details.length > 0) {
        // Create display names that include both name and ID when available
        const displayNames = details.map((detail) => {
            const hasRealName = detail.name && !detail.name.startsWith("Restaurant ");
            if (hasRealName) {
                return `${detail.name} (${detail.id})`;
            } else {
                return detail.id;
            }
        });

        // Create full list for hover tooltip
        fullRestaurantList = displayNames.join(", ");

        if (displayNames.length === 1) {
            restaurantPrefix = `${displayNames[0]} - `;
        } else if (displayNames.length <= 2) {
            restaurantPrefix = `${displayNames.join(", ")} - `;
        } else {
            restaurantPrefix = `${displayNames.slice(0, 2).join(", ")} & ${displayNames.length - 2} more - `;
            shouldShowHover = true;
        }
    }

    const title = `${restaurantPrefix}${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} Report (${startDate} to ${endDate})`;

    if (!totalSummary) {
        return (
            <div className="card">
                <div className="status loading">Processing summary data...</div>
            </div>
        );
    }

    return (
        <div className="card">
            <h1
                className="dashboard-title"
                title={
                    shouldShowHover ? `All restaurants: ${fullRestaurantList}` : undefined
                }
            >
                {title}
            </h1>

            {/* Show missing dates indicator for any data type */}
            {processedData && selections?.startDate && selections?.endDate && (
                <>
                    <MissingDatesIndicator
                        timeSeriesData={processedData.timeSeriesData}
                        selections={selections}
                        dataType={processedData.type}
                        user={user}
                    />
                </>
            )}

            {totalSummary.combinedData && (
                <>
                    <SummaryCards
                        data={totalSummary.combinedData}
                        selections={selections}
                        discountBreakdown={totalSummary.discountBreakdown}
                        thresholds={thresholds}
                        monthlyData={monthlyData}
                        groupBy={groupBy}
                    />

                    {/* Chart Filter Component */}
                    <ChartFilter onFilterChange={handleFilterChange} />

                    {/* Only show comparison charts for total view */}
                    {groupBy === "total" && (
                        <>
                            <ChartsGrid
                                type="comparison"
                                data={totalSummary.individualData}
                                selectedCharts={selectedCharts}
                            />
                            {showPnL && (
                                <ExpensesSection
                                    selections={selections}
                                    grossSale={totalSummary.combinedData.grossSale}
                                    grossSaleAfterGST={
                                        totalSummary.combinedData.grossSaleAfterGST
                                    }
                                    netSale={totalSummary.combinedData.netSale}
                                />
                            )}
                        </>
                    )}

                    {/* Show time series charts for monthly or weekly grouping */}
                    {processedData.type === "timeSeries" && (
                        <>
                            <ChartsGrid
                                type="timeSeries"
                                data={processedData.timeSeriesData}
                                groupBy={groupBy}
                                selectedCharts={selectedCharts}
                            />
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default Dashboard;
