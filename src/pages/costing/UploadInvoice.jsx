import { useState, useEffect, useRef } from "react";
import axios from "axios";
import flatpickr from 'flatpickr';

const API_BASE = import.meta.env.VITE_DASHBOARD_API;
const USER_EMAIL = import.meta.env.VITE_DASHBOARD_USER;
const UPLOAD_API = import.meta.env.VITE_UPLOAD_API;

export default function UploadInvoice() {
  const [branches, setBranches] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [branch, setBranch] = useState("");
  const [vendor, setVendor] = useState("");
  const [newVendor, setNewVendor] = useState("");
  const [newBranch, setNewBranch] = useState("");

  const [orderNumber, setOrderNumber] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  const datePickerRef = useRef(null);

  useEffect(() => {
    loadBranches();
  }, []);

  // Initialize flatpickr for target date
  useEffect(() => {
    const dateInput = document.getElementById('targetDatePicker');
    if (dateInput && !datePickerRef.current) {
      datePickerRef.current = flatpickr(dateInput, {
        dateFormat: 'Y-m-d',
        onChange: (selectedDates) => {
          if (selectedDates.length > 0) {
            const pad = (num) => String(num).padStart(2, '0');
            const date = selectedDates[0];
            const formatted = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
            setTargetDate(formatted);
          }
        }
      });
    }
    return () => {
      if (datePickerRef.current) {
        datePickerRef.current.destroy();
        datePickerRef.current = null;
      }
    };
  }, []);

  // Load vendors when branch is selected
  useEffect(() => {
    if (branch) {
      loadVendors(branch);
    } else {
      setVendors([]);
      setVendor("");
    }
  }, [branch]);

  async function loadBranches() {
    try {
      const res = await axios.get(`${API_BASE}?mode=branches&user_email=${USER_EMAIL}`);
      setBranches(res.data.branches || []);
    } catch { }
  }

  async function loadVendors(branchName) {
    try {
      const res = await axios.get(`${API_BASE}?mode=vendors&user_email=${USER_EMAIL}&branch=${encodeURIComponent(branchName)}`);
      setVendors(res.data.vendors || []);
    } catch {
      setVendors([]);
    }
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
      return alert("Please fill all required fields: Branch, Target Date, and Invoice ID");

    let branchToSubmit = branch;
    if (branch === "__new__") {
      if (!newBranch.trim()) return alert("Enter new branch name");
      branchToSubmit = newBranch.trim();
    }

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
        branch_name: branchToSubmit,
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
    <div className="upload-invoice-page" style={{
      padding: "32px",
      maxWidth: 900,
      margin: "auto",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)"
    }}>
      {/* Header Card */}
      <div style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        borderRadius: 20,
        padding: "28px 32px",
        marginBottom: 28,
        boxShadow: "0 10px 40px rgba(102, 126, 234, 0.3)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "rgba(255,255,255,0.2)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            fontWeight: 700,
            color: "#fff"
          }}>
            ↑
          </div>
          <div>
            <h2 style={{ margin: 0, color: "#fff", fontSize: 24, fontWeight: 700 }}>
              Upload Invoice
            </h2>
            <p style={{ margin: "4px 0 0 0", color: "rgba(255,255,255,0.9)", fontSize: 14 }}>
              Excel • PDF • Image • JSON supported
            </p>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div style={{
        background: "#fff",
        borderRadius: 20,
        padding: 28,
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        marginBottom: 24
      }}>
        {/* Form Fields */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 20
        }}>
          {/* Branch */}
          <div>
            <label style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 600,
              color: "#374151",
              fontSize: 14
            }}>
              Branch
            </label>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "2px solid #e5e7eb",
                fontSize: 14,
                background: "#f9fafb",
                cursor: "pointer",
                transition: "all 0.2s",
                outline: "none"
              }}
              onFocus={(e) => e.target.style.borderColor = "#667eea"}
              onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
            >
              <option value="">Select Branch</option>
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
              <option value="__new__">+ Add New Branch</option>
            </select>
            {branch === "__new__" && (
              <input
                type="text"
                placeholder="Enter branch name"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                style={{
                  marginTop: 10,
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "2px solid #e5e7eb",
                  fontSize: 14,
                  background: "#f9fafb",
                  outline: "none"
                }}
              />
            )}
          </div>

          {/* Vendor */}
          <div>
            <label style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 600,
              color: "#374151",
              fontSize: 14
            }}>
              Vendor
            </label>
            <select
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "2px solid #e5e7eb",
                fontSize: 14,
                background: "#f9fafb",
                cursor: "pointer",
                transition: "all 0.2s",
                outline: "none"
              }}
              onFocus={(e) => e.target.style.borderColor = "#667eea"}
              onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
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
                placeholder="Enter new vendor name"
                value={newVendor}
                onChange={(e) => setNewVendor(e.target.value)}
                style={{
                  marginTop: 10,
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "2px solid #e5e7eb",
                  fontSize: 14,
                  background: "#f9fafb",
                  outline: "none"
                }}
              />
            )}
          </div>
        </div>

        {/* Order Number + Date */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 20,
          marginTop: 20
        }}>
          <div>
            <label style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 600,
              color: "#374151",
              fontSize: 14
            }}>
              Invoice ID / Order Number <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. ZHPTG26-OR-0021691734 or INV-2024-001"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "2px solid #e5e7eb",
                fontSize: 14,
                background: "#f9fafb",
                outline: "none",
                transition: "border-color 0.2s"
              }}
              onFocus={(e) => e.target.style.borderColor = "#667eea"}
              onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
            />
            <p style={{
              margin: "6px 0 0 0",
              fontSize: 12,
              color: "#6b7280",
              fontStyle: "italic"
            }}>
              Unique identifier for this invoice (required for tracking)
            </p>
          </div>

          <div>
            <label style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 600,
              color: "#374151",
              fontSize: 14
            }}>
              Target Delivery Date
            </label>
            <input
              id="targetDatePicker"
              type="text"
              value={targetDate}
              placeholder="Select date"
              readOnly
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "2px solid #e5e7eb",
                fontSize: 14,
                background: "#f9fafb",
                cursor: "pointer",
                outline: "none"
              }}
            />
          </div>
        </div>
      </div>

      {/* File Upload Card */}
      <div style={{
        background: "#fff",
        borderRadius: 20,
        padding: 28,
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        marginBottom: 24
      }}>
        <h3 style={{ margin: "0 0 20px 0", color: "#1f2937", fontSize: 18, fontWeight: 600 }}>
          Select Invoice File
        </h3>

        {/* Drop Zone */}
        <div
          style={{
            border: "3px dashed #d1d5db",
            borderRadius: 16,
            padding: "40px 24px",
            textAlign: "center",
            background: file ? "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)" : "#f9fafb",
            transition: "all 0.3s",
            cursor: "pointer"
          }}
          onClick={() => document.getElementById("file-input").click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = "#667eea";
            e.currentTarget.style.background = "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)";
          }}
          onDragLeave={(e) => {
            e.currentTarget.style.borderColor = "#d1d5db";
            e.currentTarget.style.background = file ? "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)" : "#f9fafb";
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = "#d1d5db";
            if (e.dataTransfer.files[0]) {
              setFile(e.dataTransfer.files[0]);
            }
          }}
        >
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.pdf,.jpg,.jpeg,.png,.json"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ display: "none" }}
          />

          {file ? (
            <div>
              <div style={{ fontSize: 32, marginBottom: 12, fontWeight: 600, color: "#065f46" }}>✓</div>
              <p style={{ margin: 0, fontWeight: 600, color: "#065f46", fontSize: 16 }}>
                {file.name}
              </p>
              <p style={{ margin: "8px 0 0 0", color: "#047857", fontSize: 13 }}>
                {(file.size / 1024).toFixed(1)} KB • Click to change
              </p>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 32, marginBottom: 12, fontWeight: 600, color: "#6b7280" }}>↑</div>
              <p style={{ margin: 0, fontWeight: 600, color: "#374151", fontSize: 16 }}>
                Click to upload or drag & drop
              </p>
              <p style={{ margin: "8px 0 0 0", color: "#6b7280", fontSize: 13 }}>
                Supports: Excel (.xlsx), PDF, Images (JPG, PNG), JSON
              </p>
            </div>
          )}
        </div>

        {/* Upload Button */}
        <button
          onClick={uploadInvoice}
          disabled={loading}
          style={{
            marginTop: 24,
            width: "100%",
            padding: "16px 32px",
            borderRadius: 14,
            background: loading
              ? "#9ca3af"
              : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            boxShadow: loading ? "none" : "0 6px 20px rgba(102, 126, 234, 0.4)",
            transition: "transform 0.2s, box-shadow 0.2s"
          }}
          onMouseOver={(e) => {
            if (!loading) {
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 10px 30px rgba(102, 126, 234, 0.5)";
            }
          }}
          onMouseOut={(e) => {
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = loading ? "none" : "0 6px 20px rgba(102, 126, 234, 0.4)";
          }}
        >
          {loading ? "Processing..." : "Upload & Process"}
        </button>
      </div>

      {/* API Response */}
      {response && (
        <div style={{
          background: response.error
            ? "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)"
            : "#fff",
          padding: 24,
          borderRadius: 20,
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)"
        }}>
          <h4 style={{
            margin: "0 0 16px 0",
            color: response.error ? "#991b1b" : "#1f2937",
            fontSize: 16,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8
          }}>
            {response.error ? "Error" : "Response"}
          </h4>
          <pre style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: response.error ? "rgba(255,255,255,0.5)" : "#f9fafb",
            padding: 16,
            borderRadius: 12,
            fontSize: 13,
            color: "#374151",
            maxHeight: 300,
            overflow: "auto"
          }}>
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
