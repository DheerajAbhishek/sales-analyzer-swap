// Fetch Purchase Order data from Rista API for Rajapushpa on Dec 2, 2025
const jwt = require('jsonwebtoken');

const API_KEY = '4b78002c-adc1-44b7-b588-7e1fec58d977';
const SECRET_KEY = 'pcQmKBT39KtFVRwY8Vl3SSKNqL8Agdrk71id9OBB5uY';
const BRANCH_ID = 'WWRMZ'; // Wework Rajapushpa
const DATE = '2025-12-02';

function generateToken(requestId = null) {
    const payload = {
        iss: API_KEY,
        iat: Math.floor(Date.now() / 1000),
    };
    if (requestId) {
        payload.jti = requestId;
    }
    return jwt.sign(payload, SECRET_KEY, { algorithm: 'HS256' });
}

function getHeaders(requestId = null) {
    return {
        'x-api-token': generateToken(requestId),
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
    };
}

async function fetchPurchaseOrders(branchId, day, lastKey = null) {
    const requestId = `req_${Date.now()}_po`;
    const headers = getHeaders(requestId);

    let url = `https://api.ristaapps.com/v1/inventory/po/page?branch=${branchId}&day=${day}`;
    if (lastKey) {
        url += `&lastKey=${encodeURIComponent(lastKey)}`;
    }

    console.log(`\n=== Fetching Purchase Orders ===`);
    console.log(`Branch: ${branchId}`);
    console.log(`Date: ${day}`);
    console.log(`URL: ${url}`);

    try {
        const response = await fetch(url, { headers });
        const data = await response.json();

        console.log(`\nStatus: ${response.status}`);

        if (data?.data && Array.isArray(data.data)) {
            console.log(`\nFound ${data.data.length} purchase orders`);
            if (data.lastKey) {
                console.log(`Last Key present: ${data.lastKey}`);
            }
        }

        console.log(`\nFull Response:`);
        console.log(JSON.stringify(data, null, 2));

        return data;
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    }
}

// Run fetch
async function main() {
    let allPOs = [];
    let lastKey = null;
    let pageCount = 0;

    do {
        pageCount++;
        console.log(`\n--- Page ${pageCount} ---`);

        const data = await fetchPurchaseOrders(BRANCH_ID, DATE, lastKey);

        if (data?.data && Array.isArray(data.data)) {
            allPOs = allPOs.concat(data.data);
            lastKey = data.lastKey || null;
        } else {
            lastKey = null;
        }

        // Add small delay between requests
        if (lastKey) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    } while (lastKey);

    console.log(`\n\n=== SUMMARY ===`);
    console.log(`Total Purchase Orders: ${allPOs.length}`);
    console.log(`Total Pages: ${pageCount}`);

    if (allPOs.length > 0) {
        console.log(`\n=== ALL PURCHASE ORDERS ===`);
        console.log(JSON.stringify(allPOs, null, 2));
    }
}

main();
