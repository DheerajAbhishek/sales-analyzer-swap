export const API_BASE_URL = "https://xiphvj43ij.execute-api.ap-south-1.amazonaws.com/Prod";

export const RISTA_API_KEY = import.meta.env.VITE_RISTA_API_KEY;
export const RISTA_SECRET_KEY = import.meta.env.VITE_RISTA_SECRET_KEY;
export const RISTA_API_URL = import.meta.env.VITE_RISTA_API_URL;

export const RESTAURANT_ID_MAP = {
    'main_kitchen': {
        name: 'Main Kitchen',
        zomato: '19251816',
        swiggy: '224899',
        takeaway: 'MK',
        corporate: 'MK',
        subs: 'subsMK',
        ristaBranchCode: 'MK'
    },
    'madhapur': {
        name: 'Madhapur',
        zomato: '19677040',
        swiggy: '366522',
        takeaway: 'MADH',
        corporate: 'MADH',
        subs: 'subsMadhapur',
        ristaBranchCode: 'MADH'
    },
    'banjara_hills': {
        name: 'Banjara Hills',
        zomato: '21481358',
        swiggy: '977488',
        takeaway: 'SMF',
        corporate: 'SMF',
        subs: 'subsBH',
        ristaBranchCode: 'BH'
    },
    'madhurawada_vuda_colony': {
        name: 'Madhurawada',
        zomato: '20289495',
        swiggy: '547103',
        takeaway: 'MAD',
        corporate: 'MAD',
        subs: '',
        ristaBranchCode: 'MAD'
    },
    'kondapur': {
        name: 'Kondapur',
        zomato: '20534248',
        swiggy: '662306',
        takeaway: 'KDPR',
        corporate: 'KDPR',
        subs: 'subsKDPR',
        ristaBranchCode: 'KDPR'
    },
    'nad': {
        name: 'NAD',
        zomato: '20126789',
        swiggy: '492064',
        takeaway: '',
        corporate: '',
        subs: 'subsNAD',
        ristaBranchCode: 'NAD'
    },
    'bellandur': {
        name: 'Bellandur',
        zomato: '20906774',
        swiggy: '785991',
        takeaway: '',
        corporate: '',
        subs: 'subsBLR',
        ristaBranchCode: 'BLR'
    },
    'tirupathi': {
        name: 'Tirupathi',
        zomato: '20379393',
        swiggy: '590420',
        takeaway: '',
        corporate: '',
        subs: '',
        ristaBranchCode: 'TPT'
    },
    'vijayawada': {
        name: 'Vijayawada',
        zomato: '20916901',
        swiggy: '793916',
        takeaway: 'VJWD',
        corporate: 'VJWD',
        subs: 'subsVJWD',
        ristaBranchCode: 'VJWD'
    },
    'hyderabad_whitefields': {
        name: 'Hyderabad Whitefields',
        zomato: '22097588',
        swiggy: '994656',
        takeaway: '',
        corporate: '',
        subs: '',
        ristaBranchCode: 'WF'
    },
    'banglore_koramangala': {
        name: 'Bangalore Koramangala',
        zomato: '22154339',
        swiggy: '1181549',
        takeaway: 'KRMG',
        corporate: 'KRMG',
        subs: 'subsBLR',
        ristaBranchCode: 'KRMG'
    },
    'Animal Fitness': {
        name: 'Animal Fitness',
        zomato: '',
        swiggy: '',
        takeaway: 'AF',
        corporate: 'AF',
        subs: '',
        ristaBranchCode: 'AF'
    },
    'Apple Fitness': {
        name: 'Apple Fitness',
        zomato: '',
        swiggy: '',
        takeaway: 'SAF',
        corporate: 'SAF',
        subs: '',
        ristaBranchCode: 'SAF'
    },
    'Swap - millennium Fitness': {
        name: 'Swap - Millennium Fitness',
        zomato: '',
        swiggy: '',
        takeaway: 'SMF',
        corporate: 'SMF',
        subs: '',
        ristaBranchCode: 'SMF'
    },
    'Fit Nation': {
        name: 'Fit Nation',
        zomato: '',
        swiggy: '',
        takeaway: 'SFN',
        corporate: 'SFN',
        subs: '',
        ristaBranchCode: 'SFN'
    },
    'WeWork Kondapur': {
        name: 'WeWork Kondapur',
        zomato: '22097588',
        swiggy: '1181060',
        takeaway: 'WWK',
        corporate: 'WWK',
        subs: '',
        ristaBranchCode: 'WWK'
    },
    'WeWork Roshni': {
        name: 'WeWork Roshni',
        zomato: '',
        swiggy: '',
        takeaway: 'WWR',
        corporate: 'WWR',
        subs: '',
        ristaBranchCode: 'WWR'
    },
    'WeWork Vaishnavi Signature': {
        name: 'WeWork Vaishnavi Signature',
        zomato: '',
        swiggy: '',
        takeaway: 'WWVS',
        corporate: 'WWVS',
        subs: '',
        ristaBranchCode: 'WWVS'
    },
    'Wework Rajapushpa': {
        name: 'WeWork Rajapushpa',
        zomato: '',
        swiggy: '',
        takeaway: 'RPS',
        corporate: 'RPS',
        subs: '',
        ristaBranchCode: 'WWRMZ'
    },
    'Wework Symbiosis': {
        name: 'Wework Symbiosis',
        zomato: '',
        swiggy: '',
        takeaway: 'WWSS',
        corporate: 'WWSS',
        subs: '',
        ristaBranchCode: 'WWSS'
    },
    'ISB HYD': {
        name: 'ISB HYD',
        zomato: '',
        swiggy: '',
        takeaway: 'ISB-HYD',
        corporate: 'ISB-HYD',
        subs: '',
        ristaBranchCode: 'ISB-HYD'
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
        restaurant.corporate,
        restaurant.subs
    ].filter(id => id && id.trim() !== '');

    console.log(`Platform IDs for ${restaurantKey}:`, platformIds); // Added debugging

    return platformIds;
};

