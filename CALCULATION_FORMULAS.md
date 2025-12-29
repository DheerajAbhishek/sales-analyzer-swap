# Sales Analyzer - Metric Calculation Formulas

This document describes how each metric is calculated from the Zomato, Swiggy, and Takeaway (POS) report files.

---

## **ZOMATO Calculations**

### File Format & Structure
- **File Types**: Excel (.xlsx) or CSV (.csv)
- **Sheet Name**: "Order Level" (for Excel files)
- **Skip Rows**: First 6 rows are skipped (header rows)
- **Detection Method**: Looks for column matching `Week No.` pattern

### Column Headers Used (Regex Patterns)
- `Res. ID` - Restaurant identifier - Pattern: `r"Res\. ID"`
- `Order ID` - Unique order identifier (for deduplication) - Pattern: `r"Order ID"`
- `Order Date` - Date grouping - Pattern: `r"Order Date"`
- `Subtotal (items total)` - Items subtotal - Pattern: `r"Subtotal.*\(items total\)"`
- `Packaging charge` - Packaging fees - Pattern: `r"Packaging charge"`
- `Order level Payout` - Restaurant payout - Pattern: `r"Order level Payout.*"`
- `Restaurant discount (Promo)` - Promotional discounts - Pattern: `r"Restaurant discount.*Promo.*"`
- `Restaurant discount (BOGO/others)` - BOGO and other discounts - Pattern: `r"Restaurant discount.*BOGO.*others"`
- `Total GST collected from customers` - GST amount - Pattern: `r"Total GST collected from customers"`
- `Service fee & payment mechanism fee` - Platform service fees - Pattern: `r"Service fee & payment mechanism fee"`
- `Taxes on service` - Service taxes - Pattern: `r"Taxes on service.*"`
- `TDS 194O amount` - TDS deductions - Pattern: `r"TDS 194O amount.*"`
- `Discount Construct` - Offer details (for breakdown) - Found by searching for "discount construct" (case-insensitive)

### Metric Formulas

| Metric | Formula | Description |
|--------|---------|-------------|
| **Gross Sale + GST** | `Subtotal (items total)` + `Packaging charge` | Total amount WITH GST (shown in UI) |
| **Gross Sale** | `Gross Sale + GST` - `Total GST collected from customers` | Base sale amount WITHOUT GST |
| **Net Order** | `Subtotal (items total)` + `Packaging charge` - `Restaurant discount (Promo)` - `Restaurant discount (BOGO/others)` + `Total GST collected from customers` | Order value after discounts |
| **Deductions (Total)** | Commission + Taxes + Other Deductions | All platform deductions |
| **Commission** | `Base service fee` + `Payment mechanism fee` + `Long distance enablement fee` - `Discount on service fee due to 30% capping` | Platform commission |
| **Taxes** | `Taxes on service fee & payment mechanism fee` + `TDS 194O amount` + `Total GST collected from customers` | All tax deductions |
| **Other Deductions** | `Other order-level deductions` | Miscellaneous deductions |
| **Net Pay** | `Net Order` - `Total Deductions` | Final payout to restaurant |
| **No. of Orders** | Count of unique orders | Order count |
| **Discounts** | \|`Restaurant discount (Promo)`\| + \|`Restaurant discount (BOGO/others)`\| | Absolute value of total discounts |
| **GST on Order** | `Total GST collected from customers` | GST/Tax amount |
| **Packings** | `Packaging charge` | Packaging charges |
| **Commission & Taxes** | `Service fee & payment mechanism fee` + `Taxes on service` + `TDS 194O amount` | Platform fees + taxes (for compatibility) |
| **NBV** | `GST on Order` - `Discounts` | Net Business Value |

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

### File Format & Structure
- **File Types**: Excel (.xlsx) or CSV (.csv)
- **Sheet Name**: "Order Level" (for Excel files)
- **Skip Rows**: First 2 rows are skipped (header rows)
- **Detection Method**: Looks for column matching `Item Total` pattern

### Column Headers Used (Regex Patterns)
- `Order No` / `Order ID` / `Order Number` - Unique order identifier (for deduplication) - Pattern: `r"Order\s*(ID|No\.?|Number)"`
- `Order Date` - Date grouping - Pattern: `r"Order Date"`
- `Item Total` - Items subtotal - Pattern: `r"Item Total"`
- `Packaging Charges` - Packaging fees - Pattern: `r"Packaging Charges"`
- `GST Collected` - GST amount - Pattern: `r"GST Collected"`
- `Restaurant Discount Share` - Restaurant's share of discount - Pattern: `r"Restaurant Discount Share"`
- `Total Swiggy Fees` - Platform fees - Pattern: `r"Total Swiggy Fees"`
- `TCS` - Tax Collected at Source - Pattern: `r"^TCS$"`
- `TDS` - Tax Deducted at Source - Pattern: `r"^TDS$"`
- `Net Payout for Order (after taxes)` - Restaurant payout - Pattern: `r"Net Payout for Order.*after taxes.*"`

### Metric Formulas

| Metric | Formula | Description |
|--------|---------|-------------|
| **Gross Sale + GST** | `Item Total` + `Packaging Charges` | Total amount WITH GST (shown in UI) |
| **Gross Sale** | `Gross Sale + GST` - `GST Collected` | Base sale amount WITHOUT GST |
| **Net Order** | `Item Total` + `Packaging Charges` - `Restaurant Discount Share` + `GST Collected` | Order value after discounts |
| **Deductions (Total)** | Commission + Taxes + Other Deductions | All platform deductions |
| **Commission** | Sum of commission-related fees from Swiggy | Platform commission |
| **Taxes** | `TCS` + `TDS` + `GST Collected` | All tax deductions |
| **Other Deductions** | Customer cancellation charges and other fees | Miscellaneous deductions |
| **Net Pay** | `Net Order` - `Total Deductions` | Final payout to restaurant |
| **No. of Orders** | Count of unique orders | Order count |
| **Discounts** | \|`Restaurant Discount Share`\| | Absolute value of restaurant's discount share |
| **GST on Order** | `GST Collected` | GST/Tax amount |
| **Packings** | `Packaging Charges` | Packaging charges |
| **Commission & Taxes** | `Total Swiggy Fees` + `TCS` + `TDS` | Platform fees + taxes (for compatibility) |
| **NBV** | `GST on Order` - `Discounts` | Net Business Value |

