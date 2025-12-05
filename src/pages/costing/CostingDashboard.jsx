import React, { useEffect, useMemo, useState, useRef } from "react";
import { Chart, ArcElement, Tooltip, Legend } from "chart.js";
import { Pie } from "react-chartjs-2";
import RistaInventorySection from "../../components/Costing/RistaInventorySection";
import flatpickr from 'flatpickr';
Chart.register(ArcElement, Tooltip, Legend);

/**
 * CostingDashboard.jsx
 *
 * - Redesigned React version of your costing-dashboard.html
 * - Feature parity with original HTML (fetch data, branches, pie chart,
 *   expand categories to show subcategories/items, refunds modal, CSV download)
 *
 * Integration-friendly:
 * - Accepts apiBase and userEmail from environment or props
 * - Self-contained component (no global DOM manipulation)
 */

const DEFAULT_API_BASE = import.meta.env.VITE_DASHBOARD_API || "";
const DEFAULT_USER = import.meta.env.VITE_DASHBOARD_USER || "";

function money(v) {
  return `₹${Number(v || 0).toFixed(2)}`;
}

function safeId(name = "") {
  return name.replace(/\s+/g, "_").replace(/[^\w-]/g, "");
}

// Flatten and aggregate subcategory items to a simple table-friendly structure
function aggregateItems(items = []) {
  const aggregated = {};
  for (const item of items) {
    const desc = (item["Description"] || "Unknown").trim();
    const qtyRaw = item["Qty"] || "";
    const qtyMatch = String(qtyRaw).match(/[\d.]+/);
    const qty = qtyMatch ? parseFloat(qtyMatch[0]) : 0;
    const price = parseFloat(item["Price/Unit"]) || 0;
    const gst = parseFloat(String(item["Gst Amt %"] || "").replace("%", "")) || 0;
    const total = parseFloat(item["Total Price(in Rs.)"]) || 0;

    if (!aggregated[desc]) {
      aggregated[desc] = { total_qty: 0, total_value: 0, price_sum: 0, gst_sum: 0, count: 0 };
    }
    aggregated[desc].total_qty += qty;
    aggregated[desc].total_value += total;
    aggregated[desc].price_sum += price;
    aggregated[desc].gst_sum += gst;
    aggregated[desc].count += 1;
  }
  return aggregated;
}

