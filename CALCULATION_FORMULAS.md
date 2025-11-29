# Sales Analyzer - Metric Calculation Formulas

This document describes how each metric is calculated from the Zomato, Swiggy, and Takeaway (POS) report files.

---

## **ZOMATO Calculations**

### Column Headers Used
- `Res. ID` - Restaurant identifier
- `Order ID` - Unique order identifier (for deduplication)
- `Order Date` - Date grouping
- `Subtotal (items total)` - Items subtotal
- `Packaging charge` - Packaging fees
- `Order level Payout` - Restaurant payout
- `Restaurant discount (Promo)` - Promotional discounts
- `Restaurant discount (BOGO/others)` - BOGO and other discounts
- `Total GST collected from customers` - GST amount
- `Service fee & payment mechanism fee` - Platform service fees
- `Taxes on service` - Service taxes
- `TDS 194O amount` - TDS deductions
- `Discount Construct` - Offer details (for breakdown)

### Metric Formulas

| Metric | Formula |
|--------|---------|
| **Gross Sale** | `Subtotal (items total)` + `Packaging charge` |
| **GST on Order** | `Total GST collected from customers` |
| **Discounts** | \|`Restaurant discount (Promo)`\| + \|`Restaurant discount (BOGO/others)`\| |
| **Packings** | `Packaging charge` |
| **Commission & Taxes** | `Service fee & payment mechanism fee` + `Taxes on service` + `TDS 194O amount` |
| **Payout** | `Order level Payout` |
| **Ads** | (From "Addition Deductions Details" sheet → "total ads & miscellaneous services" row → `Total amount`) ÷ number of days |
| **Net Sale** | `Payout` - `daily_ad_cost` |
| **NBV** | 0 (not applicable for Zomato) |

### Discount Breakdown (Zomato)

Calculated per-day from NEW orders only (after deduplication):

1. **Other Discounts (BOGO, Freebies, etc.)**
   - `totalDiscount` = sum of `Restaurant discount (BOGO/others)` column
   - `orders` = count of orders with non-zero BOGO/other discount

2. **Per Promo Offer** (grouped by `Discount Construct` column)
   - `totalDiscount` = sum of `Restaurant discount (Promo)` for that offer
   - `orders` = count of orders with that offer
   - `avgDiscountPerOrder` = `totalDiscount` ÷ `orders`
   - `offerValue` = extracted from offer text (e.g., "₹100 OFF" → 100)
   - `valueRealizationPercentage` = (`avgDiscountPerOrder` ÷ `offerValue`) × 100

3. **TOTAL**
   - `orders` = sum of all orders across all discount types
   - `totalDiscount` = sum of all discounts

---

## **SWIGGY Calculations**

### Column Headers Used
- `Order No` - Unique order identifier (for deduplication)
- `Order Date` - Date grouping
- `Item Total` - Items subtotal
- `Packaging Charges` - Packaging fees
- `GST Collected` - GST amount
- `Restaurant Discount Share` - Restaurant's share of discount
- `Total Swiggy Fees` - Platform fees
- `TCS` - Tax Collected at Source
- `TDS` - Tax Deducted at Source
- `Net Payout for Order (after taxes)` - Restaurant payout

### Metric Formulas

| Metric | Formula |
|--------|---------|
| **Gross Sale** | `Item Total` + `Packaging Charges` |
| **GST on Order** | `GST Collected` |
| **Discounts** | \|`Restaurant Discount Share`\| |
| **Packings** | `Packaging Charges` |
| **Commission & Taxes** | `Total Swiggy Fees` + `TCS` + `TDS` |
| **Payout** | `Net Payout for Order (after taxes)` |
| **Ads** | (From "Payout Breakup" sheet → row matching "other charges.*refund" → total column) ÷ number of days |
| **Net Sale** | `Payout` - `daily_ad_cost` |
| **NBV** | 0 (not applicable for Swiggy) |

