const jwt = require('jsonwebtoken');
const https = require('https');
const { URL } = require('url');

/**
 * Fetch order details from Rista API by invoice number
 * Uses the notification data to find the specific order
 */

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

// Fetch all orders for a day with pagination
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

// Find order by invoice number
const findOrderByInvoice = async (invoiceNumber, branchCode, date, apiKey, secretKey, apiUrl) => {
    console.log(`\nSearching for order with invoice number: ${invoiceNumber}`);
    console.log(`Branch: ${branchCode}, Date: ${date}`);
    console.log('-------------------------------------------\n');

    const allOrders = await fetchSalesForDay(date, branchCode, apiKey, secretKey, apiUrl);
    console.log(`Total orders found for the day: ${allOrders.length}`);

    // Find the specific order by invoice number
    const order = allOrders.find(o => o.invoiceNumber === invoiceNumber);

    if (order) {
        return order;
    } else {
        // Also check sourceInfo.invoiceNumber for aggregator orders
        const orderBySource = allOrders.find(o =>
            o.sourceInfo && o.sourceInfo.invoiceNumber === invoiceNumber
        );
        return orderBySource;
    }
};

// Format order details for display
const formatOrderDetails = (order) => {
    if (!order) {
        return 'Order not found';
    }

    const details = {
        orderInfo: {
            invoiceNumber: order.invoiceNumber,
            sourceInvoiceNumber: order.sourceInfo?.invoiceNumber,
            invoiceDate: order.invoiceDate,
            channel: order.channel,
            status: order.status,
            fulfillmentStatus: order.fulfillmentStatus,
            branchName: order.branchName,
            branchCode: order.branchCode
        },
        customer: {
            name: order.delivery?.name || order.sourceInfo?.sourceCustomerDetail?.sourceCustomerName,
            phoneNumber: order.delivery?.phoneNumber || 'N/A',
            address: order.delivery?.address || {}
        },
        items: order.items?.map(item => ({
            name: item.longName || item.shortName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.itemTotalAmount,
            netAmount: item.netAmount,
            category: item.categoryName,
            skuCode: item.skuCode,
            options: item.options?.map(opt => opt.name) || []
        })) || [],
        pricing: {
            itemTotal: order.itemTotalAmount,
            discountAmount: order.discountAmount,
            chargeAmount: order.chargeAmount,
            taxAmount: order.taxAmount,
            billAmount: order.billAmount,
            netAmount: order.netAmount
        },
        discounts: order.discounts || [],
        payments: order.payments || [],
        delivery: {
            mode: order.delivery?.mode,
            deliveryDate: order.delivery?.deliveryDate,
            deliveryBy: order.deliveryBy
        },
        eventLog: order.eventLog || []
    };

    return details;
};

// Main function
async function getOrderDetails() {
    // Notification data provided by user
    const notification = {
        id: "5fbd762b-63b2-4873-927d-637fd19b2600",
        type: "order.status",
        context: {
            branchName: "Madhurwada",
            branchCode: "MAD"
        },
        data: {
            invoiceNumber: "GZU-76271",
            status: "Processed",
            channelName: "Zomato",
            sourceInvoiceNumber: "7567637330",
            deliveryInfo: {
                name: {
                    firstName: "Ashari Satish"
                },
                phoneNumber: "9010221761"
            },
            dispatchOTP: "6327",
            isModified: 0
        },
        createdDate: "2025-12-11T07:03:13.306Z"
    };

    // Extract info from notification
    const branchCode = notification.context.branchCode;
    const invoiceNumber = notification.data.invoiceNumber;
    const sourceInvoiceNumber = notification.data.sourceInvoiceNumber;
    const orderDate = notification.createdDate.split('T')[0]; // Get date in YYYY-MM-DD format

    // API credentials
    const apiKey = '4b78002c-adc1-44b7-b588-7e1fec58d977';
    const secretKey = 'pcQmKBT39KtFVRwY8Vl3SSKNqL8Agdrk71id9OBB5uY';
    const apiUrl = 'https://api.ristaapps.com/v1';

    console.log('===========================================');
    console.log('   FETCHING ORDER DETAILS FROM RISTA API');
    console.log('===========================================');
    console.log('\nNotification Data:');
    console.log(`  Invoice Number: ${invoiceNumber}`);
    console.log(`  Source Invoice Number: ${sourceInvoiceNumber}`);
    console.log(`  Branch: ${notification.context.branchName} (${branchCode})`);
    console.log(`  Channel: ${notification.data.channelName}`);
    console.log(`  Status: ${notification.data.status}`);
    console.log(`  Customer: ${notification.data.deliveryInfo.name.firstName}`);
    console.log(`  Order Date: ${orderDate}`);

    try {
        // First try to find by Rista invoice number
        let order = await findOrderByInvoice(invoiceNumber, branchCode, orderDate, apiKey, secretKey, apiUrl);

        // If not found, try with source invoice number (aggregator's invoice number)
        if (!order && sourceInvoiceNumber) {
            console.log(`\nOrder not found with invoice ${invoiceNumber}, trying source invoice: ${sourceInvoiceNumber}`);
            order = await findOrderByInvoice(sourceInvoiceNumber, branchCode, orderDate, apiKey, secretKey, apiUrl);
        }

        if (order) {
            console.log('\n===========================================');
            console.log('           ORDER DETAILS FOUND!');
            console.log('===========================================\n');

            const formattedOrder = formatOrderDetails(order);

            console.log('📋 ORDER INFORMATION:');
            console.log(JSON.stringify(formattedOrder.orderInfo, null, 2));

            console.log('\n👤 CUSTOMER INFORMATION:');
            console.log(JSON.stringify(formattedOrder.customer, null, 2));

            console.log('\n🍽️  FOOD ITEMS:');
            formattedOrder.items.forEach((item, index) => {
                console.log(`\n  ${index + 1}. ${item.name}`);
                console.log(`     Quantity: ${item.quantity}`);
                console.log(`     Unit Price: ₹${item.unitPrice}`);
                console.log(`     Total: ₹${item.totalAmount}`);
                console.log(`     Net Amount: ₹${item.netAmount}`);
                console.log(`     Category: ${item.category}`);
                console.log(`     SKU: ${item.skuCode}`);
                if (item.options && item.options.length > 0) {
                    console.log(`     Options: ${item.options.join(', ')}`);
                }
            });

            console.log('\n💰 PRICING SUMMARY:');
            console.log(JSON.stringify(formattedOrder.pricing, null, 2));

            console.log('\n🎁 DISCOUNTS:');
            console.log(JSON.stringify(formattedOrder.discounts, null, 2));

            console.log('\n💳 PAYMENTS:');
            console.log(JSON.stringify(formattedOrder.payments, null, 2));

            console.log('\n🚚 DELIVERY INFO:');
            console.log(JSON.stringify(formattedOrder.delivery, null, 2));

            console.log('\n📜 EVENT LOG:');
            formattedOrder.eventLog.forEach(event => {
                console.log(`  - ${event.status} by ${event.eventByUserName} at ${event.eventDate}`);
            });

            // Also output full raw order for debugging
            console.log('\n\n===========================================');
            console.log('           FULL RAW ORDER DATA');
            console.log('===========================================');
            console.log(JSON.stringify(order, null, 2));
        } else {
            console.log('\n❌ Order not found in the sales data for this date.');
            console.log('   This could mean:');
            console.log('   1. The order is too recent and not yet synced');
            console.log('   2. The invoice number format is different');
            console.log('   3. The order is on a different date');
        }

    } catch (error) {
        console.error('\n❌ Error fetching order details:', error);
    }
}

// Run the script
getOrderDetails();