export default function CostingDashboard({ apiBase = DEFAULT_API_BASE, userEmail = DEFAULT_USER }) {
  const API_BASE = apiBase || DEFAULT_API_BASE;
  const USER_EMAIL = userEmail || DEFAULT_USER;

  // Add spinner keyframes style
  const spinnerStyle = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;

  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState("All");
  const [vendors, setVendors] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState("All");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [error, setError] = useState(null);

  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundFilter, setRefundFilter] = useState("");
  const refundContentRef = useRef(null);
  const datePickerRef = useRef(null);

  // Initialize flatpickr date range picker
  useEffect(() => {
    const dateInput = document.getElementById('costingDateRange');
    if (dateInput && !datePickerRef.current) {
      datePickerRef.current = flatpickr(dateInput, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        onChange: (selectedDates) => {
          if (selectedDates.length === 2) {
            const pad = (num) => String(num).padStart(2, '0');
            const format = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
            setStartDate(format(selectedDates[0]));
            setEndDate(format(selectedDates[1]));
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

  useEffect(() => {
    async function loadBranches() {
      if (!API_BASE || !USER_EMAIL) return;
      try {
        const res = await fetch(`${API_BASE}?mode=branches&user_email=${encodeURIComponent(USER_EMAIL)}`);
        const data = await res.json();
        setBranches(data.branches || []);
      } catch (err) {
        console.error("Failed to load branches", err);
      }
    }
    loadBranches();
  }, [API_BASE, USER_EMAIL]);

  async function loadVendors() {
    try {
      const res = await fetch(
        `${API_BASE}?mode=vendors&user_email=${encodeURIComponent(USER_EMAIL)}`
      );
      const data = await res.json();
      setVendors(["All", ...(data.vendors || [])]);
    } catch (err) {
      console.error("Failed to load vendors", err);
    }
  }

  async function fetchData() {
    setError(null);
    if (!startDate || !endDate) {
      setError("Please select both start and end dates.");
      return;
    }
    if (!API_BASE || !USER_EMAIL) {
      setError("API base or user email not configured.");
      return;
    }

    setLoading(true);
    try {
      await loadVendors();

      const url = `${API_BASE}?user_email=${encodeURIComponent(USER_EMAIL)}&start=${startDate}&end=${endDate}&branch=${encodeURIComponent(branch)}&vendor=${encodeURIComponent(selectedVendor)}`;

      const res = await fetch(url);
      const data = await res.json();
      if (!data || data.count === 0) {
        setDashboardData(null);
      } else {
        setDashboardData(data);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    if (!dashboardData) {
      alert("No data to download");
      return;
    }
    const rows = [];
    for (const [cat, subs] of Object.entries(dashboardData.categorized || {})) {
      for (const [sub, subData] of Object.entries(subs)) {
        const items = subData.items || subData;
        for (const it of items) {
          rows.push({
            Category: cat,
            Subcategory: sub,
            "Product No.": it["Product No."] || "",
            Description: it["Description"] || "",
            Qty: it["Qty"] || "",
            "Price/Unit": it["Price/Unit"] || "",
            "Gst Amt %": it["Gst Amt %"] || "",
            "Total Price(in Rs.)": it["Total Price(in Rs.)"] || ""
          });
        }
      }
    }

    const keys = ["Category", "Subcategory", "Product No.", "Description", "Qty", "Price/Unit", "Gst Amt %", "Total Price(in Rs.)"];
    const csv = [keys.join(",")].concat(rows.map(r => keys.map(k => `"${String(r[k] || "").replace(/"/g, '""')}"`).join(","))).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `costing_export_${startDate || "all"}_${endDate || "all"}.csv`;
    link.click();
  }

  const chartData = useMemo(() => {
    if (!dashboardData) return { labels: [], datasets: [] };
    const categoryTotals = dashboardData.category_totals || {};
    const labels = Object.keys(categoryTotals);
    const values = Object.values(categoryTotals).map(v => v.total_value || 0);
    const palette = ["#3B5BA5", "#E48B3D", "#6EA6B4", "#7A83C0", "#95C8D8", "#A0BFD6", "#C7E0EB", "#FFB366", "#F28A8A", "#8ACAA8"];
    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: labels.map((_, i) => palette[i % palette.length]),
          borderWidth: 0
        }
      ]
    };
  }, [dashboardData]);

  const [expandedCats, setExpandedCats] = useState({});
  function toggleCategory(catName) {
    setExpandedCats(prev => ({ ...prev, [catName]: !prev[catName] }));
  }

  function renderSubcategory(catName) {
    if (!dashboardData) return null;
    const subcats = dashboardData.categorized?.[catName] || {};
    return Object.entries(subcats).map(([subcat, subData]) => {
      const items = subData.items || subData;
      const aggregated = aggregateItems(items);
      return (
        <div key={subcat} style={{ marginBottom: 18, background: "#f8fafc", padding: 14, borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <h4 style={{ marginTop: 0, fontSize: 14, color: "#1e293b", fontWeight: 600, marginBottom: 12 }}>{subcat}</h4>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#1e293b", color: "#fff" }}>
                  <th style={{ padding: 8 }}>Description</th>
                  <th style={{ padding: 8 }}>Total Qty</th>
                  <th style={{ padding: 8 }}>Avg Price/Unit</th>
                  <th style={{ padding: 8 }}>Avg GST %</th>
                  <th style={{ padding: 8 }}>Total Price (₹)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(aggregated).map(([desc, vals]) => {
                  const avgPrice = vals.price_sum / vals.count || 0;
                  const avgGst = vals.gst_sum / vals.count || 0;
                  return (
                    <tr key={desc}>
                      <td style={{ padding: 8 }}>{desc}</td>
                      <td style={{ padding: 8 }}>{(vals.total_qty || 0).toFixed(2)}</td>
                      <td style={{ padding: 8 }}>{avgPrice.toFixed(2)}</td>
                      <td style={{ padding: 8 }}>{avgGst.toFixed(2)}%</td>
                      <td style={{ padding: 8 }}>{money(vals.total_value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    });
  }

  const refundsToShow = useMemo(() => {
    if (!dashboardData) return [];
    const refunds = dashboardData.refund_details || [];
    const filter = (refundFilter || "").toLowerCase();
    return refunds
      .filter(r => (r.total_refund || 0) > 0 && (refundFilter === "" ||
        (r.invoice_id || "").toLowerCase().includes(filter) ||
        (r.refunds || []).some(it => (it.Description || "").toLowerCase().includes(filter))
      ));
  }, [dashboardData, refundFilter]);

  return (
    <div className="costing-module" style={{ padding: 20 }}>
      <style>{spinnerStyle}</style>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", fontWeight: 700, color: "#fff", fontSize: 16 }}>CD</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: "#1e293b" }}>Costing Dashboard</h1>
            <div style={{ color: "#64748b", fontSize: 13 }}>Invoice analysis and expense tracking</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", background: "#fff", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0", flexWrap: "wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>Branch</label>
              <select value={branch} onChange={e => setBranch(e.target.value)} style={{ padding: "8px 12px", minWidth: 180, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}>
                <option value="All">All Branches</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>Vendor</label>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                style={{ padding: "8px 12px", minWidth: 180, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
              >
                {vendors.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>Date Range</label>
                <input
                  type="text"
                  id="costingDateRange"
                  placeholder="Select date range"
                  readOnly
                  style={{
                    padding: '8px 12px',
                    minWidth: 200,
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    cursor: 'pointer',
                    backgroundColor: '#fff'
                  }}
                />
              </div>
            </div>

          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={fetchData} disabled={loading} style={{ background: loading ? "#94a3b8" : "#3b82f6", color: "#fff", padding: "10px 18px", borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer", fontWeight: 500, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              {loading && <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 1s linear infinite" }}></span>}
              {loading ? "Fetching..." : "Fetch Data"}
            </button>
            <button onClick={downloadCSV} style={{ background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "10px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 500, fontSize: 14 }}>Download CSV</button>
          </div>
        </div>
      </header>

      {error && <div style={{ color: "#dc2626", marginTop: 12, padding: "12px 16px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 20, marginTop: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Branch</div>
                <div style={{ fontWeight: 700, color: "#1e293b", marginTop: 6, fontSize: 16 }} id="branchDisplay">{branch}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Summary</div>
                <div style={{ fontWeight: 700, color: "#1e293b", marginTop: 6, fontSize: 16 }}>{Object.keys(dashboardData?.category_totals || {}).length} categories</div>
              </div>
            </div>
          </div>

          <div style={{ background: "#fff", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h2 style={{ marginTop: 0, fontSize: 18, color: "#1e293b", fontWeight: 600 }}>Category Summary</h2>
            {!dashboardData && <p style={{ color: "#64748b" }}>No data loaded. Please select a date range and click Fetch Data.</p>}
            {dashboardData && Object.entries(dashboardData.category_totals || {}).map(([cat, summary], idx) => {
              const percent = (dashboardData.grand_total ? ((summary.total_value / dashboardData.grand_total) * 100).toFixed(1) : 0);
              const color = (chartData.datasets[0]?.backgroundColor || [])[idx % 10] || "#2ecc71";
              return (
                <div key={cat} style={{ marginBottom: 12 }}>
                  <div
                    onClick={() => toggleCategory(cat)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14, borderRadius: 10, cursor: "pointer", background: "#f8fafc", borderLeft: `4px solid ${color}`, border: "1px solid #e2e8f0", transition: "background 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "#f8fafc"}
                  >
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15, color: "#1e293b", fontWeight: 600 }}>{cat}</h3>
                      <div style={{ marginTop: 6, fontSize: 13, color: "#64748b" }}>Total Qty: {Number(summary.total_qty || 0).toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 15 }}>₹{Number(summary.total_value || 0).toFixed(2)}</div>
                      <div style={{ fontSize: 12, marginTop: 6, color: "#64748b" }}>({percent}%)</div>
                    </div>
                  </div>

                  {expandedCats[cat] && (
                    <div style={{ marginTop: 12 }}>
                      {renderSubcategory(cat)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ background: "#fff", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ marginTop: 0, fontSize: 16, color: "#1e293b", fontWeight: 600 }}>Details</h3>
            <div id="results">
              {!dashboardData && <p style={{ color: "#64748b", margin: 0 }}>No results</p>}
              {dashboardData && <p style={{ color: "#64748b", margin: 0 }}>Showing {dashboardData.count} invoices across {dashboardData.branch || "All branches"}</p>}
            </div>
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ margin: 0, marginBottom: 12, textAlign: "center", fontSize: 16, color: "#1e293b", fontWeight: 600 }}>Category Spend Distribution</h3>
            <div style={{ maxWidth: 360, margin: "0 auto", height: 300 }}>
              <Pie data={chartData} options={{ plugins: { legend: { position: "bottom" } }, maintainAspectRatio: false }} />
            </div>
          </div>

          <div style={{ background: "#fff", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, padding: 14, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>Gross Total</div>
                <div style={{ fontWeight: 700, color: "#1e293b", marginTop: 8, fontSize: 18 }}>{money(dashboardData?.grand_total || 0)}</div>
              </div>
              <div style={{ flex: 1, padding: 14, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", cursor: "pointer" }} onClick={() => setRefundModalOpen(true)}>
                <div style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>Total Refunds</div>
                <div style={{ fontWeight: 700, color: "#dc2626", marginTop: 8, fontSize: 18 }}>{money(dashboardData?.refund_total || 0)}</div>
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <div style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>Net Total</div>
              <div style={{ fontWeight: 700, color: "#16a34a", marginTop: 8, fontSize: 18 }}>{money(dashboardData?.net_total ?? dashboardData?.grand_total ?? 0)}</div>
            </div>
          </div>
        </aside>
      </div>

      {/* Rista Inventory Section */}
      <RistaInventorySection />

      {refundModalOpen && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1200 }}>
          <div style={{ width: "100%", maxWidth: 1000, borderRadius: 12, background: "#fff", padding: 24, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: "#1e293b", fontWeight: 600 }}>Refund Details</h2>
              <button onClick={() => setRefundModalOpen(false)} style={{ fontSize: 24, fontWeight: 600, color: "#64748b", background: "transparent", border: "none", cursor: "pointer", lineHeight: 1, padding: 4 }} onMouseEnter={(e) => e.target.style.color = "#dc2626"} onMouseLeave={(e) => e.target.style.color = "#64748b"}>&times;</button>
            </div>

            <div>
              <input placeholder="Search by invoice ID or item name..." value={refundFilter} onChange={e => setRefundFilter(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }} />
            </div>

            <div style={{ marginTop: 16, maxHeight: 420, overflowY: "auto" }}>
              {refundsToShow.length === 0 && <p style={{ color: "#64748b" }}>No refund details available.</p>}
              {refundsToShow.map((refund) => (
                <div key={refund.invoice_id || Math.random()} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 14, background: "#f8fafc" }}>
                  <h3 style={{ margin: "0 0 8px 0", fontSize: 15, color: "#1e293b", fontWeight: 600 }}>Invoice: {refund.invoice_id || "Unknown"} ({refund.branch || "Branch"})</h3>
                  <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}><b>Total Refund:</b> {money(refund.total_refund || 0)}</p>

                  <div style={{ marginTop: 10 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 6, overflow: "hidden" }}>
                      <thead>
                        <tr style={{ background: "#1e293b", color: "#fff" }}>
                          <th style={{ padding: 8 }}>Product No.</th>
                          <th style={{ padding: 8 }}>Description</th>
                          <th style={{ padding: 8 }}>Qty Ordered</th>
                          <th style={{ padding: 8 }}>Qty Delivered</th>
                          <th style={{ padding: 8 }}>Refund Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(refund.refunds || []).map((it, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: 8 }}>{it["Product No."] || "-"}</td>
                            <td style={{ padding: 8 }}>{it["Description"] || "-"}</td>
                            <td style={{ padding: 8 }}>{it["Qty Ordered"] || "-"}</td>
                            <td style={{ padding: 8 }}>{it["Qty Delivered"] || "-"}</td>
                            <td style={{ padding: 8 }}>{money(it["Refund Amount"] || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
