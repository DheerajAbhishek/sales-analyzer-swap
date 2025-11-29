const jwt = require('jsonwebtoken');
const https = require('https');
const { URL } = require('url');

// This script is for debugging purposes to fetch and display raw, filtered data.

// --- START: Re-used helper functions from apiClient.js ---
const fetchSalesPage = (day, branchId, apiKey, secretKey, apiUrl, lastKey = null) => {
    return new Promise((resolve, reject) => {
        const payload = {
            iss: apiKey,
            iat: Math.floor(Date.now() / 1000),
            jti: `req_${Date.now()}_${day}_${lastKey || 'initial'}`
        };
        const token = jwt.sign(payload, secretKey);

        const ristaApiUrl = new URL(apiUrl);
        let salesEndpointPath = `/sales/page?branch=${branchId}&day=${day}`;
        if (lastKey) {
            salesEndpointPath += `&lastKey=${lastKey}`;
        }
        const requestPath = `${ristaApiUrl.pathname.replace(/\/$/, '')}${salesEndpointPath}`;

        const options = {
            hostname: ristaApiUrl.hostname,
            path: requestPath,
            method: 'GET',
            headers: { 'x-api-token': token, 'x-api-key': apiKey, 'Content-Type': 'application/json' }
        };

        const req = https.request(options, (res) => {
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(rawData));
                    } catch (e) {
                        reject(new Error(`Failed to parse JSON for day ${day}: ${e.message}`));
                    }
                } else {
                    reject(new Error(`API request for day ${day} failed with status ${res.statusCode}: ${rawData}`));
                }
            });
        });
        req.on('error', (e) => reject(new Error(`Request for day ${day} failed: ${e.message}`)));
        req.end();
    });
};

const fetchSalesForDay = async (day, branchId, apiKey, secretKey, apiUrl) => {
    let allOrders = [];
    let lastKey = null;
    let hasMore = true;

    while (hasMore) {
        try {
            const response = await fetchSalesPage(day, branchId, apiKey, secretKey, apiUrl, lastKey);

            if (response && Array.isArray(response.data)) {
                allOrders = allOrders.concat(response.data);
            }

            if (response && response.lastKey) {
                lastKey = response.lastKey;
                hasMore = true;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error(`Error fetching page for day ${day} with lastKey ${lastKey}:`, error);
            hasMore = false;
        }
    }
    return allOrders;
};
// --- END: Re-used helper functions ---


async function getRawTakeawayData() {
    // Hardcoded parameters for this specific debug task
    const branchId = 'WWK';
    const date = '2025-10-03';
    const channelToFilter = 'Takeaway - Swap';

    // Hardcoded credentials for testing purposes only.
    // REPLACE WITH YOUR ACTUAL API KEY, SECRET, AND URL
    const apiKey = '4b78002c-adc1-44b7-b588-7e1fec58d977';
    const secretKey = 'pcQmKBT39KtFVRwY8Vl3SSKNqL8Agdrk71id9OBB5uY';
    const apiUrl = 'https://api.ristaapps.com/v1'; // Replace with your actual API URL

    console.log(`Fetching all orders for branch '${branchId}' on '${date}'...`);

    try {
        const allOrdersForDay = await fetchSalesForDay(date, branchId, apiKey, secretKey, apiUrl);
        console.log(`...found ${allOrdersForDay.length} total orders for the day.`);

        const takeawayOrders = allOrdersForDay.filter(order => order.channel === channelToFilter);

        console.log(`\nFound ${takeawayOrders.length} orders for the '${channelToFilter}' channel:`);
        console.log('--- RAW RESPONSE FOR CHANNEL ---');
        console.log(JSON.stringify(takeawayOrders, null, 2));

    } catch (error) {
        console.error("\nAn error occurred during the fetch:", error);
    }
}

getRawTakeawayData();
