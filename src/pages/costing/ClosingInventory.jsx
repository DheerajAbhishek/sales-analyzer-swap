import { useState, useEffect, useRef } from "react";
import axios from "axios";
import flatpickr from 'flatpickr';
import StyledDropdown from '../../components/StyledDropdown';
import SearchableDropdown from '../../components/SearchableDropdown';

const API_BASE = import.meta.env.VITE_DASHBOARD_API;
const USER_EMAIL = import.meta.env.VITE_DASHBOARD_USER;
const ITEMS_API = import.meta.env.VITE_ITEMS_API;
const CLOSING_INVENTORY_API = import.meta.env.VITE_CLOSING_INVENTORY_API;

// Default unit of measurement options
const DEFAULT_UOM_OPTIONS = ["kg", "liter", "pcs", "gm", "ml", "dozen", "box", "packet"];

// Local storage key for custom items
const CUSTOM_ITEMS_KEY = "closing_inventory_custom_items";

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

export default function ClosingInventory() {
    const [branches, setBranches] = useState([]);
    const [itemsList, setItemsList] = useState([]);

    // Fetch filters
    const [fetchBranch, setFetchBranch] = useState("");
    const [fetchVendor, setFetchVendor] = useState("");
    const [fetchDate, setFetchDate] = useState("");
    const [fetchVendors, setFetchVendors] = useState([]);

    // Save filters
    const [saveBranch, setSaveBranch] = useState("");
    const [saveVendor, setSaveVendor] = useState("");
    const [saveDate, setSaveDate] = useState("");
    const [saveVendors, setSaveVendors] = useState([]);

    // New branch/vendor names
    const [newBranchName, setNewBranchName] = useState("");
    const [newVendorName, setNewVendorName] = useState("");

    const [rows, setRows] = useState([
        { item: "", uom: "", quantity: "", rate: "", value: "" }
    ]);

    const [fetchedData, setFetchedData] = useState(null);

    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [fetchingData, setFetchingData] = useState(false);

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

    const fetchDatePickerRef = useRef(null);
    const saveDatePickerRef = useRef(null);

    useEffect(() => {
        loadBranches();
        loadItems();
    }, []);

    // Initialize fetch date picker
    useEffect(() => {
        const dateInput = document.getElementById('fetchDatePicker');
        if (dateInput && !fetchDatePickerRef.current) {
            fetchDatePickerRef.current = flatpickr(dateInput, {
                dateFormat: 'Y-m-d',
                onChange: (selectedDates) => {
                    if (selectedDates.length > 0) {
                        const pad = (num) => String(num).padStart(2, '0');
                        const date = selectedDates[0];
                        const formatted = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
                        setFetchDate(formatted);
                    }
                }
            });
        }
        return () => {
            if (fetchDatePickerRef.current) {
                fetchDatePickerRef.current.destroy();
                fetchDatePickerRef.current = null;
            }
        };
    }, []);

    // Initialize save date picker
    useEffect(() => {
        const dateInput = document.getElementById('saveDatePicker');
        if (dateInput && !saveDatePickerRef.current) {
            saveDatePickerRef.current = flatpickr(dateInput, {
                dateFormat: 'Y-m-d',
                onChange: (selectedDates) => {
                    if (selectedDates.length > 0) {
                        const pad = (num) => String(num).padStart(2, '0');
                        const date = selectedDates[0];
                        const formatted = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
                        setSaveDate(formatted);
                    }
                }
            });
        }
        return () => {
            if (saveDatePickerRef.current) {
                saveDatePickerRef.current.destroy();
                saveDatePickerRef.current = null;
            }
        };
    }, []);

    // Load vendors when fetch branch is selected
    useEffect(() => {
        if (fetchBranch) {
            loadVendorsForBranch(fetchBranch, setFetchVendors);
        } else {
            setFetchVendors([]);
            setFetchVendor("");
        }
    }, [fetchBranch]);

    // Load vendors when save branch is selected
    useEffect(() => {
        if (saveBranch) {
            loadVendorsForBranch(saveBranch, setSaveVendors);
        } else {
            setSaveVendors([]);
            setSaveVendor("");
        }
    }, [saveBranch]);

    async function loadBranches() {
        try {
            const res = await axios.get(`${API_BASE}?mode=branches&user_email=${USER_EMAIL}`);
            setBranches(res.data.branches || []);
        } catch (err) {
            console.log("Failed to load branches");
        }
    }

    async function loadVendorsForBranch(branch, setVendorsCallback) {
        try {
            const res = await axios.get(`${API_BASE}?mode=vendors&user_email=${USER_EMAIL}&branch=${encodeURIComponent(branch)}`);
            setVendorsCallback(res.data.vendors || []);
        } catch (err) {
            console.log("Failed to load vendors");
            setVendorsCallback([]);
        }
    }

    async function loadItems() {
        try {
            if (ITEMS_API) {
                const res = await axios.get(`${ITEMS_API}?mode=items`);
                if (res.data.items && res.data.items.length > 0) {
                    const apiItems = res.data.items;
                    // Load custom items from localStorage
                    const customItems = JSON.parse(localStorage.getItem(CUSTOM_ITEMS_KEY) || "[]");
                    // Merge and deduplicate
                    const allItems = [...apiItems, ...customItems];
                    const uniqueItems = allItems.filter((item, index, self) =>
                        index === self.findIndex(i => i.name.toLowerCase() === item.name.toLowerCase())
                    );
                    setItemsList(uniqueItems);
                    return;
                }
            }
        } catch (err) {
            console.log("Failed to load items");
        }
        // Load custom items from localStorage as fallback
        const customItems = JSON.parse(localStorage.getItem(CUSTOM_ITEMS_KEY) || "[]");
        setItemsList(customItems);
    }

    async function fetchClosingData() {
        if (!fetchBranch || !fetchVendor || !fetchDate) {
            setMessage("Please select branch, vendor, and date to fetch");
            setTimeout(() => setMessage(""), 3000);
            return;
        }

        try {
            setFetchingData(true);
            setMessage("");
            setFetchedData(null);

            const res = await axios.get(`${CLOSING_INVENTORY_API}?branch=${encodeURIComponent(fetchBranch)}&vendor=${encodeURIComponent(fetchVendor)}&date=${fetchDate}`);

            if (res.data && res.data.data) {
                setFetchedData(res.data.data);
                setMessage(`✅ Loaded closing inventory data`);
                setTimeout(() => setMessage(""), 3000);
            } else {
                setMessage("No data found");
                setTimeout(() => setMessage(""), 3000);
            }
        } catch (err) {
            console.error("Fetch error:", err);
            if (err.response?.status === 404) {
                setMessage("No closing inventory found for this date");
                setFetchedData(null);
            } else {
                setMessage("Failed to fetch closing data");
            }
            setTimeout(() => setMessage(""), 3000);
        } finally {
            setFetchingData(false);
        }
    }

    function addRow() {
        setRows([...rows, { item: "", uom: "", quantity: "", rate: "", value: "" }]);
    }

    function deleteRow(index) {
        if (rows.length === 1) {
            setRows([{ item: "", uom: "", quantity: "", rate: "", value: "" }]);
            return;
        }
        setRows(rows.filter((_, i) => i !== index));
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

        if (existingIndex !== -1) {
            return; // Item already exists
        }

        // Create new item
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

    function handleNewItemSave() {
        if (!newItemData.name || !newItemData.category) {
            setMessage("Please select a category for the new item");
            setTimeout(() => setMessage(""), 3000);
            return;
        }

        if (!newItemData.defaultUom.trim()) {
            setMessage("Please enter a unit of measurement");
            setTimeout(() => setMessage(""), 3000);
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

    function updateRow(index, field, value) {
        const updated = [...rows];
        updated[index][field] = value;

        // If item name changes, auto-populate uom from items list
        if (field === "item" && value) {
            const matchedItem = getItemByName(value);
            if (matchedItem) {
                updated[index].uom = matchedItem.defaultUom || "";
            }
        }

        // Auto-calculate value when quantity or rate changes
        if (field === "quantity" || field === "rate") {
            const qty = parseFloat(updated[index].quantity) || 0;
            const rate = parseFloat(updated[index].rate) || 0;
            updated[index].value = (qty * rate).toFixed(2);
        }

        setRows(updated);
    }

    function getItemByName(name) {
        return itemsList.find(item => item.name.toLowerCase() === name.toLowerCase());
    }

    // Calculate grand total of all item values
    function calculateGrandTotal() {
        return rows.reduce((sum, row) => {
            const value = parseFloat(row.value) || 0;
            return sum + value;
        }, 0).toFixed(2);
    }

    async function handleSubmit() {
        // Determine actual branch and vendor values
        const actualBranch = saveBranch === "__new__" ? newBranchName.trim() : saveBranch;
        const actualVendor = saveVendor === "__new__" ? newVendorName.trim() : saveVendor;

        if (!actualBranch || !actualVendor || !saveDate) {
            setMessage("Please select/enter branch, vendor, and date for saving");
            setTimeout(() => setMessage(""), 3000);
            return;
        }

        // Filter out empty rows
        const validRows = rows.filter(r => r.item.trim() && r.quantity && r.rate);

        if (validRows.length === 0) {
            setMessage("Please add at least one item with quantity and rate");
            setTimeout(() => setMessage(""), 3000);
            return;
        }

        const payload = {
            branch: actualBranch,
            vendor: actualVendor,
            date: saveDate,
            user_email: USER_EMAIL,
            items: validRows.map(r => ({
                item: r.item.trim(),
                uom: r.uom || "",
                quantity: String(parseFloat(r.quantity) || 0),
                rate: String(parseFloat(r.rate) || 0),
                value: String(parseFloat(r.value) || 0)
            }))
        };

        try {
            setLoading(true);
            setMessage("");

            await axios.post(CLOSING_INVENTORY_API, payload);

            setMessage("✅ Closing inventory saved successfully!");

            // If new branch was added, reload branches and reset
            if (saveBranch === "__new__") {
                loadBranches();
                setSaveBranch("");
                setNewBranchName("");
            }
            // Reset new vendor name if it was used
            if (saveVendor === "__new__") {
                setNewVendorName("");
                setSaveVendor("");
            }

            setTimeout(() => setMessage(""), 3000);
        } catch (err) {
            console.error(err);
            setMessage("❌ Failed to save closing inventory");
            setTimeout(() => setMessage(""), 3000);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="closing-inventory-page" style={{
            padding: "32px",
            maxWidth: 1100,
            margin: "auto",
            minHeight: "100vh",
            background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)"
        }}>
            {/* Header Card */}
            <div style={{
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                borderRadius: 20,
                padding: "28px 32px",
                marginBottom: 28,
                boxShadow: "0 10px 40px rgba(16, 185, 129, 0.3)"
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
                        CI
                    </div>
                    <div>
                        <h2 style={{ margin: 0, color: "#fff", fontSize: 24, fontWeight: 700 }}>
                            Closing Inventory
                        </h2>
                        <p style={{ margin: "4px 0 0 0", color: "rgba(255,255,255,0.8)", fontSize: 14 }}>
                            Record and manage daily closing stock
                        </p>
                    </div>
                </div>
            </div>

            {/* Fetch Data Section */}
            <div style={{
                background: "#fff",
                borderRadius: 20,
                padding: 28,
                boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
                marginBottom: 24,
                border: "2px solid #3b82f6"
            }}>
                <h3 style={{ margin: "0 0 20px 0", color: "#3b82f6", fontSize: 18, fontWeight: 600 }}>
                    🔍 Fetch Existing Data
                </h3>
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 20
                }}>
                    {/* Fetch Branch */}
                    <div>
                        <StyledDropdown
                            items={branches}
                            selectedItem={fetchBranch}
                            onChange={setFetchBranch}
                            label="Branch"
                            placeholder="Select Branch"
                        />
                    </div>

                    {/* Fetch Vendor */}
                    <div>
                        <StyledDropdown
                            items={fetchVendors}
                            selectedItem={fetchVendor}
                            onChange={setFetchVendor}
                            label="Vendor"
                            placeholder="Select Vendor"
                        />
                    </div>

                    {/* Fetch Date */}
                    <div>
                        <label style={{
                            display: "block",
                            marginBottom: 8,
                            fontWeight: 600,
                            color: "#374151",
                            fontSize: 14
                        }}>
                            Date
                        </label>
                        <input
                            type="text"
                            id="fetchDatePicker"
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

                    {/* Fetch Button */}
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                        <button
                            onClick={fetchClosingData}
                            disabled={fetchingData || !fetchBranch || !fetchVendor || !fetchDate}
                            style={{
                                width: "100%",
                                padding: "12px 16px",
                                borderRadius: 12,
                                border: "none",
                                background: fetchingData || !fetchBranch || !fetchVendor || !fetchDate
                                    ? "#9ca3af"
                                    : "#3b82f6",
                                color: "#fff",
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: fetchingData || !fetchBranch || !fetchVendor || !fetchDate
                                    ? "not-allowed"
                                    : "pointer"
                            }}
                        >
                            {fetchingData ? "Loading..." : "Fetch Data"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Fetched Data Display Section */}
            {fetchedData && (
                <div style={{
                    background: "#fff",
                    borderRadius: 20,
                    padding: 28,
                    boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
                    marginBottom: 24,
                    border: "2px solid #10b981"
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                        <h3 style={{ margin: 0, color: "#1f2937", fontSize: 18, fontWeight: 600 }}>
                            📊 Fetched Closing Inventory Data
                        </h3>
                        <button
                            onClick={() => setFetchedData(null)}
                            style={{
                                padding: "8px 16px",
                                borderRadius: 10,
                                border: "none",
                                background: "#ef4444",
                                color: "#fff",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: "pointer"
                            }}
                        >
                            Clear
                        </button>
                    </div>

                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: 16,
                        marginBottom: 20,
                        padding: 16,
                        background: "#f9fafb",
                        borderRadius: 12
                    }}>
                        <div>
                            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>Branch</div>
                            <div style={{ fontSize: 14, color: "#1f2937", fontWeight: 600 }}>{fetchedData.branch}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>Vendor</div>
                            <div style={{ fontSize: 14, color: "#1f2937", fontWeight: 600 }}>{fetchedData.vendor}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>Date</div>
                            <div style={{ fontSize: 14, color: "#1f2937", fontWeight: 600 }}>{fetchedData.date}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>Total Items</div>
                            <div style={{ fontSize: 14, color: "#1f2937", fontWeight: 600 }}>{fetchedData.item_count}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>Total Value</div>
                            <div style={{ fontSize: 14, color: "#10b981", fontWeight: 700 }}>₹{fetchedData.total_value?.toFixed(2) || '0.00'}</div>
                        </div>
                    </div>

                    <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}>
                                    <th style={{ padding: "12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>#</th>
                                    <th style={{ padding: "12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>Item Name</th>
                                    <th style={{ padding: "12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>UOM</th>
                                    <th style={{ padding: "12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "right" }}>Quantity</th>
                                    <th style={{ padding: "12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "right" }}>Rate (₹)</th>
                                    <th style={{ padding: "12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "right" }}>Value (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fetchedData.items && fetchedData.items.map((item, index) => (
                                    <tr key={index} style={{
                                        borderBottom: "1px solid #f3f4f6",
                                        background: index % 2 === 0 ? "#fff" : "#f9fafb"
                                    }}>
                                        <td style={{ padding: "12px", fontSize: 13, color: "#6b7280" }}>{index + 1}</td>
                                        <td style={{ padding: "12px", fontSize: 14, color: "#1f2937", fontWeight: 500 }}>{item.item}</td>
                                        <td style={{ padding: "12px", fontSize: 13, color: "#6b7280" }}>{item.uom}</td>
                                        <td style={{ padding: "12px", fontSize: 14, color: "#1f2937", textAlign: "right" }}>{item.quantity}</td>
                                        <td style={{ padding: "12px", fontSize: 14, color: "#1f2937", textAlign: "right" }}>{item.rate?.toFixed(2) || '0.00'}</td>
                                        <td style={{ padding: "12px", fontSize: 14, color: "#10b981", fontWeight: 600, textAlign: "right" }}>₹{item.value?.toFixed(2) || '0.00'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{
                        marginTop: 16,
                        padding: 12,
                        background: "#f0fdf4",
                        borderRadius: 10,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                    }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                            Created: {new Date(fetchedData.created_at).toLocaleString()} |
                            Updated: {new Date(fetchedData.updated_at).toLocaleString()}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                            By: {fetchedData.user_email}
                        </div>
                    </div>
                </div>
            )}

            {/* Items Table Card */}
            <div style={{
                background: "#fff",
                borderRadius: 20,
                padding: 28,
                boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
                marginBottom: 24,
                border: "2px solid #10b981"
            }}>
                <h3 style={{ margin: "0 0 20px 0", color: "#10b981", fontSize: 18, fontWeight: 600 }}>
                    💾 Add New Closing Inventory
                </h3>

                {/* Save Filters */}
                <div className="form-grid" style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 16,
                    marginBottom: 20,
                    padding: 16,
                    background: "#f0fdf4",
                    borderRadius: 12
                }}>
                    {/* Save Branch */}
                    <div className="form-field-branch">
                        <StyledDropdown
                            items={branches}
                            selectedItem={saveBranch}
                            onChange={setSaveBranch}
                            label="Branch"
                            placeholder="Select Branch"
                            allowCustom={true}
                            customValue={newBranchName}
                            onCustomChange={setNewBranchName}
                        />
                    </div>

                    {/* Save Vendor */}
                    <div className="form-field-vendor">
                        <StyledDropdown
                            items={saveVendors}
                            selectedItem={saveVendor}
                            onChange={setSaveVendor}
                            label="Vendor"
                            placeholder="Select Vendor"
                            allowCustom={true}
                            customValue={newVendorName}
                            onCustomChange={setNewVendorName}
                        />
                    </div>

                    {/* Save Date */}
                    <div>
                        <label style={{
                            display: "block",
                            marginBottom: 6,
                            fontWeight: 600,
                            color: "#374151",
                            fontSize: 13
                        }}>
                            Date
                        </label>
                        <input
                            type="text"
                            id="saveDatePicker"
                            placeholder="Select date"
                            readOnly
                            style={{
                                width: "100%",
                                padding: "10px 14px",
                                borderRadius: 10,
                                border: "2px solid #e5e7eb",
                                fontSize: 14,
                                background: "#fff",
                                cursor: "pointer",
                                outline: "none"
                            }}
                        />
                    </div>
                </div>

                {/* Desktop Table View */}
                <div className="desktop-table-view" style={{ overflowX: "auto", borderRadius: 16, border: "1px solid #e5e7eb" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}>
                                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left", borderRadius: "16px 0 0 0" }}>Item Name</th>
                                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>UOM</th>
                                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>Quantity</th>
                                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>Rate (₹)</th>
                                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "left" }}>Value (₹)</th>
                                <th style={{ padding: "16px 12px", color: "#fff", fontWeight: 600, fontSize: 13, textAlign: "center", borderRadius: "0 16px 0 0", width: 60 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} style={{
                                    borderBottom: "1px solid #f3f4f6",
                                    background: i % 2 === 0 ? "#fff" : "#f9fafb"
                                }}>
                                    <td style={{ padding: 12 }}>
                                        <SearchableDropdown
                                            items={itemsList.map(item => item.display_name || item.name)}
                                            selectedItem={r.item}
                                            onChange={(value) => updateRow(i, "item", value)}
                                            onBlur={() => checkForNewItem(i, r.item)}
                                            placeholder="Start typing item name..."
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
                                            step="0.01"
                                            value={r.quantity}
                                            onChange={(e) => updateRow(i, "quantity", e.target.value)}
                                            placeholder="0"
                                            style={{
                                                width: "100%",
                                                padding: "10px 14px",
                                                border: "2px solid #e5e7eb",
                                                borderRadius: 10,
                                                fontSize: 14,
                                                background: "#fff",
                                                outline: "none",
                                                minWidth: "80px"
                                            }}
                                        />
                                    </td>
                                    <td style={{ padding: 12 }}>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={r.rate}
                                            onChange={(e) => updateRow(i, "rate", e.target.value)}
                                            placeholder="0.00"
                                            style={{
                                                width: "100%",
                                                padding: "10px 14px",
                                                border: "2px solid #e5e7eb",
                                                borderRadius: 10,
                                                fontSize: 14,
                                                background: "#fff",
                                                outline: "none",
                                                minWidth: "90px"
                                            }}
                                        />
                                    </td>
                                    <td style={{ padding: 12 }}>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={r.value}
                                            placeholder="0.00"
                                            style={{
                                                width: "100%",
                                                padding: "10px 14px",
                                                border: "2px solid #e5e7eb",
                                                borderRadius: 10,
                                                fontSize: 14,
                                                background: "#f9fafb",
                                                outline: "none",
                                                minWidth: "90px"
                                            }}
                                            readOnly
                                        />
                                    </td>
                                    <td style={{ padding: 12, textAlign: "center" }}>
                                        <button
                                            onClick={() => deleteRow(i)}
                                            style={{
                                                background: "none",
                                                border: "none",
                                                color: "#ef4444",
                                                fontSize: 20,
                                                cursor: "pointer",
                                                padding: "4px 8px"
                                            }}
                                        >
                                            ×
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
                                <span style={{ fontWeight: 600, color: "#10b981", fontSize: 13 }}>Item #{i + 1}</span>
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

                            {/* Item Name */}
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Item Name</label>
                                <SearchableDropdown
                                    items={itemsList.map(item => item.display_name || item.name)}
                                    selectedItem={r.item}
                                    onChange={(value) => updateRow(i, "item", value)}
                                    onBlur={() => checkForNewItem(i, r.item)}
                                    placeholder="Start typing item name..."
                                />
                            </div>

                            {/* UOM and Quantity Row */}
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
                                        step="0.01"
                                        value={r.quantity}
                                        onChange={(e) => updateRow(i, "quantity", e.target.value)}
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

                            {/* Rate Row */}
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Rate (₹)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={r.rate}
                                    onChange={(e) => updateRow(i, "rate", e.target.value)}
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

                            {/* Value */}
                            <div style={{
                                padding: "12px 16px",
                                background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
                                borderRadius: 10,
                                fontWeight: 700,
                                color: "#065f46",
                                fontSize: 16,
                                textAlign: "center"
                            }}>
                                Value: ₹{r.value || "0.00"}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Grand Total */}
                {rows.length > 0 && parseFloat(calculateGrandTotal()) > 0 && (
                    <div style={{
                        marginTop: 16,
                        padding: "14px 20px",
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        borderRadius: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                    }}>
                        <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 600, fontSize: 15 }}>
                            Grand Total ({rows.filter(r => parseFloat(r.value) > 0).length} items)
                        </span>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: 20 }}>
                            ₹{calculateGrandTotal()}
                        </span>
                    </div>
                )}

                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                    <button
                        onClick={addRow}
                        style={{
                            padding: "10px 20px",
                            borderRadius: 12,
                            border: "2px solid #10b981",
                            background: "#fff",
                            color: "#10b981",
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: "pointer"
                        }}
                    >
                        + Add Row
                    </button>

                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        style={{
                            padding: "10px 20px",
                            borderRadius: 12,
                            border: "none",
                            background: loading ? "#9ca3af" : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: loading ? "not-allowed" : "pointer",
                            marginLeft: "auto"
                        }}
                    >
                        {loading ? "Saving..." : "Save Closing Inventory"}
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
            <datalist id="items-uom-list">
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
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)"
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
                                disabled={!newItemData.category || !newItemData.defaultUom.trim() || savingNewItem}
                                style={{
                                    padding: "12px 24px",
                                    borderRadius: 12,
                                    border: "none",
                                    background: !newItemData.category || !newItemData.defaultUom.trim() || savingNewItem
                                        ? "#9ca3af"
                                        : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                                    color: "#fff",
                                    fontWeight: 600,
                                    fontSize: 14,
                                    cursor: !newItemData.category || !newItemData.defaultUom.trim() || savingNewItem ? "not-allowed" : "pointer",
                                    boxShadow: !newItemData.category || !newItemData.defaultUom.trim() || savingNewItem
                                        ? "none"
                                        : "0 4px 16px rgba(16, 185, 129, 0.4)"
                                }}
                            >
                                {savingNewItem ? "Saving..." : "Save Item"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}