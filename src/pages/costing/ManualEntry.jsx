import { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_DASHBOARD_API;
const USER_EMAIL = import.meta.env.VITE_DASHBOARD_USER;
const UPLOAD_API = import.meta.env.VITE_UPLOAD_API;

export default function ManualEntry() {
  const [branches, setBranches] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [itemsList, setItemsList] = useState([]);

  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");

  const [rows, setRows] = useState([
    { description: "", qty: "", price: "", gst: "", total: "" },
  ]);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBranches();
    loadVendors();
    loadItems();
  }, []);

  async function loadBranches() {
    try {
      const res = await axios.get(
        `${API_BASE}?mode=branches&user_email=${USER_EMAIL}`
      );
      setBranches(res.data.branches || []);
    } catch (err) {
      console.log("Failed to load branches");
    }
  }

  async function loadVendors() {
    try {
      const res = await axios.get(
        `${API_BASE}?mode=vendors&user_email=${USER_EMAIL}`
      );
      setVendors(res.data.vendors || []);
    } catch (err) {
      console.log("Failed to load vendors");
    }
  }

  async function loadItems() {
    try {
      const res = await axios.get(
        `${API_BASE}?mode=items&user_email=${USER_EMAIL}`
      );
      setItemsList(res.data.items || []);
    } catch (err) {
      console.log("Failed to load items");
    }
  }

  function addRow() {
    setRows([
      ...rows,
      { description: "", qty: "", price: "", gst: "", total: "" },
    ]);
  }

  function updateRow(index, field, value) {
    const updated = [...rows];
    updated[index][field] = value;

    if (field === "qty" || field === "price") {
      const q = parseFloat(updated[index].qty || 0);
      const p = parseFloat(updated[index].price || 0);
      updated[index].total = (q * p).toFixed(2);
    }

    setRows(updated);
  }

  async function submitManualInvoice() {
    if (!selectedBranch || !invoiceDate) {
      setMessage("❌ Please fill all required fields.");
      return;
    }

    let vendorToSubmit = selectedVendor;

    if (selectedVendor === "__new__") {
      if (!newVendorName.trim()) {
        setMessage("❌ Please enter vendor name.");
        return;
      }
      vendorToSubmit = newVendorName.trim();
    }

    const formattedItems = rows.map((r, idx) => ({
      "Product No.": `MANUAL-${idx + 1}`,
      Description: r.description,
      Qty: r.qty,
      "Price/Unit": r.price,
      "Gst Amt %": r.gst,
      "Total Price(in Rs.)": r.total,
    }));

    const payload = {
      event_type: "invoice",
      user_email: USER_EMAIL,
      branch_name: selectedBranch,
      vendor_name: vendorToSubmit,
      target_date: invoiceDate,
      items: formattedItems,
    };

    try {
      setLoading(true);
      setMessage("");

      await axios.post(UPLOAD_API, payload);

      setMessage("✅ Manual invoice submitted successfully!");
      setRows([{ description: "", qty: "", price: "", gst: "", total: "" }]);
      setNewVendorName("");
    } catch (err) {
      console.error(err);
      setMessage("❌ Failed to submit manual invoice.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="costing-module" style={{ padding: "20px", maxWidth: 1000, margin: "auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg,#e6f0ff,#dff0ff)",
            fontWeight: 800,
          }}
        >
          CD
        </div>
        <h2 style={{ margin: 0 }}>📝 Manual Invoice Entry</h2>
      </div>

      {/* Dropdowns */}
      <div style={{ display: "flex", gap: 20, marginTop: 20, flexWrap: "wrap" }}>
        {/* Branch */}
        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Branch</label>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            style={{ padding: 8, minWidth: 180, borderRadius: 6, border: "1px solid #ccc" }}
          >
            <option value="">Select Branch</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* Vendor */}
        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Vendor</label>
          <select
            value={selectedVendor}
            onChange={(e) => setSelectedVendor(e.target.value)}
            style={{ padding: 8, minWidth: 180, borderRadius: 6, border: "1px solid #ccc" }}
          >
            <option value="">Select Vendor</option>
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
            <option value="__new__">➕ Add New Vendor</option>
          </select>

          {selectedVendor === "__new__" && (
            <input
              type="text"
              placeholder="Enter vendor name"
              style={{ marginTop: 8, padding: 8, borderRadius: 6, border: "1px solid #ccc", width: "100%" }}
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
            />
          )}
        </div>

        {/* Date */}
        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Invoice Date</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>
      </div>

      {/* Items Table */}
      <div style={{ overflowX: "auto", marginTop: 30 }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8 }}
        >
          <thead>
            <tr style={{ background: "#213547", color: "#fff" }}>
              <th style={{ padding: 12 }}>Description</th>
              <th style={{ padding: 12 }}>Qty</th>
              <th style={{ padding: 12 }}>Price/Unit</th>
              <th style={{ padding: 12 }}>GST %</th>
              <th style={{ padding: 12 }}>Total (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>
                  <input
                    list="items-list"
                    value={r.description}
                    onChange={(e) => updateRow(i, "description", e.target.value)}
                    style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4 }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    type="number"
                    value={r.qty}
                    onChange={(e) => updateRow(i, "qty", e.target.value)}
                    style={{ width: "80px", padding: 6, border: "1px solid #ddd", borderRadius: 4 }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    type="number"
                    value={r.price}
                    onChange={(e) => updateRow(i, "price", e.target.value)}
                    style={{ width: "100px", padding: 6, border: "1px solid #ddd", borderRadius: 4 }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    type="number"
                    value={r.gst}
                    onChange={(e) => updateRow(i, "gst", e.target.value)}
                    style={{ width: "80px", padding: 6, border: "1px solid #ddd", borderRadius: 4 }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <input 
                    type="text" 
                    value={r.total} 
                    readOnly 
                    style={{ width: "100px", padding: 6, border: "1px solid #ddd", borderRadius: 4, background: "#f5f5f5" }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Autocomplete List */}
      <datalist id="items-list">
        {itemsList.map((i, index) => (
          <option key={index} value={i} />
        ))}
      </datalist>

      {/* Add Row */}
      <button 
        onClick={addRow} 
        style={{ 
          marginTop: 20, 
          padding: "10px 16px", 
          borderRadius: 8, 
          background: "#e0e0e0", 
          border: "none", 
          cursor: "pointer",
          fontWeight: 600
        }}
      >
        ➕ Add Row
      </button>

      {/* Submit */}
      <div style={{ marginTop: 30 }}>
        <button 
          onClick={submitManualInvoice} 
          disabled={loading}
          style={{ 
            padding: "12px 24px", 
            borderRadius: 8, 
            background: "linear-gradient(180deg,#2b84d8,#256fb8)", 
            color: "#fff", 
            border: "none", 
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 16
          }}
        >
          {loading ? "Submitting..." : "Submit Invoice"}
        </button>
      </div>

      {/* Message */}
      {message && (
        <p style={{ marginTop: 20, fontWeight: "bold", padding: 12, borderRadius: 8, background: message.includes("✅") ? "#d4edda" : "#f8d7da" }}>{message}</p>
      )}
    </div>
  );
}
