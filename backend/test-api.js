// backend/test-api.js
const apiClient = require('./apiClient');

// Hardcoded values for testing purposes only.
// In a real scenario, these should come from environment variables or a secure configuration.
process.env.VITE_RISTA_API_KEY = '4b78002c-adc1-44b7-b588-7e1fec58d977';      // << REPLACE WITH YOUR ACTUAL API KEY
process.env.VITE_RISTA_SECRET_KEY = 'pcQmKBT39KtFVRwY8Vl3SSKNqL8Agdrk71id9OBB5uY';  // << REPLACE WITH YOUR ACTUAL SECRET KEY
process.env.VITE_RISTA_API_URL = 'https://api.ristaapps.com/v1'; // << REPLACE WITH YOUR ACTUAL API URL

async function runTest() {
    const event = {
        queryStringParameters: {
            branchId: 'WWK', // Test with a known branch ID
            startDate: '2025-10-03',   // Test with a date range
            endDate: '2025-10-03'     // Test with a date range
        }
    };

    if (!process.env.VITE_RISTA_API_KEY || !process.env.VITE_RISTA_SECRET_KEY || !process.env.VITE_RISTA_API_URL) {
        console.error("Error: VITE_RISTA_API_KEY, VITE_RISTA_SECRET_KEY, and VITE_RISTA_API_URL environment variables must be set.");
        return;
    }

    if (event.queryStringParameters.branchId === 'your_branch_id') {
        console.warn("Warning: Please replace 'your_branch_id' in backend/test-api.js with a real branch ID.");
    }

    console.log('Testing apiClient.handler with event:', JSON.stringify(event, null, 2));

    try {
        const response = await apiClient.handler(event);

        console.log('--- Lambda Response ---');
        console.log('Status Code:', response.statusCode);

        try {
            // Try to parse and pretty-print the body if it's JSON
            const body = JSON.parse(response.body);
            console.log('Body:', JSON.stringify(body, null, 2));
        } catch (e) {
            // Otherwise, print as plain text
            console.log('Body:', response.body);
        }

        console.log('-----------------------');
    } catch (error) {
        console.error("An error occurred during the test run:", error);
    }
}

runTest();
