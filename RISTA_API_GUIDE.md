# Rista API Guide

This document provides a summary of the Rista Platform API v1 for reference.

## Base URL

`https://api.ristaapps.com/v1`

## Authentication

All API endpoints require the following headers:

-   `x-api-key`: Your API Key.
-   `x-api-token`: A JSON Web Token (JWT).

A new JWT must be generated for each request.

### JWT Generation

The JWT should be signed with your Secret Key using HS256 algorithm. The payload should contain:

-   `iss`: Your API Key.
-   `iat`: Token issue time (Unix timestamp in seconds).
-   `jti`: (Optional) A unique ID for the request.

**Example (Node.js):**

```javascript
const jwt = require('jsonwebtoken');

const apiKey = 'YOUR_API_KEY';
const secretKey = 'YOUR_SECRET_KEY';

const payload = {
    iss: apiKey,
    iat: Math.floor(Date.now() / 1000)
};

const token = jwt.sign(payload, secretKey);
```

## Endpoints

### Sales Data

#### Get Detailed Sales Records

-   **Endpoint:** `GET /sales/page`
-   **Description:** Get detailed sale records for a given branch on a given day.
-   **Parameters:**
    -   `branch` (string, query, required): The branch code (e.g., `branchId`).
    -   `day` (string, query, required): The date in `YYYY-MM-DD` format.
    -   `lastKey` (string, query, optional): For paginating through results.
    -   `limit` (string, query, optional): Number of records to return (max 50).

---

### Inventory Data

#### Get GRN (Goods Received Notes) Records

-   **Endpoint:** `GET /inventory/grn/page`
-   **Description:** Get detailed Goods Received Note records for a given store on a given day.
-   **Parameters:**
    -   `branch` (string, query, required): Store Code.
    -   `day` (string, query, required): Date in `YYYY-MM-DD` format.
    -   `lastKey` (string, query, optional): For paginating through results.
    -   `limit` (string, query, optional): Number of records to return (max 50).

#### Get Transfer Out Records

-   **Endpoint:** `GET /inventory/transfer/page`
-   **Description:** Get detailed Transfer Out records from a given store on a given day.
-   **Parameters:**
    -   `branch` (string, query, required): Store Code.
    -   `day` (string, query, required): Date in `YYYY-MM-DD` format.
    -   `lastKey` (string, query, optional): For paginating through results.
    -   `limit` (string, query, optional): Number of records to return (max 50).

#### Get Shrinkage/Wastage Records

-   **Endpoint:** `GET /inventory/shrinkage/page`
-   **Description:** Get detailed Shrinkage records for a given store on a given day.
-   **Parameters:**
    -   `branch` (string, query, required): Store Code.
    -   `day` (string, query, required): Date in `YYYY-MM-DD` format.
    -   `lastKey` (string, query, optional): For paginating through results.
    -   `limit` (string, query, optional): Number of records to return (max 50).

#### Get Adjustment Records

-   **Endpoint:** `GET /inventory/adjustment/page`
-   **Description:** Get detailed Adjustment records for a given store on a given day.
-   **Parameters:**
    -   `branch` (string, query, required): Store Code.
    -   `day` (string, query, required): Date in `YYYY-MM-DD` format.
    -   `lastKey` (string, query, optional): For paginating through results.
    -   `limit` (string, query, optional): Number of records to return (max 50).

#### Get Item Activity/Consumption

-   **Endpoint:** `GET /inventory/item/activity/page`
-   **Description:** Get item activity (opening stock, closing stock, consumption, received, transferred, shrinkage) for a given store on a given day.
-   **Parameters:**
    -   `branch` (string, query, required): Store Code.
    -   `day` (string, query, required): Date in `YYYY-MM-DD` format.
    -   `lastKey` (string, query, optional): For paginating through results.
    -   `limit` (string, query, optional): Number of records to return (max 50).

#### Get Current Stock Levels

-   **Endpoint:** `POST /inventory/item/stock`
-   **Description:** Get current stock of items for a given store.
-   **Request Body:**
    -   `storeCode` (string, required): Store Code.
    -   `skuCodes` (array of strings, optional): Specific SKU codes to query.

#### Get Purchase Order Records

-   **Endpoint:** `GET /inventory/po/page`
-   **Description:** Get detailed Purchase Order records for a given store on a given day.
-   **Parameters:**
    -   `branch` (string, query, required): Store Code.
    -   `day` (string, query, required): Date in `YYYY-MM-DD` format.
    -   `lastKey` (string, query, optional): For paginating through results.
    -   `limit` (string, query, optional): Number of records to return (max 50).

#### Get Indent Records

-   **Endpoint:** `GET /inventory/indents/page`
-   **Description:** Get detailed Indent In records for a given store on a given day.
-   **Parameters:**
    -   `branch` (string, query, required): Store Code.
    -   `day` (string, query, required): Date in `YYYY-MM-DD` format.
    -   `lastKey` (string, query, optional): For paginating through results.
    -   `limit` (string, query, optional): Number of records to return (max 50).

#### Get Audit Records

-   **Endpoint:** `GET /inventory/audit/page`
-   **Description:** Get detailed Audit records from a given store on a given day.
-   **Parameters:**
    -   `branch` (string, query, required): Store Code.
    -   `day` (string, query, required): Date in `YYYY-MM-DD` format.
    -   `lastKey` (string, query, optional): For paginating through results.
    -   `limit` (string, query, optional): Number of records to return (max 50).
