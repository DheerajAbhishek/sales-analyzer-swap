const jwt = require('jsonwebtoken');
const https = require('https');
const { URL } = require('url');
require('dotenv').config();

/**
 * Fetch all payments for a specific branch and date
 * Useful for tallying with PhonePe/payment gateway records
 */

// Configuration
const CONFIG = {
    apiKey: process.env.VITE_RISTA_API_KEY || process.env.RISTA_API_KEY || 'YOUR_API_KEY',
    secretKey: process.env.VITE_RISTA_SECRET_KEY || process.env.RISTA_SECRET_KEY || 'YOUR_SECRET_KEY',
    apiUrl: (process.env.VITE_RISTA_API_URL || process.env.RISTA_API_URL || 'https://api.ristaapps.com/v1').replace(/\/$/, ''),

    // Example: WeWork Kondapur on 17-12-2025
    branchCode: 'WWK',
    date: '2025-12-17'
};

// Helper function to fetch a single page of sales data
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
            headers: {
                'x-api-token': token,
                'x-api-key': apiKey,
                'Content-Type': 'application/json'
            }
        };

        console.log(`Fetching: ${ristaApiUrl.hostname}${requestPath}`);

        const req = https.request(options, (res) => {
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(rawData));
                    } catch (e) {
                        reject(new Error(`Failed to parse JSON: ${e.message}`));
                    }
                } else {
                    reject(new Error(`API request failed with status ${res.statusCode}: ${rawData}`));
                }
            });
        });
        req.on('error', (e) => reject(new Error(`Request failed: ${e.message}`)));
        req.end();
    });
};

// Fetch all orders for a day with pagination
const fetchAllSalesForDay = async (day, branchId, apiKey, secretKey, apiUrl) => {
    let allOrders = [];
    let lastKey = null;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore) {
        try {
            pageCount++;
            console.log(`\n📄 Fetching page ${pageCount}...`);
            const response = await fetchSalesPage(day, branchId, apiKey, secretKey, apiUrl, lastKey);

            if (response && Array.isArray(response.data)) {
                allOrders = allOrders.concat(response.data);
                console.log(`   Added ${response.data.length} orders (Total: ${allOrders.length})`);
            }

            if (response && response.lastKey) {
                lastKey = response.lastKey;
                hasMore = true;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error(`❌ Error fetching page ${pageCount}:`, error.message);
            hasMore = false;
        }
    }
    return allOrders;
};

// Analyze payments from all orders
const analyzePayments = (orders) => {
    const paymentSummary = {
        totalOrders: orders.length,
        ordersWithPayments: 0,
        paymentModes: {},
        paymentsByMode: {},
        totalAmount: 0,
        paymentDetails: [],
        // Additional financial breakdown
        totalBillAmount: 0,
        totalItemAmount: 0,
        totalDiscountAmount: 0,
        totalTaxAmount: 0,
        totalChargeAmount: 0,
        byChannel: {}
    };

    orders.forEach(order => {
        // Financial totals
        paymentSummary.totalBillAmount += parseFloat(order.billAmount || 0);
        paymentSummary.totalItemAmount += parseFloat(order.itemTotalAmount || 0);
        paymentSummary.totalDiscountAmount += parseFloat(order.discountAmount || 0);
        paymentSummary.totalTaxAmount += parseFloat(order.taxAmount || 0);
        paymentSummary.totalChargeAmount += parseFloat(order.chargeAmount || 0);

        // Channel breakdown
        const channel = order.channel || 'Unknown';
        if (!paymentSummary.byChannel[channel]) {
            paymentSummary.byChannel[channel] = {
                count: 0,
                billAmount: 0,
                itemAmount: 0,
                discountAmount: 0,
                taxAmount: 0
            };
        }
        paymentSummary.byChannel[channel].count++;
        paymentSummary.byChannel[channel].billAmount += parseFloat(order.billAmount || 0);
        paymentSummary.byChannel[channel].itemAmount += parseFloat(order.itemTotalAmount || 0);
        paymentSummary.byChannel[channel].discountAmount += parseFloat(order.discountAmount || 0);
        paymentSummary.byChannel[channel].taxAmount += parseFloat(order.taxAmount || 0);

        if (order.payments && Array.isArray(order.payments) && order.payments.length > 0) {
            paymentSummary.ordersWithPayments++;

            order.payments.forEach(payment => {
                const mode = payment.mode || 'Unknown';
                const amount = parseFloat(payment.amount || 0);

                // Count by mode
                if (!paymentSummary.paymentModes[mode]) {
                    paymentSummary.paymentModes[mode] = 0;
                }
                paymentSummary.paymentModes[mode]++;

                // Sum by mode
                if (!paymentSummary.paymentsByMode[mode]) {
                    paymentSummary.paymentsByMode[mode] = 0;
                }
                paymentSummary.paymentsByMode[mode] += amount;
                paymentSummary.totalAmount += amount;

                // Store details
                paymentSummary.paymentDetails.push({
                    invoiceNumber: order.invoiceNumber,
                    invoiceDate: order.invoiceDate,
                    billAmount: order.billAmount,
                    itemTotalAmount: order.itemTotalAmount,
                    discountAmount: order.discountAmount,
                    taxAmount: order.taxAmount,
                    chargeAmount: order.chargeAmount,
                    paymentMode: mode,
                    paymentAmount: amount,
                    paymentStatus: payment.status,
                    reference: payment.reference || payment.transactionId || '',
                    channel: order.channel,
                    customerPhone: order.delivery?.phoneNumber || 'N/A'
                });
            });
        }
    });

    return paymentSummary;
};

