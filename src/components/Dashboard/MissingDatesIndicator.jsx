import React, { useState, useEffect } from "react";
import { dateService } from "../../services/dateService";
import { userRestaurantMappingService } from "../../services/userRestaurantMappingService";

const MissingDatesIndicator = ({
  timeSeriesData,
  selections,
  dataType,
  user,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [missingDatesData, setMissingDatesData] = useState({}); // Store missing dates per platform
  const [loading, setLoading] = useState(false);
  // Function to generate all dates in range
  const generateDateRange = (startDate, endDate) => {
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      dates.push(current.toISOString().split("T")[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  // Function to find missing dates from time series data
  const findMissingDatesFromTimeSeries = () => {
    if (!timeSeriesData || !selections?.startDate || !selections?.endDate) {
      return [];
    }

    // Get all expected dates in range
    const expectedDates = generateDateRange(
      selections.startDate,
      selections.endDate,
    );

    // Get actual dates that have data
    const actualDates = Object.keys(timeSeriesData);
    // Find missing dates
    const missing = expectedDates.filter((date) => !actualDates.includes(date));
    return missing;
  };

  // For total summary data, we need to check each restaurant and platform individually
  useEffect(() => {
    if (dataType === "timeSeries") {
      // Use time series data directly
      const missing = findMissingDatesFromTimeSeries();
      setMissingDatesData({ timeSeries: missing });
    } else if (
      dataType === "total" &&
      selections?.startDate &&
      selections?.endDate &&
      selections?.restaurants
    ) {
      // For total summary, check missing dates for each restaurant and platform
      setLoading(true);

      const checkMissingDatesForAllPlatforms = async () => {
        const businessEmail = user?.businessEmail || user?.email;
        const results = {};

        try {
          // Get restaurant mappings to understand platform assignments
          const restaurantMappings =
            await userRestaurantMappingService.getUserRestaurantMappings();

          for (const restaurantId of selections.restaurants) {
            // Check if this is a restaurant group or direct platform ID
            const restaurant = restaurantMappings.find(
              (r) => r.id === restaurantId,
            );
            let platformIds = [restaurantId]; // Default: treat as direct platform ID

            if (restaurant) {
              // This is a restaurant group - get all platform IDs
              platformIds = Object.entries(restaurant.platforms || {})
                .filter(
                  ([channel, platformId]) =>
                    platformId &&
                    platformId.trim() &&
                    selections.channels.includes(channel),
                )
                .map(([channel, platformId]) => ({ channel, platformId }));
            } else {
              // Direct platform ID - determine channel and filter by selected channels
              const guessedChannel =
                userRestaurantMappingService.guessChannelForId(restaurantId);
              if (selections.channels.includes(guessedChannel)) {
                platformIds = [
                  { channel: guessedChannel, platformId: restaurantId },
                ];
              } else {
                platformIds = []; // Skip if channel not selected
              }
            }

            // Check missing dates for each platform ID
            for (const platform of platformIds) {
              const platformId = platform.platformId || platform;
              const channel =
                platform.channel ||
                userRestaurantMappingService.guessChannelForId(platformId);

              try {
                const result = await dateService.checkMissingDates(
                  platformId,
                  selections.startDate,
                  selections.endDate,
                  businessEmail,
                );

                if (result.success) {
                  const key = restaurant
                    ? `${restaurant.name} (${channel})`
                    : `${platformId} (${channel})`;
                  results[key] = {
                    missingDates: result.data.missingDates || [],
                    platformId,
                    channel,
                    restaurantName: restaurant?.name || platformId,
                  };
                } else {
                }
              } catch (error) {
                console.error(
                  `Γ¥î Error checking missing dates for ${platformId}:`,
                  error,
                );
              }
            }
          }
          setMissingDatesData(results);
        } catch (error) {
          console.error("Γ¥î Error in missing dates check:", error);
          setMissingDatesData({});
        }

        setLoading(false);
      };

      checkMissingDatesForAllPlatforms();
    }
  }, [timeSeriesData, selections, dataType, user]);

  // Show loading state
  if (loading) {
    return (
      <div
        style={{
          background: "linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)",
          border: "1px solid #9ca3af",
          borderRadius: "12px",
          padding: "12px 16px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1.2em" }}>≡ƒöì</span>
          <p
            style={{
              margin: 0,
              fontWeight: "600",
              color: "#374151",
              fontSize: "0.9rem",
            }}
          >
            Checking for missing data periods...
          </p>
        </div>
      </div>
    );
  }

  // Calculate missing dates based on data type
  const calculateMissingDates = () => {
    if (dataType === "timeSeries") {
      return missingDatesData.timeSeries || [];
    } else {
      // For total summary, combine all missing dates from all platforms
      const allMissing = [];
      Object.values(missingDatesData).forEach((platformData) => {
        if (platformData.missingDates) {
          allMissing.push(...platformData.missingDates);
        }
      });
      return [...new Set(allMissing)].sort(); // Remove duplicates and sort
    }
  };

  const calculatedMissingDates = calculateMissingDates();

  // For total summary, check if we have results from API
  if (dataType === "total") {
    const daysDiff = Math.ceil(
      (new Date(selections.endDate) - new Date(selections.startDate)) /
        (1000 * 60 * 60 * 24),
    );
    const platformKeys = Object.keys(missingDatesData);

    // If we have missing dates from API, show them
    if (calculatedMissingDates.length > 0) {
      // Continue to show the missing dates UI below
    } else if (platformKeys.length > 0) {
      // Show data coverage info
      return (
        <div
          style={{
            background: "linear-gradient(135deg, #e0f2fe 0%, #b3e5fc 100%)",
            border: "1px solid #0288d1",
            borderRadius: "12px",
            padding: "12px 16px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.2em" }}>≡ƒôè</span>
            <div>
              <p
                style={{
                  margin: 0,
                  fontWeight: "600",
                  color: "#01579b",
                  fontSize: "0.9rem",
                }}
              >
                Complete Data Coverage
              </p>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#0277bd" }}>
                All {daysDiff + 1} day{daysDiff !== 0 ? "s" : ""} have data
                available across {platformKeys.length} platform
                {platformKeys.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      );
    } else {
      // No data available yet
      return null;
    }
  }
  // Don't show anything if no missing dates
  if (calculatedMissingDates.length === 0) {
    return null;
  }

  // Format date for display
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Group consecutive dates
  const groupConsecutiveDates = (dates) => {
    if (dates.length === 0) return [];

    const groups = [];
    let currentGroup = [dates[0]];

    for (let i = 1; i < dates.length; i++) {
      const current = new Date(dates[i]);
      const previous = new Date(dates[i - 1]);
      const dayDiff = (current - previous) / (1000 * 60 * 60 * 24);

      if (dayDiff === 1) {
        currentGroup.push(dates[i]);
      } else {
        groups.push(currentGroup);
        currentGroup = [dates[i]];
      }
    }
    groups.push(currentGroup);

    return groups;
  };

  const dateGroups = groupConsecutiveDates(calculatedMissingDates);

  // Format date groups for display
  const formatDateGroups = (groups) => {
    return groups.map((group) => {
      if (group.length === 1) {
        return formatDate(group[0]);
      } else {
        return `${formatDate(group[0])} - ${formatDate(group[group.length - 1])}`;
      }
    });
  };

  const formattedGroups = formatDateGroups(dateGroups);

  // Check if we have platform-specific data to show
  const hasPlatformSpecificData =
    dataType === "total" && Object.keys(missingDatesData).length > 1;

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
        border: "1px solid #f59e0b",
        borderRadius: "12px",
        padding: "12px 16px",
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        <span style={{ fontSize: "1.2em" }}>ΓÜá∩╕Å</span>
        <div>
          <p
            style={{
              margin: 0,
              fontWeight: "600",
              color: "#92400e",
              fontSize: "0.9rem",
            }}
          >
            Missing Data Periods
          </p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#a16207" }}>
            {calculatedMissingDates.length}{" "}
            {calculatedMissingDates.length === 1 ? "date" : "dates"} with no
            data found
            {hasPlatformSpecificData &&
              ` across ${Object.keys(missingDatesData).length} platforms`}
          </p>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "1px solid #f59e0b",
            borderRadius: "6px",
            padding: "4px 8px",
            fontSize: "0.75rem",
            color: "#92400e",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          {showDetails ? "Hide" : "Show"} Details
        </button>
      </div>

      {showDetails && (
        <div
          style={{
            background: "rgba(255, 255, 255, 0.5)",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "0.8rem",
            color: "#78350f",
          }}
        >
          {hasPlatformSpecificData ? (
            // Show platform-specific missing dates
            <div>
              <p style={{ margin: "0 0 8px 0", fontWeight: "600" }}>
                Missing dates by platform:
              </p>
              {Object.entries(missingDatesData).map(([platformKey, data]) => {
                if (!data.missingDates || data.missingDates.length === 0)
                  return null;

                const platformGroups = groupConsecutiveDates(data.missingDates);
                const platformFormatted = formatDateGroups(platformGroups);

                return (
                  <div key={platformKey} style={{ marginBottom: "4px" }}>
                    <strong>{platformKey}:</strong>{" "}
                    {platformFormatted.join(", ")}
                    <span style={{ opacity: 0.7 }}>
                      ({data.missingDates.length}{" "}
                      {data.missingDates.length === 1 ? "date" : "dates"})
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            // Show combined missing dates
            <div>
              <p style={{ margin: "0 0 4px 0", fontWeight: "600" }}>
                Missing dates:
              </p>
              <p style={{ margin: 0, lineHeight: "1.4" }}>
                {formattedGroups.join(", ")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MissingDatesIndicator;
