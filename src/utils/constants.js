export const API_BASE_URL =
  "https://p28ja8leg9.execute-api.ap-south-1.amazonaws.com/Production";

export const CHART_COLORS = {
  zomato: "#ef4444", // Red
  swiggy: "#f97316", // Orange
  takeaway: "#22c55e", // Green
  subscription: "#16a34a", // Dark Green
  subs: "#16a34a", // Alias for subscription
  primary: "#6366f1",
  secondary: "#3b82f6",
  tertiary: "#06b6d4",
  accent: "#ec4899",
  warning: "#f59e0b",
  success: "#10b981",
  danger: "#ef4444",
  purple: "#6366f1",
  blue: "#3b82f6",
  cyan: "#06b6d4",
  emerald: "#10b981",
  orange: "#f97316",
  pink: "#ec4899",
  red: "#ef4444",
  green: "#22c55e",
  darkGreen: "#16a34a",
  lightGreen: "#4ade80",
  gradients: {
    primary: ["#6366f1", "#3b82f6"],
    secondary: ["#06b6d4", "#10b981"],
    accent: ["#ec4899", "#f59e0b"],
    zomato: ["#ef4444", "#dc2626"],
    swiggy: ["#f97316", "#ea580c"],
    takeaway: ["#22c55e", "#16a34a"],
    subscription: ["#16a34a", "#15803d"],
  },
  // Platform-specific color mapping
  platform: {
    zomato: "#ef4444",
    swiggy: "#f97316",
    takeaway: "#22c55e",
    subscription: "#16a34a",
    subs: "#16a34a",
  },
  // Array of colors for multiple datasets
  palette: [
    "#ef4444", // Red (Zomato)
    "#f97316", // Orange (Swiggy)
    "#22c55e", // Green (Takeaway)
    "#16a34a", // Dark Green (Subscription)
    "#6366f1", // Purple
    "#3b82f6", // Blue
    "#06b6d4", // Cyan
    "#ec4899", // Pink
    "#4ade80", // Light Green
    "#15803d", // Very Dark Green
  ],
};

export const METRICS_CONFIG = [
  { key: "grossSale", title: "Gross Sale", type: "currency" },
  { key: "netSale", title: "Net Sale", type: "currency" },
  { key: "noOfOrders", title: "No. of Orders", type: "number" },
  { key: "discounts", title: "Discounts", type: "currency" },
  { key: "commissionAndTaxes", title: "Commission & Taxes", type: "currency" },
  { key: "ads", title: "Ads", type: "currency" },
  { key: "commissionPercent", title: "Commission %", type: "percent" },
  { key: "discountPercent", title: "Discount %", type: "percent" },
  { key: "adsPercent", title: "Ads %", type: "percent" },
];