### Restaurant ID Extraction (Excel Only)
- **Sheet**: "Summary"
- **Method**: 
  1. Read first 15 rows without header
  2. Search each cell for text containing "Rest. ID"
  3. Extract ID using pattern: `r"Rest\. ID\s*-\s*(\d+)"`

---

## **TAKEAWAY (POS) Calculations**

### File Format & Structure
- **File Types**: Excel (.xlsx) or CSV (.csv)
- **Single Sheet**: No specific sheet name (single sheet file)
- **Skip Rows**: First 1 row is skipped (header row)
- **Detection Method**: Looks for both `Branch Name` AND `Order Source` columns
- **Channel Filtering**: Separates data by "Channel" column:
  - `Takeaway - Swap` → Main POS orders
  - `Corporate Orders` → Saved with `_CO` suffix in restaurantId

### Column Headers Used (Regex Patterns)
- `Branch Name` - Branch identifier - Pattern: `r"Branch Name"`
- `Order Source` - Order source type - Pattern: `r"Order Source"` (Not used in filtering, kept for compatibility)
- `Invoice Number` - Unique order identifier (for deduplication) - Pattern: `r"Invoice Number"`
- `Invoice Date` - Date grouping - Pattern: `r"Invoice Date"`
- `Gross Amount` - Gross sale amount - Pattern: `r"Gross Amount"`
- `Discounts` - Discount amount - Pattern: `r"Discounts"`
- `Taxes` / `GST` - Tax amount - Pattern: `r"(Taxes(\s*\(.*\))?|GST.*)"`  
  *(Matches "Taxes", "Taxes (...)", or "GST...")*
- `Other Charge Amount` - Packaging/other charges - Pattern: `r"Other Charge Amount"`
- `Total` / `Net Sale` - Net sale amount - Pattern: `r"(Total.*|Net Sale)"`  
  *(Matches "Total", "Total (net sale)", or "Net Sale")*

### Metric Formulas

| Metric | Formula | Description |
|--------|---------|-------------|
| **Gross Sale** | `Gross Amount` + \|`Other Charge Amount`\| - `Taxes/GST` | Base sale amount WITHOUT GST |
| **Gross Sale + GST** | `Gross Sale` + `Taxes/GST` | Total amount WITH GST (shown in UI) |
| **GST on Order** | `Taxes` (or `GST`) | GST/Tax amount |
| **Discounts** | \|`Discounts`\| | Absolute value of discounts |
| **Packings** | `Other Charge Amount` | Other charges (packaging) |
| **Commission & Taxes** | 0 | No commissions in POS |
| **Net Sale** | `Gross Sale` - `GST on Order` - `Discounts` | Final sale amount |
| **NBV** | `GST on Order` - `Discounts` | Net Business Value |

### Branch Processing
- **Main Orders** (Channel = "Takeaway - Swap"):
  - Group by: Branch Name AND Date
  - RestaurantId: Sanitized branch name (non-alphanumeric chars → `_`)
  - S3 Key: `daily-insights/{sanitized_branch_name}/{date}.json`

- **Corporate Orders** (Channel = "Corporate Orders"):
  - Group by: Branch Name AND Date
  - RestaurantId: Sanitized branch name + `_CO` suffix
  - S3 Key: `daily-insights/{sanitized_branch_name}_CO/{date}.json`
  - Platform: "takeaway-corporate"

**Note**: Data is filtered by "Channel" column value, not "Order Source"

---

## **Dashboard Cards Display**

### Cards for Zomato/Swiggy (Aggregator Platforms)
These platforms show detailed breakdown with Net Order and Deductions:
1. **Gross Sale + GST** - Total amount with tax
2. **Gross Sale** - Amount without GST
3. **Net Order** (with breakdown) - Order value after discounts
4. **Deductions** (with breakdown) - Commission, Taxes, Other
5. **No. of Orders** - Order count
6. **Net Sale** - Final amount after all deductions
7. **Discounts** - Promotional and BOGO discounts
8. **GST on Order** - Tax amount
9. **Packings** - Packaging charges
10. **Commission & Taxes** - Platform fees
11. **NBV** - Net Business Value

### Cards for Takeaway/Corporate (POS Platforms)
These platforms show simpler metrics without aggregator fees:
1. **Gross Sale + GST** - Calculated as `Gross Sale` + `GST on Order`
2. **Gross Sale** - Base sale amount
3. **No. of Orders** - Order count
4. **Net Sale** - `Gross Sale` - `GST` - `Discounts`
5. **Discounts** - Discount amount
6. **GST on Order** - Tax amount
7. **Packings** - Other charges
8. **Commission & Taxes** - Always 0 (no platform fees)
9. **NBV** - `GST` - `Discounts`

**Note**: Net Order, Deductions, and Net Pay cards are ONLY shown for Zomato/Swiggy platforms.

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
  - **Gross Sale + GST**: Calculated in frontend as `Gross Sale` + `GST on Order` if not provided by backend
  - **Net Sale**: `Gross Sale` - `Commission & Taxes` - `Discounts`
  - **NBV**: `GST on Order` - `Discounts`
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