// Main function
async function fetchPaymentsSummary() {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║          RISTA PAYMENTS SUMMARY FETCHER                    ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        console.log(`📍 Branch: ${CONFIG.branchCode}`);
        console.log(`📅 Date: ${CONFIG.date}`);
        console.log(`🔗 API: ${CONFIG.apiUrl}\n`);

        // Fetch all orders
        console.log('🔄 Fetching all orders for the day...\n');
        const orders = await fetchAllSalesForDay(
            CONFIG.date,
            CONFIG.branchCode,
            CONFIG.apiKey,
            CONFIG.secretKey,
            CONFIG.apiUrl
        );

        console.log(`\n✅ Successfully fetched ${orders.length} orders\n`);

        // Analyze payments
        const summary = analyzePayments(orders);

        // Display summary
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                    PAYMENT SUMMARY                         ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        console.log(`📊 Total Orders: ${summary.totalOrders}`);
        console.log(`💳 Orders with Payments: ${summary.ordersWithPayments}`);
        console.log(`💰 Total Payment Amount: ₹${summary.totalAmount.toFixed(2)}\n`);

        // Financial breakdown
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('💵 FINANCIAL BREAKDOWN (From RISTA):\n');
        console.log(`   Item Total:       ₹${summary.totalItemAmount.toFixed(2)}`);
        console.log(`   Tax Amount:       ₹${summary.totalTaxAmount.toFixed(2)}`);
        console.log(`   Discount Amount: -₹${summary.totalDiscountAmount.toFixed(2)}`);
        console.log(`   Charge Amount:    ₹${summary.totalChargeAmount.toFixed(2)}`);
        console.log(`   Bill Amount:      ₹${summary.totalBillAmount.toFixed(2)}`);

        // Calculate percentages
        const discountPercent = summary.totalItemAmount > 0 ?
            (summary.totalDiscountAmount / summary.totalItemAmount * 100).toFixed(2) : 0;
        console.log(`   Discount %:       ${discountPercent}%`);

        // Channel breakdown
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📺 CHANNEL BREAKDOWN:\n');
        Object.entries(summary.byChannel)
            .sort((a, b) => b[1].billAmount - a[1].billAmount)
            .forEach(([channel, data]) => {
                console.log(`   ${channel}:`);
                console.log(`      Orders: ${data.count}`);
                console.log(`      Bill Amount: ₹${data.billAmount.toFixed(2)}`);
                console.log(`      Item Amount: ₹${data.itemAmount.toFixed(2)}`);
                console.log(`      Discounts: ₹${data.discountAmount.toFixed(2)}`);
                console.log(`      Tax: ₹${data.taxAmount.toFixed(2)}`);
                console.log('');
            });

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('💳 PAYMENT MODES BREAKDOWN:\n');

        Object.entries(summary.paymentsByMode)
            .sort((a, b) => b[1] - a[1])
            .forEach(([mode, amount]) => {
                const count = summary.paymentModes[mode];
                console.log(`   ${mode.padEnd(20)} │ ₹${amount.toFixed(2).padStart(12)} │ ${count} txns`);
            });

        // PhonePe specific summary
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📱 PHONEPE / UPI PAYMENTS:\n');

        const phonePePayments = summary.paymentDetails.filter(p =>
            p.paymentMode.toLowerCase().includes('phonepe') ||
            p.paymentMode.toLowerCase().includes('upi') ||
            p.paymentMode.toLowerCase().includes('phone')
        );

        if (phonePePayments.length > 0) {
            const phonePeTotal = phonePePayments.reduce((sum, p) => sum + p.paymentAmount, 0);
            console.log(`   Total PhonePe/UPI Amount: ₹${phonePeTotal.toFixed(2)}`);
            console.log(`   Number of Transactions: ${phonePePayments.length}\n`);

            console.log('   Individual Transactions:');
            phonePePayments.forEach(p => {
                console.log(`   • ${p.invoiceNumber} │ ₹${p.paymentAmount.toFixed(2)} │ ${p.paymentMode} │ ${p.reference || 'No Ref'}`);
            });
        } else {
            console.log('   ⚠️  No PhonePe/UPI payments found');
        }

        // Detailed payment list
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📋 ALL PAYMENT DETAILS:\n');

        summary.paymentDetails.forEach(p => {
            console.log(`Invoice: ${p.invoiceNumber}`);
            console.log(`   Date: ${p.invoiceDate}`);
            console.log(`   Channel: ${p.channel}`);
            console.log(`   Item Amount: ₹${p.itemTotalAmount}`);
            console.log(`   Discount: ₹${p.discountAmount}`);
            console.log(`   Tax: ₹${p.taxAmount}`);
            console.log(`   Charge: ₹${p.chargeAmount}`);
            console.log(`   Bill Amount: ₹${p.billAmount}`);
            console.log(`   Payment Mode: ${p.paymentMode}`);
            console.log(`   Payment Amount: ₹${p.paymentAmount}`);
            console.log(`   Status: ${p.paymentStatus || 'N/A'}`);
            console.log(`   Reference: ${p.reference || 'N/A'}`);
            console.log(`   Phone: ${p.customerPhone}`);
            console.log('');
        });

        // Comparison with consolidated insights
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║          COMPARISON WITH CONSOLIDATED INSIGHTS             ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        // User's consolidated insights data for Takeaway - Swap
        const consolidatedTakeaway = {
            noOfOrders: 8,
            grossSale: 6732.66,
            gstOnOrder: 300.34,
            discounts: 726.34,
            nbv: 6006.32
        };

        // User's consolidated insights data for Corporate Orders
        const consolidatedCorporate = {
            noOfOrders: 2,
            grossSale: 910.04,
            gstOnOrder: 40.96,
            discounts: 91.0,
            nbv: 819.04
        };

        // Combined totals
        const consolidatedTotal = {
            noOfOrders: consolidatedTakeaway.noOfOrders + consolidatedCorporate.noOfOrders,
            grossSale: consolidatedTakeaway.grossSale + consolidatedCorporate.grossSale,
            gstOnOrder: consolidatedTakeaway.gstOnOrder + consolidatedCorporate.gstOnOrder,
            discounts: consolidatedTakeaway.discounts + consolidatedCorporate.discounts,
            nbv: consolidatedTakeaway.nbv + consolidatedCorporate.nbv
        };

        console.log('   YOUR CONSOLIDATED INSIGHTS (Takeaway - Swap):');
        console.log(`      Orders: ${consolidatedTakeaway.noOfOrders}`);
        console.log(`      Gross Sale: ₹${consolidatedTakeaway.grossSale.toFixed(2)}`);
        console.log(`      GST: ₹${consolidatedTakeaway.gstOnOrder.toFixed(2)}`);
        console.log(`      Discounts: ₹${consolidatedTakeaway.discounts.toFixed(2)}`);
        console.log(`      NBV: ₹${consolidatedTakeaway.nbv.toFixed(2)}`);
        console.log('');

        console.log('   YOUR CONSOLIDATED INSIGHTS (Corporate Orders):');
        console.log(`      Orders: ${consolidatedCorporate.noOfOrders}`);
        console.log(`      Gross Sale: ₹${consolidatedCorporate.grossSale.toFixed(2)}`);
        console.log(`      GST: ₹${consolidatedCorporate.gstOnOrder.toFixed(2)}`);
        console.log(`      Discounts: ₹${consolidatedCorporate.discounts.toFixed(2)}`);
        console.log(`      NBV: ₹${consolidatedCorporate.nbv.toFixed(2)}`);
        console.log('');

        console.log('   YOUR CONSOLIDATED TOTAL (Combined):');
        console.log(`      Orders: ${consolidatedTotal.noOfOrders}`);
        console.log(`      Gross Sale: ₹${consolidatedTotal.grossSale.toFixed(2)}`);
        console.log(`      GST: ₹${consolidatedTotal.gstOnOrder.toFixed(2)}`);
        console.log(`      Discounts: ₹${consolidatedTotal.discounts.toFixed(2)}`);
        console.log(`      NBV: ₹${consolidatedTotal.nbv.toFixed(2)}`);
        console.log('');

        console.log('   RISTA API DATA (All Orders):');
        console.log(`      Orders: ${summary.totalOrders}`);
        console.log(`      Item Total: ₹${summary.totalItemAmount.toFixed(2)}`);
        console.log(`      Tax Amount: ₹${summary.totalTaxAmount.toFixed(2)}`);
        console.log(`      Discounts: ₹${Math.abs(summary.totalDiscountAmount).toFixed(2)}`);
        console.log(`      Bill Amount: ₹${summary.totalBillAmount.toFixed(2)}`);
        console.log('');

        // Get RISTA data excluding aggregators (Zomato/Swiggy)
        const ristaNoAggregators = {
            orders: (summary.byChannel['Takeaway - Swap']?.count || 0) + (summary.byChannel['Corporate Orders']?.count || 0),
            itemAmount: (summary.byChannel['Takeaway - Swap']?.itemAmount || 0) + (summary.byChannel['Corporate Orders']?.itemAmount || 0),
            taxAmount: (summary.byChannel['Takeaway - Swap']?.taxAmount || 0) + (summary.byChannel['Corporate Orders']?.taxAmount || 0),
            discountAmount: Math.abs((summary.byChannel['Takeaway - Swap']?.discountAmount || 0) + (summary.byChannel['Corporate Orders']?.discountAmount || 0)),
            billAmount: (summary.byChannel['Takeaway - Swap']?.billAmount || 0) + (summary.byChannel['Corporate Orders']?.billAmount || 0)
        };

        console.log('   RISTA API DATA (Excluding Zomato/Swiggy):');
        console.log(`      Orders: ${ristaNoAggregators.orders}`);
        console.log(`      Item Total: ₹${ristaNoAggregators.itemAmount.toFixed(2)}`);
        console.log(`      Tax Amount: ₹${ristaNoAggregators.taxAmount.toFixed(2)}`);
        console.log(`      Discounts: ₹${ristaNoAggregators.discountAmount.toFixed(2)}`);
        console.log(`      Bill Amount: ₹${ristaNoAggregators.billAmount.toFixed(2)}`);
        console.log('');

        console.log('   ═══════════════════════════════════════════════════════════\n');
        console.log('   MATCH VERIFICATION:\n');

        // Check Takeaway - Swap match
        const takeawayMatch =
            summary.byChannel['Takeaway - Swap']?.count === consolidatedTakeaway.noOfOrders &&
            Math.abs(summary.byChannel['Takeaway - Swap']?.itemAmount - consolidatedTakeaway.grossSale) < 0.01 &&
            Math.abs(summary.byChannel['Takeaway - Swap']?.taxAmount - consolidatedTakeaway.gstOnOrder) < 0.01;

        console.log(`   ✓ Takeaway - Swap: ${takeawayMatch ? '✅ EXACT MATCH' : '❌ MISMATCH'}`);
        if (takeawayMatch) {
            console.log(`      Orders: ${summary.byChannel['Takeaway - Swap']?.count} = ${consolidatedTakeaway.noOfOrders} ✓`);
            console.log(`      Gross Sale: ₹${summary.byChannel['Takeaway - Swap']?.itemAmount.toFixed(2)} = ₹${consolidatedTakeaway.grossSale.toFixed(2)} ✓`);
            console.log(`      GST: ₹${summary.byChannel['Takeaway - Swap']?.taxAmount.toFixed(2)} = ₹${consolidatedTakeaway.gstOnOrder.toFixed(2)} ✓`);
        }

        // Check Corporate Orders match
        const corporateMatch =
            summary.byChannel['Corporate Orders']?.count === consolidatedCorporate.noOfOrders &&
            Math.abs(summary.byChannel['Corporate Orders']?.itemAmount - consolidatedCorporate.grossSale) < 0.01 &&
            Math.abs(summary.byChannel['Corporate Orders']?.taxAmount - consolidatedCorporate.gstOnOrder) < 0.01;

        console.log(`\n   ✓ Corporate Orders: ${corporateMatch ? '✅ EXACT MATCH' : '❌ MISMATCH'}`);
        if (corporateMatch) {
            console.log(`      Orders: ${summary.byChannel['Corporate Orders']?.count} = ${consolidatedCorporate.noOfOrders} ✓`);
            console.log(`      Gross Sale: ₹${summary.byChannel['Corporate Orders']?.itemAmount.toFixed(2)} = ₹${consolidatedCorporate.grossSale.toFixed(2)} ✓`);
            console.log(`      GST: ₹${summary.byChannel['Corporate Orders']?.taxAmount.toFixed(2)} = ₹${consolidatedCorporate.gstOnOrder.toFixed(2)} ✓`);
        }

        // Check combined match
        const combinedMatch =
            ristaNoAggregators.orders === consolidatedTotal.noOfOrders &&
            Math.abs(ristaNoAggregators.itemAmount - consolidatedTotal.grossSale) < 0.01 &&
            Math.abs(ristaNoAggregators.taxAmount - consolidatedTotal.gstOnOrder) < 0.01;

        console.log(`\n   ✓ Combined Total: ${combinedMatch ? '✅ EXACT MATCH' : '❌ MISMATCH'}`);
        if (combinedMatch) {
            console.log(`      Orders: ${ristaNoAggregators.orders} = ${consolidatedTotal.noOfOrders} ✓`);
            console.log(`      Gross Sale: ₹${ristaNoAggregators.itemAmount.toFixed(2)} = ₹${consolidatedTotal.grossSale.toFixed(2)} ✓`);
            console.log(`      GST: ₹${ristaNoAggregators.taxAmount.toFixed(2)} = ₹${consolidatedTotal.gstOnOrder.toFixed(2)} ✓`);
        }

        console.log('');

        // Summary of what's excluded
        const excludedOrders = summary.totalOrders - ristaNoAggregators.orders;
        if (excludedOrders > 0) {
            console.log('   📌 EXCLUDED FROM YOUR CONSOLIDATED INSIGHTS:');
            if (summary.byChannel['Zomato']) {
                console.log(`      • Zomato: ${summary.byChannel['Zomato'].count} order(s), ₹${summary.byChannel['Zomato'].billAmount.toFixed(2)}`);
            }
            if (summary.byChannel['Swiggy']) {
                console.log(`      • Swiggy: ${summary.byChannel['Swiggy'].count} order(s), ₹${summary.byChannel['Swiggy'].billAmount.toFixed(2)}`);
            }
            console.log(`      Total Excluded: ${excludedOrders} orders\n`);
        }


        // Export to JSON for further analysis
        const exportData = {
            branch: CONFIG.branchCode,
            date: CONFIG.date,
            summary: {
                totalOrders: summary.totalOrders,
                ordersWithPayments: summary.ordersWithPayments,
                totalAmount: summary.totalAmount,
                paymentsByMode: summary.paymentsByMode,
                phonePeTotal: phonePePayments.reduce((sum, p) => sum + p.paymentAmount, 0),
                phonePeCount: phonePePayments.length
            },
            payments: summary.paymentDetails
        };

        const fs = require('fs');
        const fileName = `payments_${CONFIG.branchCode}_${CONFIG.date}.json`;
        fs.writeFileSync(fileName, JSON.stringify(exportData, null, 2));
        console.log(`\n💾 Payment details exported to: ${fileName}\n`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    }
}

// Run the script
fetchPaymentsSummary();