// Helper function to get the latest date across all platforms for a restaurant
export const getRestaurantLatestDate = async (restaurantKey) => {
    const restaurant = RESTAURANT_ID_MAP[restaurantKey];
    if (!restaurant) return { platforms: [], hasData: false };

    const allPlatformIds = getRestaurantPlatformIds(restaurantKey);
    const results = [];

    // Define which channels are on-demand and should be excluded from this check
    // Use a Set to avoid duplicates when takeaway and corporate have the same ID
    const onDemandChannelsSet = new Set();
    if (restaurant.takeaway) onDemandChannelsSet.add(restaurant.takeaway);
    if (restaurant.corporate) onDemandChannelsSet.add(restaurant.corporate);
    const onDemandChannels = Array.from(onDemandChannelsSet);

    // Filter out the on-demand channels
    const platformIdsToCheck = allPlatformIds.filter(id => !onDemandChannels.includes(id));

    console.log(`Checking latest dates for platforms:`, platformIdsToCheck);

    for (const platformId of platformIdsToCheck) {
        try {
            const response = await fetch(`${API_BASE_URL}/get-last-date`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ restaurantId: platformId })
            });
            const data = await response.json();
            const platformName = getPlatformName(restaurantKey, platformId);

            if (data.success && data.data.lastDate) {
                results.push({
                    platformId,
                    date: data.data.lastDate,
                    platform: platformName,
                    totalDates: data.data.totalDatesFound || 0
                });
            } else {
                results.push({
                    platformId,
                    date: null,
                    platform: platformName,
                    message: data.data?.message || 'No data available'
                });
            }
        } catch (error) {
            results.push({
                platformId,
                date: null,
                platform: getPlatformName(restaurantKey, platformId),
                message: 'Error fetching data'
            });
        }
    }

    // Add placeholder info for the excluded on-demand channels so the UI knows about them
    onDemandChannels.forEach(id => {
        // Check if this ID is used for both takeaway and corporate
        const isTakeaway = restaurant.takeaway === id;
        const isCorporate = restaurant.corporate === id;
        let platformLabel;
        if (isTakeaway && isCorporate) {
            platformLabel = 'Takeaway/Corporate';
        } else {
            platformLabel = getPlatformName(restaurantKey, id);
        }

        results.push({
            platformId: id,
            date: 'On-Demand', // Special text for UI
            platform: platformLabel,
            totalDates: 'N/A'
        });
    });

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
    if (restaurant.corporate === platformId) return 'Corporate Orders';
    if (restaurant.subs === platformId) return 'Subscriptions';

    return 'Unknown';
};

