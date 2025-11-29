const jwt = require('jsonwebtoken');
const https = require('https');

// --- Replace with your actual credentials ---
const API_KEY = '4b78002c-adc1-44b7-b588-7e1fec58d977';
const SECRET_KEY = 'pcQmKBT39KtFVRwY8Vl3SSKNqL8Agdrk71id9OBB5uY';
// -----------------------------------------

if (!API_KEY || !SECRET_KEY) {
    console.error('Please set the VITE_RISTA_API_KEY and VITE_RISTA_SECRET_KEY environment variables with your actual Rista API credentials.');
    return;
}

const payload = {
    iss: API_KEY,
    iat: Math.floor(Date.now() / 1000),
    jti: 'req_' + Date.now()
};

const token = jwt.sign(payload, SECRET_KEY);

const options = {
    hostname: 'api.ristaapps.com',
    path: '/v1/branch/list',
    method: 'GET',
    headers: {
        'x-api-token': token,
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
    }
};

console.log('Fetching branch list from Rista API...');

const req = https.request(options, (res) => {
    let rawData = '';
    res.on('data', (chunk) => {
        rawData += chunk;
    });
    res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
            console.error(`\nAPI request failed with status code: ${res.statusCode}`);
            console.error('Raw Response:', rawData);
            return;
        }
        try {
            const parsedData = JSON.parse(rawData);
            const branchList = [];
            if (parsedData && Array.isArray(parsedData) && parsedData.length > 0) {
                parsedData.forEach(branch => {
                    if (branch.branchName && branch.branchCode) {
                        branchList.push({
                            name: branch.branchName,
                            id: branch.branchCode
                        });
                    }
                });
            } else {
                console.error("\nAPI call was successful, but the response did not contain any branch data or was not in the expected array format.");
                console.error("Raw API Response:", rawData);
            }
            // Output the structured JSON, which will be [] if no branches were found
            console.log(JSON.stringify(branchList, null, 2));

        } catch (e) {
            console.error('Error parsing JSON response:', e.message);
            console.log('--- Raw API Response ---');
            console.log(rawData);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
