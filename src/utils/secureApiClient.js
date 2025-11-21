/**
 * Secure API Client
 * Handles authentication, API key management, and secure requests to AWS API Gateway
 */

// API Keys should be stored in environment variables
const API_KEY = import.meta.env.VITE_API_KEY;
const THRESHOLD_API_KEY = import.meta.env.VITE_THRESHOLD_API_KEY;

/**
 * Get authentication headers for API requests
 */
const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");

    let businessEmail = null;
    if (user) {
        try {
            const parsed = JSON.parse(user);
            businessEmail = parsed.businessEmail || parsed.email;
        } catch (error) {
            console.error("Failed to parse user data:", error);
        }
    }

    const headers = {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(businessEmail && { "X-User-Email": businessEmail }),
        ...(API_KEY && { "X-API-Key": API_KEY }),
    };
    return headers;
};/**
 * Get threshold API headers
 */
const getThresholdHeaders = () => {
    const token = localStorage.getItem("token");

    return {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(THRESHOLD_API_KEY && { "X-API-Key": THRESHOLD_API_KEY }),
    };
};

/**
 * Secure fetch wrapper with automatic auth headers and error handling
 */
export const secureFetch = async (url, options = {}, useThresholdAPI = false) => {
    try {
        // Get appropriate headers based on API
        const authHeaders = useThresholdAPI ? getThresholdHeaders() : getAuthHeaders();

        // Merge headers
        const headers = {
            ...authHeaders,
            ...(options.headers || {}),
        };
        // Make request
        const response = await fetch(url, {
            ...options,
            headers,
        });
        // Handle unauthorized
        if (response.status === 401 || response.status === 403) {
            console.error("Unauthorized request detected");

            // Clear auth data
            localStorage.removeItem("token");
            localStorage.removeItem("user");

            // Redirect to login
            window.location.href = "/";

            throw new Error("Unauthorized - Please login again");
        }

        return response;
    } catch (error) {
        console.error("Secure fetch error:", error);
        throw error;
    }
};/**
 * Generate request signature for sensitive operations
 * This adds an extra layer of security for critical endpoints
 */
export const generateRequestSignature = (payload, timestamp) => {
    const secret = import.meta.env.VITE_REQUEST_SECRET || "default-secret";

    // Create signature string
    const signatureString = `${timestamp}:${JSON.stringify(payload)}:${secret}`;

    // Simple hash (in production, use a proper crypto library)
    let hash = 0;
    for (let i = 0; i < signatureString.length; i++) {
        const char = signatureString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }

    return Math.abs(hash).toString(16);
};

/**
 * Secure POST request with signature
 */
export const securePost = async (url, body, useThresholdAPI = false) => {
    const timestamp = Date.now();
    const signature = generateRequestSignature(body, timestamp);
    return secureFetch(
        url,
        {
            method: "POST",
            headers: {
                "X-Request-Timestamp": timestamp.toString(),
                "X-Request-Signature": signature,
            },
            body: JSON.stringify(body),
        },
        useThresholdAPI
    );
};/**
 * Validate API configuration
 */
export const validateApiConfig = () => {
    const warnings = [];

    if (!API_KEY) {
        warnings.push("ΓÜá∩╕Å VITE_API_KEY not configured");
    }

    if (!THRESHOLD_API_KEY) {
        warnings.push("ΓÜá∩╕Å VITE_THRESHOLD_API_KEY not configured");
    }

    if (!import.meta.env.VITE_REQUEST_SECRET) {
        warnings.push("ΓÜá∩╕Å VITE_REQUEST_SECRET not configured");
    }

    if (warnings.length > 0) {
        console.warn("API Security Configuration Warnings:");
        warnings.forEach(w => console.warn(w));
    }

    return warnings.length === 0;
};

/**
 * Rate limiting helper
 */
class RateLimiter {
    constructor(maxRequests = 100, timeWindow = 60000) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = [];
    }

    canMakeRequest() {
        const now = Date.now();

        // Remove old requests outside time window
        this.requests = this.requests.filter(
            timestamp => now - timestamp < this.timeWindow
        );

        // Check if under limit
        if (this.requests.length >= this.maxRequests) {
            console.warn("Rate limit reached. Please try again later.");
            return false;
        }

        // Add current request
        this.requests.push(now);
        return true;
    }

    reset() {
        this.requests = [];
    }
}

// Export rate limiter instance
export const apiRateLimiter = new RateLimiter(100, 60000); // 100 requests per minute

/**
 * Rate-limited fetch
 */
export const rateLimitedFetch = async (url, options = {}, useThresholdAPI = false) => {
    if (!apiRateLimiter.canMakeRequest()) {
        throw new Error("Rate limit exceeded. Please try again later.");
    }

    return secureFetch(url, options, useThresholdAPI);
};
