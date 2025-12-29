import { useState, useEffect, useRef } from "react";
import axios from "axios";
import invoiceItemsData from "../../data/invoiceItems.json";
import flatpickr from 'flatpickr';
import StyledDropdown from '../../components/StyledDropdown';
import SearchableDropdown from '../../components/SearchableDropdown';

const API_BASE = import.meta.env.VITE_DASHBOARD_API;
const USER_EMAIL = import.meta.env.VITE_DASHBOARD_USER;
const UPLOAD_API = import.meta.env.VITE_UPLOAD_API;
const ITEMS_API = import.meta.env.VITE_ITEMS_API;

// Default unit of measurement options
const DEFAULT_UOM_OPTIONS = ["kg", "liter", "pcs", "gm", "ml", "dozen", "box", "packet"];

// Local storage key for custom items
const CUSTOM_ITEMS_KEY = "manual_entry_custom_items";

// Categories structure for new item modal
const CATEGORIES = {
  "Dairy": ["Paneer", "Milk", "Curd_Yogurt", "Butter", "Cheese", "Tofu", "Ghee"],
  "Poultry": ["Eggs", "Chicken"],
  "Vegetables": ["Capsicum", "Tomato", "Coriander", "Lettuce", "Mushroom", "Garlic", "Ginger", "Onion", "Potato", "Broccoli", "Chilli", "Carrot", "Beans", "Cucumber", "Pumpkin", "Beetroot", "Okra", "Leafy Vegs", "Others"],
  "Fruits": ["Banana", "Papaya", "Watermelon", "Pineapple", "Pomegranate", "Mango", "Apple", "Kiwi", "Melon", "Guava", "Lemon"],
  "Dry Store": ["Rice", "Flour", "Pulses", "Millets", "Oats", "Spices", "Seasoning", "Dry Fruits", "Nuts_Seeds", "Sauces_Dressings", "Jams_Spreads", "Pastes", "Essentials", "Soya", "Beverages", "Bakery", "Seafood", "Oils", "Frozen"],
  "Packaging": ["Containers", "Cutlery", "Bags", "Tapes_Foils", "Paper_Wrapping"],
  "Housekeeping": ["Cleaners", "Tools", "Waste_Disposal", "Personal_Protection", "Paper_Products"],
  "Misc": ["Delivery", "Service", "Other"]
};

