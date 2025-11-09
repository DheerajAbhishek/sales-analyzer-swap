import React from "react";
import { formatValue } from "../../utils/helpers";

const DiscountBreakdownModal = ({
    isOpen,
    onClose,
    discountBreakdown,
    isLoading,
    position,
}) => {
    if (!isOpen) return null;

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    // Calculate modal position
    const getModalStyle = () => {
        // Check if we're on mobile
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            // On mobile, always center the modal
            return {};
        }

        if (!position) {
            return {};
        }

        return {
            position: "absolute",
            left: "188px",
            top: "47.162px",
            transform: "none",
        };
    };

    // Detect if this is multi-channel format (keys contain platform_restaurantName)
    // Use robust detection: check for platform prefix pattern AND verify value structure
    const isMultiChannel = (() => {
        if (!discountBreakdown) return false;

        // Known platform prefixes (lowercase)
        const knownPlatforms = [
            "swiggy",
            "zomato",
            "web",
            "pos",
            "delivery",
            "mobile",
            "takeaway",
        ];

        // Check if any key matches the pattern: platform_restaurantName
        // Pattern: starts with known platform, followed by underscore, followed by any text
        const hasMultiChannelKeys = Object.keys(discountBreakdown).some((key) => {
            // Split on first underscore
            const underscoreIndex = key.indexOf("_");
            if (underscoreIndex === -1) return false;

            const potentialPlatform = key.substring(0, underscoreIndex).toLowerCase();

            // Check if prefix is a known platform
            if (knownPlatforms.includes(potentialPlatform)) {
                return true;
            }

            return false;
        });

        // Alternative check: inspect value shape
        // Multi-channel values should be objects with 'platform' and 'restaurantName' properties
        const hasMultiChannelValues = Object.values(discountBreakdown).some(
            (value) => {
                return (
                    value &&
                    typeof value === "object" &&
                    "platform" in value &&
                    "restaurantName" in value &&
                    typeof value.platform === "string"
                );
            },
        );

        // Return true if either detection method confirms multi-channel format
        return hasMultiChannelKeys || hasMultiChannelValues;
    })();

    // Calculate combined totals across all channels
    const calculateCombinedTotals = () => {
        if (!isMultiChannel) return null;

        const combined = {
            totalOrders: 0,
            totalDiscount: 0,
            categories: {},
        };

        Object.entries(discountBreakdown).forEach(([channelKey, channelData]) => {
            Object.entries(channelData).forEach(([category, data]) => {
                if (category === "platform" || category === "restaurantName") return;

                if (category === "TOTAL") {
                    combined.totalOrders += data.orders || 0;
                    combined.totalDiscount += getDiscountAmount(data);
                } else {
                    if (!combined.categories[category]) {
                        combined.categories[category] = {
                            orders: 0,
                            discount: 0,
                            platforms: new Set(),
                        };
                    }
                    combined.categories[category].orders += data.orders || 0;
                    combined.categories[category].discount += getDiscountAmount(data);
                    combined.categories[category].platforms.add(channelData.platform);
                }
            });
        });

        return combined;
    };

    const getDiscountAmount = (data) => {
        // Check for Zomato format (totalDiscount is the normalized field)
        if (data.totalDiscount !== undefined) {
            return data.totalDiscount;
        }
        // Fallback to old field name
        if (data.totalDiscountPromo !== undefined) {
            return data.totalDiscountPromo;
        }
        // Swiggy format
        return data.discount || 0;
    };

    const getPlatformBadgeColor = (platform) => {
        const colors = {
            swiggy: "linear-gradient(135deg, #fc8019 0%, #ff6b35 100%)",
            zomato: "linear-gradient(135deg, #e23744 0%, #d32f2f 100%)",
        };
        return (
            colors[platform?.toLowerCase()] ||
            "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)"
        );
    };

    const formatDiscountShare = (key, platform) => {
        if (key === "TOTAL") return "Total";
        if (key === "Undefined") return "Undefined";

        // For Zomato: Check if key is just a number (like "100") - if so, add %
        if (platform === "zomato") {
            // If the key is purely numeric, add % symbol
            if (/^\d+$/.test(key)) {
                return `${key}%`;
            }
            // Otherwise, show the full promo text as-is
            return key;
        }

        // For Swiggy, show percentage
        return `${key}%`;
    };

    const getDiscountShareDescription = (key, data, platform) => {
        if (key === "TOTAL") return "Total discount across all categories";
        if (key === "Undefined") {
            return "Promotions without specific discount details";
        }

        const isNewZomatoFormat =
            data &&
            typeof data === "object" &&
            "totalDiscount" in data &&
            "avgDiscountPerOrder" in data;

        if (isNewZomatoFormat) {
            if (
                data.valueRealizationPercentage !== null &&
                data.valueRealizationPercentage !== undefined
            ) {
                return `Restaurant shares ${data.valueRealizationPercentage?.toFixed(2)}% of this promotion`;
            }
            return `Promotion discount details`;
        }
        if (platform === "zomato") {
            const sharePercent = data?.Swap_share_percentage;
            return sharePercent !== null && sharePercent !== undefined
                ? `Restaurant shares ${sharePercent}% of this promotion`
                : "Promotion discount details";
        }
        return `${key}% of discount shared by restaurant`;
    };

    const getAdditionalMetrics = (data, platform) => {
        const isNewZomatoFormat =
            data &&
            typeof data === "object" &&
            "totalDiscount" in data &&
            "avgDiscountPerOrder" in data;

        if (isNewZomatoFormat) {
            const metrics = [];
            if (
                data.avgDiscountPerOrder !== null &&
                data.avgDiscountPerOrder !== undefined
            ) {
                metrics.push({
                    label: "Avg Discount/Order",
                    value: formatValue(data.avgDiscountPerOrder, "currency"),
                });
            }
            if (
                data.valueRealizationPercentage !== null &&
                data.valueRealizationPercentage !== undefined
            ) {
                metrics.push({
                    label: "Discount Share",
                    value: `${data.valueRealizationPercentage?.toFixed(2)}%`,
                });
            }
            return metrics;
        }

        if (platform !== "zomato") return [];

        const metrics = [];
        if (
            data?.Swap_share_percentage !== null &&
            data?.Swap_share_percentage !== undefined
        ) {
            metrics.push({
                label: "Restaurant Share",
                value: `${data.Swap_share_percentage}%`,
            });
        }
        return metrics;
    };

    const renderBreakdownContent = (breakdown, platform) => {
        return Object.entries(breakdown)
            .filter(
                ([key]) =>
                    key !== "TOTAL" && key !== "platform" && key !== "restaurantName",
            )
            .map(([key, data]) => {
                const additionalMetrics = getAdditionalMetrics(data, platform);
                return (
                    <div key={key} className="breakdown-card">
                        <div className="breakdown-header">
                            <h3>{formatDiscountShare(key, platform)}</h3>
                            <p className="breakdown-description">
                                {getDiscountShareDescription(key, data, platform)}
                            </p>
                        </div>
                        <div className="breakdown-metrics">
                            <div className="metric">
                                <span className="metric-label">Orders</span>
                                <span className="metric-value">
                                    {formatValue(data.orders, "number")}
                                </span>
                            </div>
                            <div className="metric">
                                <span className="metric-label">
                                    {key === "Other Discounts (BOGO, Freebies, etc.)"
                                        ? "Discount"
                                        : platform === "zomato"
                                            ? "Promo Discount"
                                            : "Discount Amount"}
                                </span>
                                <span className="metric-value">
                                    {formatValue(getDiscountAmount(data), "currency")}
                                </span>
                            </div>
                            {additionalMetrics.map((metric, idx) => (
                                <div key={idx} className="metric">
                                    <span className="metric-label">{metric.label}</span>
                                    <span className="metric-value">{metric.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            });
    };

    const renderCombinedTotal = () => {
        const combined = calculateCombinedTotals();
        if (!combined) return null;

        return (
            <div style={{ marginBottom: "2rem" }}>
                <div
                    style={{
                        background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                        color: "white",
                        padding: "8px 16px",
                        borderRadius: "8px",
                        marginBottom: "1rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                    }}
                >
                    <span style={{ fontSize: "1.2em" }}>🎯</span>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "600" }}>
                        Combined Total - All Channels
                    </h3>
                </div>

                {/* Grand Total Card */}
                <div className="breakdown-card total-card">
                    <div className="breakdown-header">
                        <h3>Grand Total</h3>
                        <p className="breakdown-description">
                            Combined totals across all selected channels
                        </p>
                    </div>
                    <div className="breakdown-metrics">
                        <div className="metric">
                            <span className="metric-label">Total Orders</span>
                            <span className="metric-value">
                                {formatValue(combined.totalOrders, "number")}
                            </span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">Total Discount</span>
                            <span className="metric-value">
                                {formatValue(combined.totalDiscount, "currency")}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderMultiChannelBreakdown = () => {
        return (
            <>
                {renderCombinedTotal()}

                <div
                    style={{
                        background: "linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)",
                        padding: "8px 16px",
                        borderRadius: "8px",
                        marginBottom: "1rem",
                    }}
                >
                    <h3
                        style={{
                            margin: 0,
                            fontSize: "1rem",
                            fontWeight: "600",
                            color: "#374151",
                        }}
                    >
                        Individual Channel Breakdowns
                    </h3>
                </div>

                {Object.entries(discountBreakdown).map(([channelKey, channelData]) => {
                    const platform = channelData.platform;
                    const restaurantName = channelData.restaurantName;

                    return (
                        <div key={channelKey} style={{ marginBottom: "2rem" }}>
                            <div
                                style={{
                                    background: getPlatformBadgeColor(platform),
                                    color: "white",
                                    padding: "8px 16px",
                                    borderRadius: "8px",
                                    marginBottom: "1rem",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                }}
                            >
                                <span style={{ fontSize: "1.2em" }}>📱</span>
                                <div>
                                    <h3
                                        style={{ margin: 0, fontSize: "1rem", fontWeight: "600" }}
                                    >
                                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.9 }}>
                                        {restaurantName}
                                    </p>
                                </div>
                            </div>

                            <div className="breakdown-grid">
                                {renderBreakdownContent(channelData, platform)}

                                {channelData.TOTAL && (
                                    <div className="breakdown-card total-card">
                                        <div className="breakdown-header">
                                            <h3>Channel Total</h3>
                                            <p className="breakdown-description">
                                                Total for{" "}
                                                {platform.charAt(0).toUpperCase() + platform.slice(1)}
                                            </p>
                                        </div>
                                        <div className="breakdown-metrics">
                                            <div className="metric">
                                                <span className="metric-label">Total Orders</span>
                                                <span className="metric-value">
                                                    {formatValue(channelData.TOTAL.orders, "number")}
                                                </span>
                                            </div>
                                            <div className="metric">
                                                <span className="metric-label">Total Discount</span>
                                                <span className="metric-value">
                                                    {formatValue(
                                                        getDiscountAmount(channelData.TOTAL),
                                                        "currency",
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </>
        );
    };

    const renderSingleChannelBreakdown = () => {
        const platform = discountBreakdown?.platform;

        return (
            <div className="breakdown-grid">
                {renderBreakdownContent(discountBreakdown, platform)}

                {discountBreakdown.TOTAL && (
                    <div className="breakdown-card total-card">
                        <div className="breakdown-header">
                            <h3>Total</h3>
                            <p className="breakdown-description">
                                Combined totals across all discount categories
                            </p>
                        </div>
                        <div className="breakdown-metrics">
                            <div className="metric">
                                <span className="metric-label">Total Orders</span>
                                <span className="metric-value">
                                    {formatValue(discountBreakdown.TOTAL.orders, "number")}
                                </span>
                            </div>
                            <div className="metric">
                                <span className="metric-label">Total Discount</span>
                                <span className="metric-value">
                                    {formatValue(
                                        getDiscountAmount(discountBreakdown.TOTAL),
                                        "currency",
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div
            className="modal-overlay positioned-modal"
            onClick={handleOverlayClick}
        >
            <div
                className="modal-content discount-breakdown-modal"
                style={getModalStyle()}
            >
                <div className="modal-header">
                    <h2>Discount Breakdown</h2>
                    <button className="modal-close-btn" onClick={onClose}>
                        <span>&times;</span>
                    </button>
                </div>

                <div className="modal-body">
                    {isLoading ? (
                        <div className="loading-state">
                            <div className="loading-spinner"></div>
                            <p>Loading discount breakdown...</p>
                        </div>
                    ) : discountBreakdown ? (
                        isMultiChannel ? (
                            renderMultiChannelBreakdown()
                        ) : (
                            renderSingleChannelBreakdown()
                        )
                    ) : (
                        <div className="no-data-state">
                            <p>No discount breakdown data available</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DiscountBreakdownModal;
