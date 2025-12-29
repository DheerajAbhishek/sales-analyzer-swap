# Lambda: Rista Proxy (PO, Audit, Sales)

This AWS Lambda proxies to the Rista Platform API v1 for:
- Sales (`/sales/page`) aggregated over a date range
- Inventory Audit (`/inventory/audit/page`) totals
- Purchase Orders (`/inventory/po/page`) totals
- Daily Food Costing (opening/purchases/closing/sales) for a single day

## Endpoints (API Gateway)

- GET `/fetch-from-rista?branchId=WWK&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&channel=takeaway&groupBy=total`
  - Returns `{ body: { consolidatedInsights: {...} } }` with aggregated sales
- POST `/rista-inventory` with JSON `{ branchId, startDate, endDate, dataTypes: ["po","audit"], apiKey?, secretKey? }`
  - Returns `{ data: {po, audit}, summary: { totalPurchaseOrderAmount, totalAuditAmount } }`
- POST `/rista-sales` with JSON `{ branchId, startDate, endDate, channelName, apiKey?, secretKey? }`
  - Returns `{ body: { consolidatedInsights } }`
- GET or POST `/food-costing` with `branchId` and `day` (or `startDate`)
  - Returns `{ opening.totalAmount, purchases.totalAmount, closing.totalAmount, sales.{noOfOrders,grossSale,netSale}, results.{dailyCogs,foodCostPct,targetPct} }`

## Auth

- Set environment variables `RISTA_API_KEY` and `RISTA_SECRET_KEY`
- Optionally override per-request (JSON body or query) with `apiKey`, `secretKey`

## Notes

- JWT is generated per request (HS256) without external dependencies
- Aggregations are best-effort; adjust field keys as needed based on Rista responses
- CORS headers are included: `*` allow-origin, methods `OPTIONS,POST,GET`
- Root-mode routing supported via `?mode=` query for CORS-safe access:
  - `?mode=fetch-from-rista`, `?mode=rista-inventory`, `?mode=rista-sales`, `?mode=food-costing`

## Deploy

1. Create an API Gateway REST API with the 3 resource paths above, proxying to this Lambda
2. Configure Lambda environment vars `RISTA_API_URL`, `RISTA_API_KEY`, `RISTA_SECRET_KEY`
3. Test the sample:
   - GET `/fetch-from-rista?branchId=WWK&startDate=2025-12-11&endDate=2025-12-11&channel=takeaway&groupBy=total`
  - GET `/?mode=food-costing&branchId=WWK&day=2025-12-11`