### Discount Breakdown (Swiggy)

Calculated from **entire file** using "Discount Summary" sheet:

1. **Per Restaurant Share %** (grouped by `Restaurant Share (%)` column)
   - `orders` = sum of `Total Orders` for that share percentage
   - `discount` = sum of `Total Discount Given` for that share percentage

2. **Ordering**: Numeric keys (e.g., 65, 100) → Undefined → TOTAL

3. **TOTAL**
   - `orders` = sum of all orders
   - `discount` = sum of all discounts

---

## **TAKEAWAY (POS) Calculations**

### Column Headers Used
- `Branch Name` - Branch identifier
- `Order Source` - Must be "POS" (filters applied)
- `Invoice Number` - Unique order identifier (for deduplication)
- `Invoice Date` - Date grouping
- `Gross Amount` - Gross sale amount
- `Discounts` - Discount amount
- `Taxes` (or `GST`) - Tax amount
- `Other Charge Amount` - Packaging/other charges
- `Total` (or `Net Sale`) - Net sale amount

### Metric Formulas

| Metric | Formula |
|--------|---------|
| **Gross Sale** | `Gross Amount` + \|`Other Charge Amount`\| - `Taxes/GST` |
| **GST on Order** | `Taxes` (or `GST`) |
| **Discounts** | \|`Discounts`\| |
| **Packings** | `Other Charge Amount` |
| **Commission & Taxes** | 0 (no commissions in POS) |
| **Payout** | 0 (no payout in POS) |
| **Ads** | 0 (no ads in POS) |
| **Net Sale** | `Total` (or `Net Sale`) |
| **NBV** | `GST` - `Discounts` |

**Note**: Only orders where `Order Source = "POS"` are processed.

---

## **Order Deduplication Logic**

To prevent double-counting when files have overlapping data:

1. **Track Order IDs**: Each daily insight stores `processedOrderIds` list
2. **Filter Duplicates**: Before processing, filter out orders with IDs already in the list
3. **Process New Orders**: Calculate metrics only from NEW orders
4. **Update Storage**: Add new order IDs to the list and save

### Order ID Columns
- **Zomato**: `Order ID`
- **Swiggy**: `Order No`
- **Takeaway**: `Invoice Number`

### Fallback
If no order ID column found, uses `file_hash + row_index` as unique identifier.

---

## **Daily Ad Cost Calculation**

For Zomato and Swiggy:

1. Extract total ads amount from respective sheets
2. Calculate: `daily_ad_cost = total_ads ÷ number_of_unique_days_in_file`
3. Apply to each day proportionally

---

## **Aggregation Process**

For each day in the file:

1. **Fetch Existing**: Load existing daily insight from S3 (if exists)
2. **Check File Hash**: Skip if file already processed (file-level deduplication)
3. **Check Order IDs**: Filter out orders already processed (order-level deduplication)
4. **Calculate Metrics**: Apply formulas above on NEW orders only
5. **Accumulate**: Add new values to existing totals
6. **Store**: Save updated insight with:
   - Updated metric totals
   - `processedFileHashes` list
   - `processedOrderIds` list
   - Discount breakdown (if applicable)

---

## **Response Summary**

The API response returns:

- **Date Range**: `startDate` and `endDate` from the file
- **Summary Metrics**: Aggregated totals across all processed dates
- **Discount Breakdown**: 
  - Zomato: Aggregated from all new orders
  - Swiggy: From entire file (same for all days)
  - Takeaway: Not calculated

---

## **Important Notes**

- All discount values use `abs()` to ensure positive amounts
- Numeric conversions use `pd.to_numeric()` with `errors='coerce'` (invalid → 0)
- Empty/null values treated as 0: `["", "-", "–", "—", "nan", "None", "NaN", "NULL"]`
- Date parsing uses `pd.to_datetime()` with `errors='coerce'`
- Currency symbols (₹, Rs.) and commas are stripped before conversion
