export const API_BASE_URL = "https://xiphvj43ij.execute-api.ap-south-1.amazonaws.com/Prod";

export const RESTAURANT_ID_MAP = {
    'main_kitchen': {
        name: 'Main Kitchen',
        zomato: '19251816',
        swiggy: '224899',
        takeaway: 'Ninithaa\u2019s Highs', // Updated to use Unicode right single quotation mark
        subs: 'subsMK'
    },
    'madhapur': {
        name: 'Madhapur',
        zomato: '19677040',
        swiggy: '366522',
        takeaway: '',
        subs: 'subsMadhapur'
    },
    'banjara_hills': {
        name: 'Banjara Hills',
        zomato: '21481358',
        swiggy: '977488',
        takeaway: '',
        subs: 'subsBanjara Hills'
    },
    'madhurawada_vuda_colony': {
        name: 'Madhurawada',
        zomato: '20289495',
        swiggy: '547103',
        takeaway: '',
        subs: ''
    },
    'kondapur': {
        name: 'Kondapur',
        zomato: '20534248',
        swiggy: '662306',
        takeaway: '',
        subs: 'subsKDPR'
    },
    'nad': {
        name: 'NAD',
        zomato: '20126789',
        swiggy: '492064',
        takeaway: '',
        subs: 'subsNAD'
    },
    'bellandur': {
        name: 'Bellandur',
        zomato: '20906774',
        swiggy: '785991',
        takeaway: '',
        subs: 'subsBLR'
    },
    'tirupathi': {
        name: 'Tirupathi',
        zomato: '20379393',
        swiggy: '590420',
        takeaway: '',
        subs: ''
    },
    'vijayawada': {
        name: 'Vijayawada',
        zomato: '20916901',
        swiggy: '793916',
        takeaway: '',
        subs: 'subsVJWD'
    },
    'vizag': {
        name: 'Vizag',
        zomato: '22097588',
        swiggy: '1181548',
        takeaway: '',
        subs: 'subsVizag'
    },
    'bh': {
        name: 'BH',
        zomato: '22154339',
        swiggy: '1181549',
        takeaway: '',
        subs: 'subsBH'
    }
};

// Helper function to get all platform IDs for a restaurant
export const getRestaurantPlatformIds = (restaurantKey) => {
    const restaurant = RESTAURANT_ID_MAP[restaurantKey];
    if (!restaurant) return [];

    const platformIds = [
        restaurant.zomato,
        restaurant.swiggy,
        restaurant.takeaway,
        restaurant.subs
    ].filter(id => id && id.trim() !== '');

    console.log(`Platform IDs for ${restaurantKey}:`, platformIds); // Added debugging

    return platformIds;
};

// Helper function to get the latest date across all platforms for a restaurant
export const getRestaurantLatestDate = async (restaurantKey) => {
    const platformIds = getRestaurantPlatformIds(restaurantKey);
    const results = [];

    console.log(`Checking platforms for ${restaurantKey}:`, platformIds);

    for (const platformId of platformIds) {
        try {
            const response = await fetch(`${API_BASE_URL}/get-last-date`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ restaurantId: platformId })
            });
            const data = await response.json();

            console.log(`Platform ${platformId} response:`, data);

            const platformName = getPlatformName(restaurantKey, platformId);

            if (data.success && data.data.lastDate) {
                results.push({
                    platformId,
                    date: data.data.lastDate,
                    platform: platformName,
                    totalDates: data.data.totalDatesFound || 0
                });
            } else {
                // Include platforms with no data
                results.push({
                    platformId,
                    date: null,
                    platform: platformName,
                    message: data.data?.message || 'No data available'
                });
            }
        } catch (error) {
            console.error(`Error fetching date for ${platformId}:`, error);
            results.push({
                platformId,
                date: null,
                platform: getPlatformName(restaurantKey, platformId),
                message: 'Error fetching data'
            });
        }
    }

    console.log(`Results for ${restaurantKey}:`, results);

    // Return all platform results
    return {
        platforms: results,
        hasData: results.some(r => r.date !== null)
    };
};

// Helper function to get platform name from restaurant mapping
const getPlatformName = (restaurantKey, platformId) => {
    const restaurant = RESTAURANT_ID_MAP[restaurantKey];
    if (!restaurant) return 'Unknown';

    if (restaurant.zomato === platformId) return 'Zomato';
    if (restaurant.swiggy === platformId) return 'Swiggy';
    if (restaurant.takeaway === platformId) return 'Takeaway';
    if (restaurant.subs === platformId) return 'Subscriptions';

    return 'Unknown';
};

export const CHART_COLORS = {
    zomato: "#ef4444",        // Red
    swiggy: "#f97316",        // Orange
    takeaway: "#22c55e",      // Green
    subscription: "#16a34a",  // Dark Green
    subs: "#16a34a",          // Alias for subscription
    primary: "#6366f1",
    secondary: "#3b82f6",
    tertiary: "#06b6d4",
    accent: "#ec4899",
    warning: "#f59e0b",
    success: "#10b981",
    danger: "#ef4444",
    purple: "#6366f1",
    blue: "#3b82f6",
    cyan: "#06b6d4",
    emerald: "#10b981",
    orange: "#f97316",
    pink: "#ec4899",
    red: "#ef4444",
    green: "#22c55e",
    darkGreen: "#16a34a",
    lightGreen: "#4ade80",
    gradients: {
        primary: ["#6366f1", "#3b82f6"],
        secondary: ["#06b6d4", "#10b981"],
        accent: ["#ec4899", "#f59e0b"],
        zomato: ["#ef4444", "#dc2626"],
        swiggy: ["#f97316", "#ea580c"],
        takeaway: ["#22c55e", "#16a34a"],
        subscription: ["#16a34a", "#15803d"]
    },
    // Platform-specific color mapping
    platform: {
        zomato: "#ef4444",
        swiggy: "#f97316",
        takeaway: "#22c55e",
        subscription: "#16a34a",
        subs: "#16a34a"
    },
    // Array of colors for multiple datasets
    palette: [
        "#ef4444", // Red (Zomato)
        "#f97316", // Orange (Swiggy)
        "#22c55e", // Green (Takeaway)
        "#16a34a", // Dark Green (Subscription)
        "#6366f1", // Purple
        "#3b82f6", // Blue
        "#06b6d4", // Cyan
        "#ec4899", // Pink
        "#4ade80", // Light Green
        "#15803d"  // Very Dark Green
    ]
};

export const METRICS_CONFIG = [
    { key: 'grossSale', title: 'Gross Sale', type: 'currency' },
    { key: 'netSale', title: 'Net Sale', type: 'currency' },
    { key: 'nbv', title: 'NBV', type: 'currency' },
    { key: 'noOfOrders', title: 'No. of Orders', type: 'number' },
    { key: 'discounts', title: 'Discounts', type: 'currency' },
    { key: 'commissionAndTaxes', title: 'Commission & Taxes', type: 'currency' },
    { key: 'ads', title: 'Ads', type: 'currency' },
    { key: 'packings', title: 'Packings', type: 'currency' },
    { key: 'gstOnOrder', title: 'GST on Order', type: 'currency' },
    { key: 'commissionPercent', title: 'Commission %', type: 'percent' },
    { key: 'discountPercent', title: 'Discount %', type: 'percent' },
    { key: 'adsPercent', title: 'Ads %', type: 'percent' }
];