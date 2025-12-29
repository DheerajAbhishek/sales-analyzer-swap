// Discover actual branch codes for sales vs inventory endpoints
const jwt = require('jsonwebtoken');
const fs = require('fs');

const API_KEY = '4b78002c-adc1-44b7-b588-7e1fec58d977';
const SECRET_KEY = 'pcQmKBT39KtFVRwY8Vl3SSKNqL8Agdrk71id9OBB5uY';
const TEST_DATE = '2025-12-02'; // Recent date with likely activity

// Read the full branch list to get priceBook info
const branchListOutput = fs.readFileSync('./branch-list-output.txt', 'utf8');
const match = branchListOutput.match(/--- Your Branches ---\s*(\[[\s\S]*?\])/);
const fullBranchList = match ? JSON.parse(match[1]) : [];

// Read our simplified branches file
const branches = JSON.parse(fs.readFileSync('./branches', 'utf8'));

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

async function testBranchCode(endpoint, branchCode) {
    const requestId = `req_${Date.now()}_test`;
    const headers = getHeaders(requestId);
    const url = `https://api.ristaapps.com/v1/${endpoint}?branch=${branchCode}&day=${TEST_DATE}&limit=1`;

    try {
        const response = await fetch(url, { headers });
        const data = await response.json();

        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
            return {
                works: true,
                actualCode: data.data[0].branchCode || branchCode,
                actualName: data.data[0].branchName || data.data[0].branch || null
            };
        } else if (data?.code === 'BadRequestError') {
            return { works: false, error: data.errors?.[0]?.message };
        }
        return { works: false };
    } catch (error) {
        return { works: false, error: error.message };
    }
}

// Generate possible variations based on priceBook
function generatePossibleCodes(branch, fullBranchInfo) {
    const codes = [branch.id];

    if (fullBranchInfo?.priceBook) {
        const priceBook = fullBranchInfo.priceBook;

        // WeWork variations
        if (priceBook.toLowerCase().includes('wework')) {
            // Pattern 1: "WeWork RMZ" -> WWRMZ
            const rmzMatch = priceBook.match(/RMZ/i);
            if (rmzMatch) {
                codes.push('WWRMZ');
            }

            // Pattern 2: Extract abbreviation from priceBook
            // e.g., "WeWork Kondapur" -> WWK
            const words = priceBook.split(/\s+/);
            if (words.length >= 2) {
                const abbrev = words.slice(0, 3).map(w => w.charAt(0).toUpperCase()).join('');
                codes.push(abbrev);
            }

            // Pattern 3: WW + last word first letters
            if (words.length >= 2) {
                const lastWord = words[words.length - 1];
                codes.push('WW' + lastWord.substring(0, 3).toUpperCase());
            }
        }

        // Check if branch name itself has hints
        if (branch.name.toLowerCase().includes('wework') || branch.name.toLowerCase().includes('symbiosis')) {
            // For Symbiosis: WWSS
            if (branch.name.toLowerCase().includes('symbiosis')) {
                codes.push('WWSS');
            }
        }
    }

    return [...new Set(codes)]; // Remove duplicates
}

async function discoverBranchCodes() {
    console.log('🔍 Discovering actual branch codes for all branches...\n');
    console.log('Testing each branch against sales and inventory endpoints\n');
    console.log('━'.repeat(80));

    const results = [];

    for (const branch of branches) {
        const fullBranchInfo = fullBranchList.find(b => b.branchName === branch.name);
        const possibleCodes = generatePossibleCodes(branch, fullBranchInfo);

        console.log(`\n📍 ${branch.name}`);
        console.log(`   Listed Code: ${branch.id}`);
        if (fullBranchInfo?.priceBook) {
            console.log(`   Price Book: ${fullBranchInfo.priceBook}`);
        }
        console.log(`   Testing codes: ${possibleCodes.join(', ')}`);

        let salesCode = null;
        let inventoryCode = null;

        // Test each possible code variation
        for (const code of possibleCodes) {
            console.log(`   Testing ${code}...`);

            // Always test both endpoints for each code
            const salesResult = await testBranchCode('sales/page', code);
            if (salesResult.works && !salesCode) {
                salesCode = salesResult.actualCode;
                console.log(`      ✅ Sales works with: ${salesCode}`);
            }

            await new Promise(resolve => setTimeout(resolve, 300));

            const invResult = await testBranchCode('inventory/po/page', code);
            if (invResult.works && !inventoryCode) {
                inventoryCode = invResult.actualCode;
                console.log(`      ✅ Inventory works with: ${inventoryCode}`);
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        results.push({
            name: branch.name,
            listedCode: branch.id,
            salesCode: salesCode || 'N/A',
            inventoryCode: inventoryCode || 'N/A',
            priceBook: fullBranchInfo?.priceBook || 'N/A',
            mismatch: salesCode !== inventoryCode && salesCode && inventoryCode
        });

        if (salesCode !== inventoryCode && salesCode && inventoryCode) {
            console.log(`   ⚠️  MISMATCH DETECTED!`);
            console.log(`      Sales: ${salesCode}, Inventory: ${inventoryCode}`);
        }

        // Longer delay between branches
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n\n' + '━'.repeat(80));
    console.log('📊 SUMMARY');
    console.log('━'.repeat(80));

    console.log('\n🔴 Branches with mismatched codes:\n');
    const mismatches = results.filter(r => r.mismatch);
    if (mismatches.length === 0) {
        console.log('   None found!');
    } else {
        mismatches.forEach(r => {
            console.log(`   ${r.name}:`);
            console.log(`      Sales Code: ${r.salesCode}`);
            console.log(`      Inventory Code: ${r.inventoryCode}`);
        });
    }

    console.log('\n\n📝 Creating branch code mapping file...\n');

    // Create mapping object
    const mapping = {
        branches: results.map(r => ({
            name: r.name,
            salesCode: r.salesCode,
            inventoryCode: r.inventoryCode,
            priceBook: r.priceBook,
            note: r.mismatch ? 'Different codes for sales vs inventory' : 'Same code for both endpoints'
        }))
    };

    fs.writeFileSync('./branch-codes-mapping.json', JSON.stringify(mapping, null, 2));
    console.log('✅ Saved to: branch-codes-mapping.json\n');

    return results;
}

discoverBranchCodes().catch(console.error);
