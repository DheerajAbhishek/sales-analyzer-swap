const jwt = require('jsonwebtoken');
const https = require('https');
const { URL } = require('url');

// Helper function to get all dates within a given range
const getDatesInRange = (startDate, endDate) => {
    const dates = [];
    let currentDate = new Date(startDate);
    const end = new Date(endDate);
    // Ensure we handle the timezones correctly by using UTC dates
    currentDate.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(0, 0, 0, 0);

    while (currentDate <= end) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
};

// Helper function for a single page fetch
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
        const requestPath = `${ristaApiUrl.pathname.replace(~/$/, '')}${salesEndpointPath}`;

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

// New fetchSalesForDay that handles pagination by looping with lastKey
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
            hasMore = false; // Stop paginating on error
        }
    }
    // Returns a flat array of all orders for the day
    return allOrders;
};

exports.handler = async (event) => {
    const apiKey = process.env.VITE_RISTA_API_KEY;
    const secretKey = process.env.VITE_RISTA_SECRET_KEY;
    const apiUrl = process.env.VITE_RISTA_API_URL;

    if (!apiKey || !secretKey || !apiUrl) {
        return { statusCode: 500, body: JSON.stringify({ message: 'Missing required environment variables' }) };
    }

    const { branchId, startDate, endDate } = event.queryStringParameters || {};
    if (!branchId || !startDate || !endDate) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing required query parameters: branchId, startDate, endDate' }) };
    }

    try {
        const dates = getDatesInRange(startDate, endDate);
        if (dates.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Invalid date range. The start date cannot be after the end date.' }) };
        }

        const dailySalesPromises = dates.map(day => fetchSalesForDay(day, branchId, apiKey, secretKey, apiUrl));
        const dailyResults = await Promise.all(dailySalesPromises);

        const consolidated = {
            noOfOrders: 0,
            grossSale: 0,
            gstOnOrder: 0,
            discounts: 0,
            packings: 0,
            netSale: 0,
        };

        let restaurantId = "";

        // dailyResults is an array of arrays, e.g., [ [ordersDay1], [ordersDay2], ... ]
        dailyResults.forEach(ordersForOneDay => {
            if (ordersForOneDay && Array.isArray(ordersForOneDay) && ordersForOneDay.length > 0) {
                ordersForOneDay.forEach(order => {
                    // Filter to consider only "Takeaway - Swap" channel data and non-voided orders
                    if (order.channel !== "Takeaway - Swap" || order.status === "Voided") {
                        return; // Skip this order
                    }

                    const taxAmount = order.taxAmount || 0;
                    const chargeAmount = order.chargeAmount || 0;
                    const grossAmount = order.grossAmount || 0;
                    const totalDiscountAmount = order.totalDiscountAmount || 0;
                    const totalAmount = order.totalAmount || 0;

                    if (!restaurantId && order.branchName) {
                        restaurantId = order.branchName;
                    }

                    consolidated.noOfOrders += 1;
                    consolidated.grossSale += grossAmount + Math.abs(chargeAmount) - taxAmount;
                    consolidated.gstOnOrder += taxAmount;
                    consolidated.discounts += Math.abs(totalDiscountAmount);
                    consolidated.packings += chargeAmount;
                    consolidated.netSale += totalAmount;
                });
            }
        });

        const nbv = consolidated.grossSale - consolidated.discounts;
        const discountPercent = consolidated.grossSale > 0 ? (consolidated.discounts / consolidated.grossSale) * 100 : 0;

        const responseBody = {
            restaurantId: restaurantId,
            startDate: startDate,
            endDate: endDate,
            body: {
                consolidatedInsights: {
                    noOfOrders: consolidated.noOfOrders,
                    grossSale: parseFloat(consolidated.grossSale.toFixed(2)),
                    gstOnOrder: parseFloat(consolidated.gstOnOrder.toFixed(2)),
                    discounts: parseFloat(consolidated.discounts.toFixed(2)),
                    packings: parseFloat(consolidated.packings.toFixed(2)),
                    ads: 0,
                    commissionAndTaxes: 0,
                    netSale: parseFloat(consolidated.netSale.toFixed(2)),
                    nbv: parseFloat(nbv.toFixed(2)),
                    commissionPercent: 0,
                    discountPercent: parseFloat(discountPercent.toFixed(2)),
                    adsPercent: 0
                },
                discountBreakdown: {}
            }
        };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(responseBody)
        };

    } catch (error) {
        console.error("Error processing sales data:", error);
        return { statusCode: 500, body: JSON.stringify({ message: `An error occurred: ${error.message}` }) };
    }
};