export default function ManualEntry() {
  const [branches, setBranches] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [uomOptions, setUomOptions] = useState(DEFAULT_UOM_OPTIONS);

  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceId, setInvoiceId] = useState("");

  const [rows, setRows] = useState([
    { description: "", uom: "", customUom: "", qty: "", price: "", gst: "", total: "" },
  ]);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // New Item Modal State
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [newItemData, setNewItemData] = useState({
    name: "",
    category: "",
    subcategory: "",
    defaultUom: "kg"
  });
  const [newItemRowIndex, setNewItemRowIndex] = useState(null);
  const [savingNewItem, setSavingNewItem] = useState(false);

  // Manage Items Modal State
  const [showManageItemsModal, setShowManageItemsModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemFilter, setItemFilter] = useState("");
  const [deletingItem, setDeletingItem] = useState(null);

  const datePickerRef = useRef(null);

  useEffect(() => {
    loadBranches();
    loadItems();
  }, []);

  // Initialize flatpickr for invoice date
  useEffect(() => {
    const dateInput = document.getElementById('invoiceDatePicker');
    if (dateInput && !datePickerRef.current) {
      datePickerRef.current = flatpickr(dateInput, {
        dateFormat: 'Y-m-d',
        onChange: (selectedDates) => {
          if (selectedDates.length > 0) {
            const pad = (num) => String(num).padStart(2, '0');
            const date = selectedDates[0];
            const formatted = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
            setInvoiceDate(formatted);
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
    if (selectedBranch) {
      loadVendors(selectedBranch);
    } else {
      setVendors([]);
      setSelectedVendor("");
    }
  }, [selectedBranch]);

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

  async function loadVendors(branch) {
    try {
      const res = await axios.get(
        `${API_BASE}?mode=vendors&user_email=${USER_EMAIL}&branch=${encodeURIComponent(branch)}`
      );
      setVendors(res.data.vendors || []);
    } catch (err) {
      console.log("Failed to load vendors");
      setVendors([]);
    }
  }

  async function loadItems() {
    try {
      // Try loading from DynamoDB API first
      if (ITEMS_API) {
        const res = await axios.get(`${ITEMS_API}?mode=items`);
        if (res.data.items && res.data.items.length > 0) {
          setItemsList(res.data.items);
          console.log(`✅ Loaded ${res.data.items.length} items from DynamoDB`);
          return;
        }
      }
    } catch (err) {
      console.log("DynamoDB API not available, falling back to static data:", err.message);
    }

    // Fallback: Load items from static JSON file
    const staticItems = invoiceItemsData.items || [];

    // Load custom items from localStorage
    const customItems = JSON.parse(localStorage.getItem(CUSTOM_ITEMS_KEY) || "[]");

    // Merge and deduplicate by name
    const allItems = [...staticItems, ...customItems];
    const uniqueItems = allItems.filter((item, index, self) =>
      index === self.findIndex(i => i.name.toLowerCase() === item.name.toLowerCase())
    );

    setItemsList(uniqueItems);
  }

  async function addNewItemToDB(itemData) {
    try {
      setSavingNewItem(true);

      if (ITEMS_API) {
        const res = await axios.post(ITEMS_API, itemData);
        console.log("✅ Item saved to DynamoDB:", res.data);

        // Add to local state
        setItemsList(prev => [...prev, {
          name: itemData.name,
          category: itemData.category,
          subcategory: itemData.subcategory,
          defaultUom: itemData.defaultUom
        }]);

        return true;
      } else {
        // Fallback to localStorage if API not available
        addCustomItem(itemData.name, itemData.defaultUom, itemData.category, itemData.subcategory);
        return true;
      }
    } catch (err) {
      console.error("Failed to save item:", err);
      if (err.response?.status === 409) {
        setMessage("Item already exists in database");
      } else {
        // Fallback to localStorage
        addCustomItem(itemData.name, itemData.defaultUom, itemData.category, itemData.subcategory);
      }
      return false;
    } finally {
      setSavingNewItem(false);
    }
  }

  function addCustomItem(name, uom, category = null, subcategory = null) {
    if (!name.trim()) return;

    const trimmedName = name.trim();
    const existingIndex = itemsList.findIndex(item => item.name.toLowerCase() === trimmedName.toLowerCase());

    // If item exists and has a real category, skip
    if (existingIndex !== -1) {
      const existingItem = itemsList[existingIndex];
      // Update if existing item has placeholder category and we have a real one
      if (category && !["Custom", "Uncategorized", ""].includes(existingItem.category)) {
        return; // Already has a proper category, don't update
      }
      if (category && ["Custom", "Uncategorized", ""].includes(existingItem.category)) {
        // Update the existing item with the proper category
        const updatedItem = {
          ...existingItem,
          category: category,
          subcategory: subcategory || existingItem.subcategory || ""
        };

        // Update localStorage
        const customItems = JSON.parse(localStorage.getItem(CUSTOM_ITEMS_KEY) || "[]");
        const localIndex = customItems.findIndex(item => item.name.toLowerCase() === trimmedName.toLowerCase());
        if (localIndex !== -1) {
          customItems[localIndex] = updatedItem;
          localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(customItems));
        }

        // Update state
        setItemsList(prev => {
          const newList = [...prev];
          newList[existingIndex] = updatedItem;
          return newList;
        });
      }
      return;
    }

    // Create new item with provided category or default
    const newItem = {
      name: trimmedName,
      category: category || "Uncategorized",
      subcategory: subcategory || "",
      defaultUom: uom || "pcs"
    };

    // Get existing custom items from localStorage
    const customItems = JSON.parse(localStorage.getItem(CUSTOM_ITEMS_KEY) || "[]");
    customItems.push(newItem);
    localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(customItems));

    // Update state
    setItemsList(prev => [...prev, newItem]);
  }

  function getItemByName(name) {
    return itemsList.find(item => item.name.toLowerCase() === name.toLowerCase());
  }

  function checkForNewItem(index, value) {
    // Check if the entered item exists in the list
    if (!value.trim()) return;

    const exists = itemsList.some(item => item.name.toLowerCase() === value.toLowerCase());
    if (!exists) {
      // Show modal to add new item with category
      setNewItemData({
        name: value.trim(),
        category: "",
        subcategory: "",
        defaultUom: "kg"
      });
      setNewItemRowIndex(index);
      setShowNewItemModal(true);
    }
  }

  function handleNewItemSave() {
    if (!newItemData.name || !newItemData.category) {
      setMessage("Please select a category for the new item");
      return;
    }

    if (!newItemData.defaultUom.trim()) {
      setMessage("Please enter a unit of measurement");
      return;
    }

    // Save to DynamoDB
    addNewItemToDB(newItemData).then(success => {
      if (success) {
        // Update the row's UOM if set
        if (newItemRowIndex !== null) {
          const updated = [...rows];
          updated[newItemRowIndex].uom = newItemData.defaultUom;
          setRows(updated);
        }
        setShowNewItemModal(false);
        setNewItemData({ name: "", category: "", subcategory: "", defaultUom: "kg" });
        setNewItemRowIndex(null);
        setMessage("✅ New item added successfully!");
        setTimeout(() => setMessage(""), 3000);
      }
    });
  }

  function handleNewItemCancel() {
    setShowNewItemModal(false);
    setNewItemData({ name: "", category: "", subcategory: "", defaultUom: "kg" });
    setNewItemRowIndex(null);
  }

  async function deleteItemFromDB(itemName) {
    try {
      setDeletingItem(itemName);
      if (ITEMS_API) {
        await axios.delete(`${ITEMS_API}?item_name=${encodeURIComponent(itemName)}`);
      }
      // Remove from localStorage
      const customItems = JSON.parse(localStorage.getItem(CUSTOM_ITEMS_KEY) || "[]");
      const filtered = customItems.filter(item => item.name.toLowerCase() !== itemName.toLowerCase());
      localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(filtered));
      // Remove from state
      setItemsList(prev => prev.filter(item => item.name.toLowerCase() !== itemName.toLowerCase()));
      setMessage("✅ Item deleted successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Failed to delete item:", err);
      setMessage("❌ Failed to delete item");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setDeletingItem(null);
    }
  }

  async function updateItemInDB(itemName, updates) {
    try {
      setSavingNewItem(true);
      if (ITEMS_API) {
        await axios.put(ITEMS_API, { name: itemName, ...updates });
      }
      // Update localStorage
      const customItems = JSON.parse(localStorage.getItem(CUSTOM_ITEMS_KEY) || "[]");
      const idx = customItems.findIndex(item => item.name.toLowerCase() === itemName.toLowerCase());
      if (idx !== -1) {
        customItems[idx] = { ...customItems[idx], ...updates };
        localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(customItems));
      }
      // Update state
      setItemsList(prev => prev.map(item =>
        item.name.toLowerCase() === itemName.toLowerCase()
          ? { ...item, ...updates }
          : item
      ));
      setEditingItem(null);
      setMessage("✅ Item updated successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Failed to update item:", err);
      setMessage("❌ Failed to update item");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSavingNewItem(false);
    }
  }

  function addRow() {
    setRows([
      ...rows,
      { description: "", uom: "", customUom: "", qty: "", price: "", gst: "", total: "" },
    ]);
  }

  function deleteRow(index) {
    if (rows.length === 1) {
      // If only one row, just reset it instead of deleting
      setRows([{ description: "", uom: "", customUom: "", qty: "", price: "", gst: "", total: "" }]);
      return;
    }
    const updated = rows.filter((_, i) => i !== index);
    setRows(updated);
  }

  function updateRow(index, field, value) {
    const updated = [...rows];
    updated[index][field] = value;

    // When description changes, check if it matches an existing item and auto-set UOM
    if (field === "description") {
      const matchedItem = getItemByName(value);
      if (matchedItem && matchedItem.defaultUom) {
        updated[index].uom = matchedItem.defaultUom;
      }
    }

    // If user selects "other" for UOM and then enters a custom value, add it to options
    if (field === "customUom" && value.trim()) {
      const trimmedValue = value.trim().toLowerCase();
      if (!uomOptions.map(u => u.toLowerCase()).includes(trimmedValue)) {
        // Custom UOM will be used directly, optionally add to list for future use
      }
    }

    if (field === "qty" || field === "price") {
      const q = parseFloat(updated[index].qty || 0);
      const p = parseFloat(updated[index].price || 0);
      updated[index].total = (q * p).toFixed(2);
    }

    setRows(updated);
  }

  function getUomValue(row) {
    if (row.uom === "__other__") {
      return row.customUom?.trim() || "";
    }
    return row.uom || "";
  }

  // Calculate grand total of all items
  function calculateGrandTotal() {
    return rows.reduce((sum, row) => {
      const total = parseFloat(row.total) || 0;
      return sum + total;
    }, 0).toFixed(2);
  }

  async function submitManualInvoice() {
    if (!selectedBranch || !invoiceDate || !invoiceId.trim()) {
      setMessage("Please fill all required fields (Branch, Invoice Date, Invoice ID).");
      return;
    }

    let branchToSubmit = selectedBranch;
    if (selectedBranch === "__new__") {
      if (!newBranchName.trim()) {
        setMessage("Please enter branch name.");
        return;
      }
      branchToSubmit = newBranchName.trim();
    }

    let vendorToSubmit = selectedVendor;

    if (selectedVendor === "__new__") {
      if (!newVendorName.trim()) {
        setMessage("Please enter vendor name.");
        return;
      }
      vendorToSubmit = newVendorName.trim();
    }

    const formattedItems = rows.map((r, idx) => {
      const uomValue = getUomValue(r);
      const descriptionWithUom = uomValue
        ? `${r.description}, ${uomValue}`
        : r.description;

      return {
        "Product No.": `MANUAL-${idx + 1}`,
        Description: descriptionWithUom,
        Qty: r.qty,
        "Price/Unit": r.price,
        "Gst Amt %": r.gst,
        "Total Price(in Rs.)": r.total,
      };
    });

    const payload = {
      event_type: "invoice",
      user_email: USER_EMAIL,
      branch_name: branchToSubmit,
      vendor_name: vendorToSubmit,
      target_date: invoiceDate,
      order_number: invoiceId.trim(),
      items: formattedItems,
    };

    try {
      setLoading(true);
      setMessage("");

      // Save any new items to localStorage before submitting
      rows.forEach(r => {
        if (r.description.trim()) {
          const uomValue = r.uom === "__other__" ? r.customUom : r.uom;
          const existingItem = getItemByName(r.description.trim());
          addCustomItem(
            r.description.trim(),
            uomValue || "pcs",
            existingItem?.category || null,
            existingItem?.subcategory || null
          );
        }
      });

      await axios.post(UPLOAD_API, payload);

      setMessage("Manual invoice submitted successfully!");
      setRows([{ description: "", uom: "", uomQty: "", customUom: "", qty: "", price: "", gst: "", total: "" }]);
      setNewVendorName("");
      setInvoiceId("");
    } catch (err) {
      console.error(err);
      setMessage("Failed to submit manual invoice.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="manual-entry-page" style={{
      padding: "32px",
      maxWidth: 1100,
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
            fontSize: 28,
            fontWeight: 700,
            color: "#fff"
          }}>
            ✎
          </div>
          <div>
            <h2 style={{ margin: 0, color: "#fff", fontSize: 24, fontWeight: 700 }}>
              Manual Invoice Entry
            </h2>
            <p style={{ margin: "4px 0 0 0", color: "rgba(255,255,255,0.8)", fontSize: 14 }}>
              Add invoice items manually with auto-complete suggestions
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
        <div className="form-grid" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 20
        }}>
          {/* Branch */}
          <div className="form-field-branch">
            <StyledDropdown
              items={branches}
              selectedItem={selectedBranch}
              onChange={setSelectedBranch}
              label="Branch"
              placeholder="Select Branch"
              allowCustom={true}
              customValue={newBranchName}
              onCustomChange={setNewBranchName}
            />
          </div>

          {/* Vendor */}
          <div className="form-field-vendor">
            <StyledDropdown
              items={vendors}
              selectedItem={selectedVendor}
              onChange={setSelectedVendor}
              label="Vendor"
              placeholder="Select Vendor"
              allowCustom={true}
              customValue={newVendorName}
              onCustomChange={setNewVendorName}
            />
          </div>

          {/* Date */}
          <div>
            <label style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 600,
              color: "#374151",
              fontSize: 14
            }}>
              Invoice Date
            </label>
            <input
              id="invoiceDatePicker"
              type="text"
              value={invoiceDate}
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

          {/* Invoice ID */}
          <div>
            <label style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 600,
              color: "#374151",
              fontSize: 14
            }}>
              Invoice ID <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              placeholder="Enter invoice/order number"
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
              Unique identifier for this invoice (e.g., INV-2024-001)
            </p>
          </div>
        </div>
      </div>

      {/* Items Table Card */}
      <div style={{
        background: "#fff",
        borderRadius: 20,
        padding: 28,
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        marginBottom: 24
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: "#1f2937", fontSize: 18, fontWeight: 600 }}>
            Invoice Items
          </h3>
          <button
            onClick={() => setShowManageItemsModal(true)}
            style={{
              padding: "8px 16px",
              background: "#f3f4f6",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s"
            }}
            onMouseOver={(e) => {
              e.target.style.background = "#e5e7eb";
            }}
            onMouseOut={(e) => {
              e.target.style.background = "#f3f4f6";
            }}
          >
            ⚙️ Manage Items
          </button>
        </div>

        {/* Desktop Table View */}
        <div className="desktop-table-view" style={{ overflowX: "auto", borderRadius: 16, border: "1px solid #e5e7eb" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left", borderRadius: "16px 0 0 0" }}>Description</th>
                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>UOM</th>
                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>Qty</th>
                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>Price/Unit</th>
                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>GST %</th>
                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>Total</th>
                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "center", borderRadius: "0 16px 0 0", width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{
                  borderBottom: "1px solid #f3f4f6",
                  background: i % 2 === 0 ? "#fff" : "#f9fafb",
                  transition: "background 0.2s"
                }}>
                  <td style={{ padding: 12 }}>
                    <SearchableDropdown
                      items={itemsList.map(item => item.display_name || item.name)}
                      selectedItem={r.description}
                      onChange={(value) => updateRow(i, "description", value)}
                      onBlur={() => checkForNewItem(i, r.description)}
                      placeholder="Start typing..."
                    />
                  </td>
                  <td style={{ padding: 12 }}>
                    <SearchableDropdown
                      items={DEFAULT_UOM_OPTIONS}
                      selectedItem={r.uom}
                      onChange={(value) => updateRow(i, "uom", value)}
                      placeholder="Select or type UOM"
                    />
                  </td>
                  <td style={{ padding: 12 }}>
                    <input
                      type="number"
                      value={r.qty}
                      onChange={(e) => updateRow(i, "qty", e.target.value)}
                      placeholder="0"
                      style={{
                        width: 75,
                        padding: "10px 12px",
                        border: "2px solid #e5e7eb",
                        borderRadius: 10,
                        fontSize: 14,
                        background: "#fff",
                        outline: "none"
                      }}
                    />
                  </td>
                  <td style={{ padding: 12 }}>
                    <input
                      type="number"
                      value={r.price}
                      onChange={(e) => updateRow(i, "price", e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: 90,
                        padding: "10px 12px",
                        border: "2px solid #e5e7eb",
                        borderRadius: 10,
                        fontSize: 14,
                        background: "#fff",
                        outline: "none"
                      }}
                    />
                  </td>
                  <td style={{ padding: 12 }}>
                    <input
                      type="number"
                      value={r.gst}
                      onChange={(e) => updateRow(i, "gst", e.target.value)}
                      placeholder="0"
                      style={{
                        width: 70,
                        padding: "10px 12px",
                        border: "2px solid #e5e7eb",
                        borderRadius: 10,
                        fontSize: 14,
                        background: "#fff",
                        outline: "none"
                      }}
                    />
                  </td>
                  <td style={{ padding: 12 }}>
                    <div style={{
                      padding: "10px 14px",
                      background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
                      borderRadius: 10,
                      fontWeight: 600,
                      color: "#065f46",
                      fontSize: 14,
                      minWidth: 80,
                      textAlign: "center"
                    }}>
                      ₹{r.total || "0.00"}
                    </div>
                  </td>
                  <td style={{ padding: 12, textAlign: "center" }}>
                    <button
                      onClick={() => deleteRow(i)}
                      title="Delete row"
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "none",
                        background: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)",
                        color: "#dc2626",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: 16,
                        transition: "transform 0.2s, box-shadow 0.2s"
                      }}
                      onMouseOver={(e) => {
                        e.target.style.transform = "scale(1.1)";
                        e.target.style.boxShadow = "0 4px 12px rgba(220, 38, 38, 0.3)";
                      }}
                      onMouseOut={(e) => {
                        e.target.style.transform = "scale(1)";
                        e.target.style.boxShadow = "none";
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="mobile-card-view" style={{ display: "none" }}>
          {rows.map((r, i) => (
            <div key={i} style={{
              background: i % 2 === 0 ? "#fff" : "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 16,
              marginBottom: 12
            }}>
              {/* Item Header with Delete */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontWeight: 600, color: "#667eea", fontSize: 13 }}>Item #{i + 1}</span>
                <button
                  onClick={() => deleteRow(i)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)",
                    color: "#dc2626",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 12
                  }}
                >
                  Delete
                </button>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Description</label>
                <SearchableDropdown
                  items={itemsList.map(item => item.display_name || item.name)}
                  selectedItem={r.description}
                  onChange={(value) => updateRow(i, "description", value)}
                  onBlur={() => checkForNewItem(i, r.description)}
                  placeholder="Start typing..."
                />
              </div>

              {/* UOM and Qty Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>UOM</label>
                  <SearchableDropdown
                    items={DEFAULT_UOM_OPTIONS}
                    selectedItem={r.uom}
                    onChange={(value) => updateRow(i, "uom", value)}
                    placeholder="Select or type UOM"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Quantity</label>
                  <input
                    type="number"
                    value={r.qty}
                    onChange={(e) => updateRow(i, "qty", e.target.value)}
                    placeholder="0"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "2px solid #e5e7eb",
                      borderRadius: 10,
                      fontSize: 14,
                      background: "#fff",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              {/* Price and GST Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Price/Unit</label>
                  <input
                    type="number"
                    value={r.price}
                    onChange={(e) => updateRow(i, "price", e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "2px solid #e5e7eb",
                      borderRadius: 10,
                      fontSize: 14,
                      background: "#fff",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>GST %</label>
                  <input
                    type="number"
                    value={r.gst}
                    onChange={(e) => updateRow(i, "gst", e.target.value)}
                    placeholder="0"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "2px solid #e5e7eb",
                      borderRadius: 10,
                      fontSize: 14,
                      background: "#fff",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              {/* Total */}
              <div style={{
                padding: "12px 16px",
                background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
                borderRadius: 10,
                fontWeight: 700,
                color: "#065f46",
                fontSize: 16,
                textAlign: "center"
              }}>
                Total: ₹{r.total || "0.00"}
              </div>
            </div>
          ))}
        </div>

        {/* Grand Total */}
        {rows.length > 0 && parseFloat(calculateGrandTotal()) > 0 && (
          <div style={{
            marginTop: 20,
            padding: "16px 24px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            borderRadius: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 600, fontSize: 16 }}>
              Grand Total ({rows.filter(r => parseFloat(r.total) > 0).length} items)
            </span>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 22 }}>
              ₹{calculateGrandTotal()}
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 16, marginTop: 24, flexWrap: "wrap" }}>
          <button
            onClick={addRow}
            style={{
              padding: "14px 24px",
              borderRadius: 12,
              background: "linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)",
              border: "2px solid #d1d5db",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              color: "#374151",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "transform 0.2s, box-shadow 0.2s"
            }}
            onMouseOver={(e) => {
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
            }}
            onMouseOut={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "none";
            }}
          >
            ➕ Add Item
          </button>

          <button
            onClick={submitManualInvoice}
            disabled={loading}
            style={{
              padding: "14px 32px",
              borderRadius: 12,
              background: loading
                ? "#9ca3af"
                : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "#fff",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: loading ? "none" : "0 4px 16px rgba(102, 126, 234, 0.4)",
              transition: "transform 0.2s, box-shadow 0.2s"
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 8px 24px rgba(102, 126, 234, 0.5)";
              }
            }}
            onMouseOut={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = loading ? "none" : "0 4px 16px rgba(102, 126, 234, 0.4)";
            }}
          >
            {loading ? "Submitting..." : "Submit Invoice"}
          </button>
        </div>
      </div>

      {/* Autocomplete List */}
      <datalist id="items-list">
        {itemsList.map((item, index) => (
          <option key={index} value={item.name}>
            {item.category ? `${item.name} (${item.category})` : item.name}
          </option>
        ))}
      </datalist>

      {/* UOM Autocomplete List */}
      <datalist id="manual-entry-uom-list">
        {DEFAULT_UOM_OPTIONS.map(uom => (
          <option key={uom} value={uom} />
        ))}
      </datalist>

      {/* Message */}
      {message && (
        <div style={{
          padding: "16px 24px",
          borderRadius: 16,
          background: message.includes("successfully") || message.includes("✅")
            ? "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)"
            : "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)",
          color: message.includes("successfully") || message.includes("✅") ? "#065f46" : "#991b1b",
          fontWeight: 600,
          fontSize: 15,
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 12
        }}>
          {message}
        </div>
      )}

      {/* New Item Modal */}
      {showNewItemModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 20,
            padding: 32,
            width: "100%",
            maxWidth: 480,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
          }}>
            <h3 style={{
              margin: "0 0 8px 0",
              color: "#1f2937",
              fontSize: 22,
              fontWeight: 700
            }}>
              🆕 Add New Item
            </h3>
            <p style={{
              margin: "0 0 24px 0",
              color: "#6b7280",
              fontSize: 14
            }}>
              This item doesn't exist in our database. Please select a category to save it.
            </p>

            {/* Item Name (readonly) */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: "block",
                marginBottom: 8,
                fontWeight: 600,
                color: "#374151",
                fontSize: 14
              }}>
                Item Name
              </label>
              <input
                type="text"
                value={newItemData.name}
                readOnly
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "2px solid #e5e7eb",
                  fontSize: 14,
                  background: "#f3f4f6",
                  color: "#374151"
                }}
              />
            </div>

            {/* Category Select */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: "block",
                marginBottom: 8,
                fontWeight: 600,
                color: "#374151",
                fontSize: 14
              }}>
                Category <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <SearchableDropdown
                items={Object.keys(CATEGORIES)}
                selectedItem={newItemData.category}
                onChange={(value) => setNewItemData({
                  ...newItemData,
                  category: value,
                  subcategory: "" // Reset subcategory when category changes
                })}
                placeholder="Select or type category"
              />
            </div>

            {/* Subcategory Select */}
            {newItemData.category && (
              <div style={{ marginBottom: 20 }}>
                <label style={{
                  display: "block",
                  marginBottom: 8,
                  fontWeight: 600,
                  color: "#374151",
                  fontSize: 14
                }}>
                  Subcategory
                </label>
                <SearchableDropdown
                  items={CATEGORIES[newItemData.category] || []}
                  selectedItem={newItemData.subcategory}
                  onChange={(value) => setNewItemData({
                    ...newItemData,
                    subcategory: value
                  })}
                  placeholder="Select or type subcategory (optional)"
                />
              </div>
            )}

            {/* Default UOM */}
            <div style={{ marginBottom: 28 }}>
              <label style={{
                display: "block",
                marginBottom: 8,
                fontWeight: 600,
                color: "#374151",
                fontSize: 14
              }}>
                Default Unit of Measurement
              </label>
              <div style={{ position: "relative" }}>
                <input
                  list="uom-options-list"
                  type="text"
                  value={newItemData.defaultUom}
                  onChange={(e) => setNewItemData({
                    ...newItemData,
                    defaultUom: e.target.value
                  })}
                  placeholder="Select or type UOM"
                  style={{
                    width: "100%",
                    padding: "12px 40px 12px 16px",
                    borderRadius: 12,
                    border: "2px solid #e5e7eb",
                    fontSize: 14,
                    background: "#fff",
                    outline: "none",
                    cursor: "text"
                  }}
                />
                <span style={{
                  position: "absolute",
                  right: 16,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  color: "#9ca3af",
                  fontSize: 12
                }}>▼</span>
              </div>
              <datalist id="uom-options-list">
                {DEFAULT_UOM_OPTIONS.map(uom => (
                  <option key={uom} value={uom} />
                ))}
              </datalist>
              <p style={{
                margin: "6px 0 0 0",
                fontSize: 12,
                color: "#6b7280",
                fontStyle: "italic"
              }}>
                Select from dropdown or type your own
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={handleNewItemCancel}
                style={{
                  padding: "12px 24px",
                  borderRadius: 12,
                  border: "2px solid #e5e7eb",
                  background: "#fff",
                  color: "#374151",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer"
                }}
              >
                Skip
              </button>
              <button
                onClick={handleNewItemSave}
                disabled={!newItemData.category || savingNewItem || (newItemData.defaultUom === "__other__" && !newItemData.customUom.trim())}
                style={{
                  padding: "12px 24px",
                  borderRadius: 12,
                  border: "none",
                  background: !newItemData.category || savingNewItem || (newItemData.defaultUom === "__other__" && !newItemData.customUom.trim())
                    ? "#9ca3af"
                    : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: !newItemData.category || savingNewItem || (newItemData.defaultUom === "__other__" && !newItemData.customUom.trim()) ? "not-allowed" : "pointer",
                  boxShadow: !newItemData.category || savingNewItem || (newItemData.defaultUom === "__other__" && !newItemData.customUom.trim())
                    ? "none"
                    : "0 4px 16px rgba(102, 126, 234, 0.4)"
                }}
              >
                {savingNewItem ? "Saving..." : "Save Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Items Modal */}
      {showManageItemsModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 20,
            padding: 28,
            width: "90%",
            maxWidth: 700,
            maxHeight: "85vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
          }}>
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1f2937" }}>
                ⚙️ Manage Items
              </h3>
              <button
                onClick={() => {
                  setShowManageItemsModal(false);
                  setEditingItem(null);
                  setItemFilter("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 24,
                  cursor: "pointer",
                  color: "#6b7280"
                }}
              >
                ×
              </button>
            </div>

            {/* Search Filter */}
            <input
              type="text"
              placeholder="🔍 Search items..."
              value={itemFilter}
              onChange={(e) => setItemFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "2px solid #e5e7eb",
                fontSize: 14,
                marginBottom: 16,
                outline: "none"
              }}
            />

            {/* Items List */}
            <div style={{ flex: 1, overflowY: "auto", maxHeight: "50vh" }}>
              {itemsList
                .filter(item =>
                  item.name.toLowerCase().includes(itemFilter.toLowerCase()) ||
                  (item.category || "").toLowerCase().includes(itemFilter.toLowerCase())
                )
                .map((item, index) => (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderRadius: 10,
                      background: index % 2 === 0 ? "#f9fafb" : "#fff",
                      marginBottom: 4,
                      border: editingItem?.name === item.name ? "2px solid #667eea" : "1px solid #e5e7eb"
                    }}
                  >
                    {editingItem?.name === item.name ? (
                      /* Edit Mode */
                      <div style={{ flex: 1, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, minWidth: 120 }}>{item.name}</span>
                        <select
                          value={editingItem.category}
                          onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value, subcategory: "" })}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            fontSize: 13
                          }}
                        >
                          <option value="">Select Category</option>
                          {Object.keys(CATEGORIES).map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        {editingItem.category && CATEGORIES[editingItem.category] && (
                          <select
                            value={editingItem.subcategory}
                            onChange={(e) => setEditingItem({ ...editingItem, subcategory: e.target.value })}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              fontSize: 13
                            }}
                          >
                            <option value="">Select Subcategory</option>
                            {CATEGORIES[editingItem.category].map(sub => (
                              <option key={sub} value={sub}>{sub}</option>
                            ))}
                          </select>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => updateItemInDB(item.name, { category: editingItem.category, subcategory: editingItem.subcategory })}
                            disabled={savingNewItem}
                            style={{
                              padding: "6px 12px",
                              background: "#10b981",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: "pointer"
                            }}
                          >
                            {savingNewItem ? "..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingItem(null)}
                            style={{
                              padding: "6px 12px",
                              background: "#6b7280",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: "pointer"
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <>
                        <div>
                          <span style={{ fontWeight: 600, color: "#1f2937" }}>{item.name}</span>
                          <span style={{
                            marginLeft: 8,
                            padding: "2px 8px",
                            background: item.category === "Custom" || item.category === "Uncategorized" || !item.category
                              ? "#fef3c7"
                              : "#dbeafe",
                            color: item.category === "Custom" || item.category === "Uncategorized" || !item.category
                              ? "#92400e"
                              : "#1e40af",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 500
                          }}>
                            {item.category || "Uncategorized"}
                            {item.subcategory && ` › ${item.subcategory}`}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => setEditingItem({ name: item.name, category: item.category || "", subcategory: item.subcategory || "" })}
                            style={{
                              padding: "6px 12px",
                              background: "#3b82f6",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: "pointer"
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete "${item.name}"?`)) {
                                deleteItemFromDB(item.name);
                              }
                            }}
                            disabled={deletingItem === item.name}
                            style={{
                              padding: "6px 12px",
                              background: deletingItem === item.name ? "#9ca3af" : "#ef4444",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: deletingItem === item.name ? "not-allowed" : "pointer"
                            }}
                          >
                            {deletingItem === item.name ? "..." : "Delete"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
            </div>

            {/* Item Count */}
            <div style={{ marginTop: 16, color: "#6b7280", fontSize: 13, textAlign: "center" }}>
              {itemsList.filter(item =>
                item.name.toLowerCase().includes(itemFilter.toLowerCase()) ||
                (item.category || "").toLowerCase().includes(itemFilter.toLowerCase())
              ).length} items
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
