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