export const CHART_COLORS = {
    zomato: "#ef4444",        // Red
    swiggy: "#f97316",        // Orange
    takeaway: "#22c55e",      // Green
    corporate: "#8b5cf6",      // Purple
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
        corporate: "#8b5cf6",
        subscription: "#16a34a",
        subs: "#16a34a"
    },
    // Array of colors for multiple datasets
    palette: [
        "#ef4444", // Red (Zomato)
        "#f97316", // Orange (Swiggy)
        "#22c55e", // Green (Takeaway)
        "#16a34a", // Dark Green (Subscription)
        "#8b5cf6", // Purple (Corporate)
        "#6366f1", // Indigo
        "#3b82f6", // Blue
        "#06b6d4", // Cyan
        "#ec4899", // Pink
        "#4ade80", // Light Green
        "#15803d"  // Very Dark Green
    ]
};

export const METRICS_CONFIG = [
    { key: 'grossSaleWithGST', title: 'Gross Sale + GST', type: 'currency' },
    { key: 'grossSale', title: 'Gross Sale', type: 'currency' },
    { key: 'netOrder', title: 'Net Order', type: 'currency' },
    { key: 'totalDeductions', title: 'Deductions', type: 'currency' },
    { key: 'netPay', title: 'Net Pay', type: 'currency' },
    { key: 'noOfOrders', title: 'No. of Orders', type: 'number' },
    { key: 'discounts', title: 'Discounts', type: 'currency' },
    { key: 'ads', title: 'Ads', type: 'currency' },
    { key: 'discountPercent', title: 'Discount %', type: 'percentage' },
    { key: 'adsPercent', title: 'Ads %', type: 'percentage' }
];

// Function to check data availability for selected channels
export const checkChannelDataAvailability = async (selectedChannels, restaurantKey) => {
    const results = {
        selectedChannels: [...selectedChannels],
        availableChannels: [],
        missingChannels: [],
        channelData: {}
    };

    // Get platform mapping for the restaurant
    const restaurant = RESTAURANT_ID_MAP[restaurantKey];
    if (!restaurant) {
        results.missingChannels = [...selectedChannels];
        return results;
    }

    // Map channel names to platform IDs
    const channelMapping = {
        'zomato': restaurant.zomato,
        'swiggy': restaurant.swiggy,
        'takeaway': restaurant.takeaway,
        'corporate': restaurant.corporate,
        'subscription': restaurant.subs,
        'subs': restaurant.subs
    };

    for (const channel of selectedChannels) {
        const platformId = channelMapping[channel.toLowerCase()];

        if (!platformId || platformId.trim() === '') {
            results.missingChannels.push(channel);
            results.channelData[channel] = false;
            continue;
        }

        try {
            // Check if data exists for this platform
            const response = await fetch(`${API_BASE_URL}/get-last-date`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ restaurantId: platformId })
            });

            const data = await response.json();

            if (data.success && data.data.lastDate) {
                results.availableChannels.push(channel);
                results.channelData[channel] = true;
            } else {
                results.missingChannels.push(channel);
                results.channelData[channel] = false;
            }
        } catch (error) {
            // Silently handle errors - just mark channel as unavailable
            results.missingChannels.push(channel);
            results.channelData[channel] = false;
        }
    }

    return results;
};