import { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_DASHBOARD_API;
const USER_EMAIL = import.meta.env.VITE_DASHBOARD_USER;
const UPLOAD_API = import.meta.env.VITE_UPLOAD_API;

export default function UploadInvoice() {
  const [branches, setBranches] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [branch, setBranch] = useState("");
  const [vendor, setVendor] = useState("");
  const [newVendor, setNewVendor] = useState("");

  const [orderNumber, setOrderNumber] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  useEffect(() => {
    loadBranches();
    loadVendors();
  }, []);

  async function loadBranches() {
    try {
      const res = await axios.get(`${API_BASE}?mode=branches&user_email=${USER_EMAIL}`);
      setBranches(res.data.branches || []);
    } catch {}
  }

  async function loadVendors() {
    try {
      const res = await axios.get(`${API_BASE}?mode=vendors&user_email=${USER_EMAIL}`);
      setVendors(res.data.vendors || []);
    } catch {}
  }

  function detectFileType(name) {
    if (!name) return "unknown";
    const ext = name.split(".").pop().toLowerCase();

    if (ext === "xlsx") return "excel";
    if (ext === "pdf") return "pdf";
    if (["jpg", "jpeg", "png"].includes(ext)) return "image";
    if (ext === "json") return "json";

    return "unknown";
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadInvoice() {
    if (!file) return alert("Please select a file");
    if (!branch || !targetDate || !orderNumber)
      return alert("Please fill Branch, Target Date, and Order Number");

    let vendorToSubmit = vendor;
    if (vendor === "__new__") {
      if (!newVendor.trim()) return alert("Enter new vendor name");
      vendorToSubmit = newVendor.trim();
    }

    try {
      setLoading(true);
      setResponse(null);

      const base64 = await fileToBase64(file);
      const fileType = detectFileType(file.name);

      const payload = {
        file_type: fileType,
        file_name: file.name,
        file_content: base64,
        user_email: USER_EMAIL,
        branch_name: branch,
        vendor_name: vendorToSubmit,
        target_date: targetDate,
        order_number: orderNumber
      };

      const res = await axios.post(UPLOAD_API, payload);
      setResponse(res.data);
    } catch (err) {
      console.error(err);
      setResponse({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="costing-module" style={{ padding: 20, maxWidth: 900, margin: "auto" }}>
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
        <h2 style={{ margin: 0 }}>📤 Upload Invoice (Excel / PDF / Image / JSON)</h2>
      </div>

      {/* Branch + Vendor */}
      <div style={{ display: "flex", gap: 20, marginTop: 20, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Branch</label>
          <select 
            value={branch} 
            onChange={(e) => setBranch(e.target.value)}
            style={{ padding: 8, minWidth: 180, borderRadius: 6, border: "1px solid #ccc" }}
          >
            <option value="">Select Branch</option>
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Vendor</label>
          <select 
            value={vendor} 
            onChange={(e) => setVendor(e.target.value)}
            style={{ padding: 8, minWidth: 180, borderRadius: 6, border: "1px solid #ccc" }}
          >
            <option value="">Select Vendor</option>
            {vendors.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
            <option value="__new__">➕ Add New Vendor</option>
          </select>

          {vendor === "__new__" && (
            <input
              type="text"
              placeholder="New vendor name"
              value={newVendor}
              onChange={(e) => setNewVendor(e.target.value)}
              style={{ marginTop: 6, padding: 8, borderRadius: 6, border: "1px solid #ccc", width: "100%" }}
            />
          )}
        </div>
      </div>

      {/* Order No + Date */}
      <div style={{ display: "flex", gap: 20, marginTop: 20, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Order Number</label>
          <input
            type="text"
            placeholder="e.g. ZHPTG26-OR-0021691734"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", minWidth: 250 }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Target Delivery Date</label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>
      </div>

      {/* File Input */}
      <div style={{ marginTop: 20 }}>
        <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Select Invoice File</label>
        <input
          type="file"
          accept=".xlsx,.pdf,.jpg,.jpeg,.png,.json"
          onChange={(e) => setFile(e.target.files[0])}
          style={{ padding: 8 }}
        />
        <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
          Supports: Excel, PDF, JPG, PNG, JSON
        </p>
      </div>

      <button
        onClick={uploadInvoice}
        disabled={loading}
        style={{
          marginTop: 20,
          padding: "12px 24px",
          borderRadius: 8,
          background: "linear-gradient(180deg,#2b84d8,#256fb8)",
          color: "white",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          fontWeight: 600,
          fontSize: 16
        }}
      >
        {loading ? "Uploading…" : "Upload & Process"}
      </button>

      {/* API Response */}
      {response && (
        <div style={{ marginTop: 20, background: "#f5f5f5", padding: 16, borderRadius: 8 }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Response:</h4>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(response, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
