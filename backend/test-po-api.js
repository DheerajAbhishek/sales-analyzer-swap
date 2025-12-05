// Test script to fetch Audit data from Rista API
const jwt = require('jsonwebtoken');

const API_KEY = '4b78002c-adc1-44b7-b588-7e1fec58d977';
const SECRET_KEY = 'pcQmKBT39KtFVRwY8Vl3SSKNqL8Agdrk71id9OBB5uY';
const BRANCH_ID = 'WWK';

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

async function fetchAudit(branchId, day) {
    const requestId = `req_${Date.now()}_audit`;
    const headers = getHeaders(requestId);

    const url = `https://api.ristaapps.com/v1/inventory/audit/page?branch=${branchId}&day=${day}`;

    console.log(`\n=== Fetching Audit Data ===`);
    console.log(`URL: ${url}`);

    try {
        const response = await fetch(url, { headers });
        const data = await response.json();

        console.log(`\nStatus: ${response.status}`);
        console.log(`\nFull Response:`);
        console.log(JSON.stringify(data, null, 2));

        return data;
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    }
}

// Run test
async function main() {
    const testDays = ['2025-11-01', '2025-11-05', '2025-11-10', '2025-11-15', '2025-11-20', '2025-11-25', '2025-11-30'];

    for (const day of testDays) {
        const data = await fetchAudit(BRANCH_ID, day);
        if (data?.data?.length > 0) {
            console.log('\n*** FOUND AUDIT DATA! ***');
            break;
        }
    }
}

main();
