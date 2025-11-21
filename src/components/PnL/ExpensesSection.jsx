import React, { useState, useEffect } from "react";
import { expenseService } from "../../services/api";
import { formatValue } from "../../utils/helpers";

const ExpensesSection = ({
  selections,
  grossSale,
  grossSaleAfterGST,
  netSale,
}) => {
  const [expenses, setExpenses] = useState({
    openingInventory: "",
    closingInventory: "",
    foodCosting: "",
    expensesPackings: "",
    misc: "",
    subscriptions_and_logistics: "",
    rent: "",
    electricity: "",
    salaries: "",
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [showExpensesTable, setShowExpensesTable] = useState(false);

  if (!selections?.restaurants?.length || !selections?.startDate) {
    return <div className="expenses-section">Invalid selections</div>;
  }
  useEffect(() => {
    loadExpenses();
  }, [restaurantKey, month, grossSale]);

  useEffect(() => {
    loadExpenses();
  }, [restaurantKey, month]);

  const loadExpenses = async () => {
    try {
      const response = await expenseService.getExpenses(restaurantKey, month);
      const savedData = response.body ? JSON.parse(response.body) : response;

      if (savedData && Object.keys(savedData).length > 0) {
        setExpenses({
          openingInventory: savedData.openingInventory || "",
          closingInventory: savedData.closingInventory || "",
          foodCosting: savedData.foodCosting || "",
          expensesPackings:
            savedData.expensesPackings || savedData.pnlPackings || "",
          misc: savedData.misc || "",
          subscriptions_and_logistics:
            savedData.subscriptions_and_logistics || "",
          rent: savedData.rent || "",
          electricity: savedData.electricity || "",
          salaries: savedData.salaries || "",
        });
      }
    } catch (err) {
      if (err.response?.status === 404) {
      } else {
        console.error("Error loading expenses:", err);
        setStatus("Failed to load expenses");
      }
    }
  };

  const handleInputChange = (field, value) => {
    setExpenses((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus("Saving expenses...");

    try {
      const expenseData = {};
      Object.keys(expenses).forEach((key) => {
        expenseData[key] = parseFloat(expenses[key]) || 0;
      });

      await expenseService.saveExpenses(restaurantKey, month, expenseData);
      setStatus("Expenses saved successfully!");
      setShowExpensesTable(true);

      setTimeout(() => setStatus(""), 3000);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      setTimeout(() => setStatus(""), 5000);
    } finally {
      setSaving(false);
    }
  };

  const getStatusClass = () => {
    if (status.includes("successfully")) return "status success";
    if (status.includes("Error:")) return "status error";
    if (status.includes("Saving")) return "status loading";
    return "status";
  };

  const calculatePercentage = (value) => {
    return grossSaleAfterGST > 0
      ? (((parseFloat(value) || 0) / grossSaleAfterGST) * 100).toFixed(2) + "%"
      : "0%";
  };

  const calculateTotalExpenses = () => {
    return Object.values(expenses).reduce((total, value) => {
      return total + (parseFloat(value) || 0);
    }, 0);
  };

  const calculateProfitLoss = () => {
    const totalExpenses = calculateTotalExpenses();
    return (netSale || 0) - totalExpenses;
  };

  const getProfitLossLabel = () => {
    const profitLoss = calculateProfitLoss();
    return profitLoss >= 0 ? "Profit" : "Loss";
  };

  const expenseFields = [
    { key: "openingInventory", label: "Opening Inventory" },
    { key: "closingInventory", label: "Closing Inventory" },
    { key: "foodCosting", label: "Food Costing" },
    { key: "expensesPackings", label: "Packings" },
    { key: "misc", label: "Miscellaneous" },
    { key: "subscriptions_and_logistics", label: "Subscriptions & Logistics" },
    { key: "rent", label: "Rent" },
    { key: "electricity", label: "Electricity" },
    { key: "salaries", label: "Salaries" },
  ];

  return (
    <div className="expenses-section">
      <h2 className="card-header">Monthly Expenses Analysis</h2>

      <div className="expenses-grid">
        {expenseFields.map((field) => (
          <div key={field.key} className="form-group">
            <label className="form-label">{field.label}</label>
            <input
              type="number"
              className="form-control"
              placeholder="0.00"
              value={expenses[field.key]}
              onChange={(e) => handleInputChange(field.key, e.target.value)}
              step="0.01"
            />
          </div>
        ))}
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving}
        style={{ marginBottom: "1rem" }}
      >
        {saving ? "Saving..." : "Save Expenses"}
      </button>

      {status && <div className={getStatusClass()}>{status}</div>}

      {showExpensesTable && grossSale > 0 && (
        <div className="expenses-display">
          <h3
            style={{
              textAlign: "center",
              marginBottom: "1rem",
              color: "var(--primary-black)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            ≡ƒôè Expenses Analysis
          </h3>
          <table>
            <thead>
              <tr>
                <th>Expense Category</th>
                <th>Amount</th>
                <th>% of Gross Sale After GST</th>
              </tr>
            </thead>
            <tbody>
              {expenseFields.map((field) => {
                const value = parseFloat(expenses[field.key]) || 0;
                return (
                  <tr key={field.key}>
                    <td>{field.label}</td>
                    <td>{formatValue(value, "currency")}</td>
                    <td>{calculatePercentage(value)}</td>
                  </tr>
                );
              })}
              <tr
                style={{
                  borderTop: "2px solid #6366f1",
                  backgroundColor: "#f1f5f9",
                  fontWeight: "bold",
                }}
              >
                <td style={{ fontWeight: "bold" }}>Total Expenses</td>
                <td style={{ fontWeight: "bold" }}>
                  {formatValue(calculateTotalExpenses(), "currency")}
                </td>
                <td style={{ fontWeight: "bold" }}>
                  {calculatePercentage(calculateTotalExpenses())}
                </td>
              </tr>
              <tr
                style={{
                  borderTop: "1px solid #cbd5e1",
                  backgroundColor:
                    calculateProfitLoss() >= 0 ? "#f0fdf4" : "#fef2f2",
                  fontWeight: "bold",
                  color: calculateProfitLoss() >= 0 ? "#166534" : "#991b1b",
                }}
              >
                <td style={{ fontWeight: "bold" }}>{getProfitLossLabel()}</td>
                <td style={{ fontWeight: "bold" }}>
                  {formatValue(Math.abs(calculateProfitLoss()), "currency")}
                </td>
                <td style={{ fontWeight: "bold" }}>
                  {grossSaleAfterGST > 0
                    ? (
                      (Math.abs(calculateProfitLoss()) / grossSaleAfterGST) *
                      100
                    ).toFixed(2) + "%"
                    : "0%"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExpensesSection;
