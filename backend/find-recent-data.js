// Check last week's data
const jwt = require('jsonwebtoken');

const API_KEY = '4b78002c-adc1-44b7-b588-7e1fec58d977';
const SECRET_KEY = 'pcQmKBT39KtFVRwY8Vl3SSKNqL8Agdrk71id9OBB5uY';
const BRANCH_ID = 'WWRMZ';

function generateToken() {
    return jwt.sign({
        iss: API_KEY,
        iat: Math.floor(Date.now() / 1000)
    }, SECRET_KEY, { algorithm: 'HS256' });
}

async function fetchData(endpoint, date) {
    const url = `https://api.ristaapps.com/v1/inventory/${endpoint}/page?branch=${BRANCH_ID}&day=${date}`;

    try {
        const response = await fetch(url, {
            headers: {
                'x-api-token': generateToken(),
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        return data;
    } catch (error) {
        return null;
    }
}

async function main() {
    // Check last 10 days
    const dates = [];
    for (let i = 0; i < 10; i++) {
        const d = new Date('2025-12-12');
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }

    console.log('Checking last 10 days for PO and Audit data...\n');

    for (const date of dates) {
        const po = await fetchData('po', date);
        const audit = await fetchData('audit', date);

        const poCount = po?.data?.length || 0;
        const auditCount = audit?.data?.length || 0;

        if (poCount > 0 || auditCount > 0) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`DATE: ${date}`);
            console.log(`${'='.repeat(60)}`);

            if (poCount > 0) {
                console.log(`\n📦 PURCHASE ORDERS (${poCount} records):`);
                console.log(JSON.stringify(po, null, 2));
            }

            if (auditCount > 0) {
                console.log(`\n📋 AUDIT DATA (${auditCount} records):`);
                console.log(JSON.stringify(audit, null, 2));
            }

            break; // Stop after finding first date with data
        } else {
            console.log(`${date}: No data`);
        }
    }
}

main();
