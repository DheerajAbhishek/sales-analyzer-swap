import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.css';
import { ristaService, reportService } from '../../services/api';
import { RESTAURANT_ID_MAP } from '../../utils/constants';

const API_BASE = import.meta.env.VITE_DASHBOARD_API || '';
const DASHBOARD_API = import.meta.env.VITE_DASHBOARD_API || '';
const USER_EMAIL = import.meta.env.VITE_DASHBOARD_USER || '';
const CLOSING_INVENTORY_API = import.meta.env.VITE_CLOSING_INVENTORY_API || '';

// Cloud kitchen to Rista branch code mapping
const CLOUD_KITCHEN_TO_RISTA = {
    'bhanu_arcade': 'KDPR',
    'kitchens@': 'KRMG',
    'mk': 'MK'
};

/**
 * Daily Food Costing Component
 * 
 * Calculates daily food cost and food cost percentage using:
 * - Opening Inventory (yesterday's closing)
 * - Purchases (from costing module)
 * - Closing Inventory (user input)
 * - Sales (from RISTA API)
 * 
 * Formula:
 * - Daily COGS = Opening Inventory + Purchases - Closing Inventory
 * - Food Cost % = (Daily COGS / Net Sales) × 100
 * - Target: 25%
 */
export default function DailyFoodCosting() {
    // Rista Branches (existing)
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [selectedBranchId, setSelectedBranchId] = useState('');
    const [selectedBranchKey, setSelectedBranchKey] = useState(''); // Restaurant key for sales API
    const [selectedDate, setSelectedDate] = useState(getTodayDate());

    // Auto-fetched data (Rista)
    const [openingInventory, setOpeningInventory] = useState(null);
    const [closingInventory, setClosingInventory] = useState(null);
    const [purchases, setPurchases] = useState(null);
    const [sales, setSales] = useState(null);

    // Calculation results (Rista)
    const [results, setResults] = useState(null);

    // Cloud Kitchen State
    const [cloudBranches, setCloudBranches] = useState([]);
    const [selectedCloudBranch, setSelectedCloudBranch] = useState('');
    const [selectedCloudDate, setSelectedCloudDate] = useState(getTodayDate());
    const [cloudOpeningInventory, setCloudOpeningInventory] = useState(null);
    const [cloudClosingInventory, setCloudClosingInventory] = useState(null);
    const [cloudPurchases, setCloudPurchases] = useState(null);
    const [cloudSales, setCloudSales] = useState(null);
    const [cloudResults, setCloudResults] = useState(null);
    const [cloudLoading, setCloudLoading] = useState(false);

    // UI state
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const datePickerRef = useRef(null);
    const cloudDatePickerRef = useRef(null);

    // Get today's date in YYYY-MM-DD format
    function getTodayDate() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }

    // Initialize date picker
    useEffect(() => {
        const dateInput = document.getElementById('dailyFoodCostingDatePicker');
        if (dateInput && !datePickerRef.current) {
            datePickerRef.current = flatpickr(dateInput, {
                dateFormat: 'Y-m-d',
                defaultDate: selectedDate,
                onChange: (selectedDates) => {
                    if (selectedDates.length > 0) {
                        const date = selectedDates[0];
                        // Format date in local timezone to avoid timezone shift
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const formatted = `${year}-${month}-${day}`;
                        setSelectedDate(formatted);
                        // Clear previous results when date changes
                        setResults(null);
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

    // Load branches on mount
    useEffect(() => {
        loadBranches();
        loadCloudBranches();
    }, []);

    // Initialize cloud kitchen date picker
    useEffect(() => {
        const cloudDateInput = document.getElementById('cloudDailyDatePicker');
        if (cloudDateInput && !cloudDatePickerRef.current) {
            cloudDatePickerRef.current = flatpickr(cloudDateInput, {
                dateFormat: 'Y-m-d',
                defaultDate: selectedCloudDate,
                onChange: (selectedDates) => {
                    if (selectedDates.length > 0) {
                        const date = selectedDates[0];
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const formatted = `${year}-${month}-${day}`;
                        setSelectedCloudDate(formatted);
                        setCloudResults(null);
                    }
                }
            });
        }

        return () => {
            if (cloudDatePickerRef.current) {
                cloudDatePickerRef.current.destroy();
                cloudDatePickerRef.current = null;
            }
        };
    }, []);

    // Auto-calculate when all data is loaded
    useEffect(() => {
        if (openingInventory && closingInventory && purchases && sales &&
            !openingInventory.loading && !closingInventory.loading && !purchases.loading && !sales.loading) {
            autoCalculate();
        }
    }, [openingInventory, closingInventory, purchases, sales]);

    const loadBranches = async () => {
        try {
            // Use existing RESTAURANT_ID_MAP instead of fetching from API
            const branchOptions = Object.entries(RESTAURANT_ID_MAP)
                .filter(([key, config]) => config.ristaBranchCode) // Only branches with Rista codes
                .map(([key, config]) => ({
                    name: config.name,
                    code: config.ristaBranchCode,
                    key: key // Restaurant key for sales API
                }));

            setBranches(branchOptions);

            // Set first branch as default
            if (branchOptions.length > 0) {
                setSelectedBranch(branchOptions[0].name);
                setSelectedBranchId(branchOptions[0].code);
                setSelectedBranchKey(branchOptions[0].key);
            }
        } catch (error) {
            console.error('Error loading branches:', error);
            showMessage('error', 'Failed to load branches');
        }
    };
    const loadCloudBranches = async () => {
        try {
            if (!API_BASE || !USER_EMAIL) return;
            const res = await axios.get(`${API_BASE}?mode=branches&user_email=${encodeURIComponent(USER_EMAIL)}`);
            const branches = res.data.branches || [];
            setCloudBranches(branches);

            // Set first cloud branch as default
            if (branches.length > 0) {
                setSelectedCloudBranch(branches[0]);
            }
        } catch (error) {
            console.error('Error loading cloud branches:', error);
            showMessage('error', 'Failed to load cloud kitchen branches');
        }
    };

    const fetchCloudKitchenData = async () => {
        if (!selectedCloudBranch || !selectedCloudDate) {
            return;
        }

        setCloudLoading(true);
        setMessage({ type: '', text: '' });

        // Initialize with loading states
        setCloudOpeningInventory({ value: 0, loading: true });
        setCloudClosingInventory({ value: 0, loading: true });
        setCloudPurchases({ value: 0, loading: true });
        setCloudSales({ value: 0, orders: 0, loading: true });

        try {
            const cloudFrontBase = 'https://dmp4g7m8ocjuc.cloudfront.net/costing';

            // Calculate opening date (skip Sunday logic)
            const date = new Date(selectedCloudDate);
            const daysToSubtract = date.getDay() === 1 ? 2 : 1;
            const openingDate = new Date(date);
            openingDate.setDate(date.getDate() - daysToSubtract);
            const prevDay = openingDate.toISOString().split('T')[0];

            // Step 2: Fetch Opening (previous day's closing) - only Hyperpure vendor
            let totalOpeningValue = 0;
            try {
                const openingRes = await axios.get(`${CLOSING_INVENTORY_API}?branch=${encodeURIComponent(selectedCloudBranch)}&vendor=Hyperpure&date=${prevDay}`);
                if (openingRes.data?.data?.total_value) {
                    totalOpeningValue = openingRes.data.data.total_value;
                }
            } catch (err) {
                if (err.response?.status !== 404) {
                    console.warn('Failed to fetch opening for Hyperpure:', err);
                }
            }
            setCloudOpeningInventory({ value: totalOpeningValue, loading: false });

            // Step 3: Fetch Closing (current day) - only Hyperpure vendor
            let totalClosingValue = 0;
            try {
                const closingRes = await axios.get(`${CLOSING_INVENTORY_API}?branch=${encodeURIComponent(selectedCloudBranch)}&vendor=Hyperpure&date=${selectedCloudDate}`);
                if (closingRes.data?.data?.total_value) {
                    totalClosingValue = closingRes.data.data.total_value;
                }
            } catch (err) {
                if (err.response?.status !== 404) {
                    console.warn('Failed to fetch closing for Hyperpure:', err);
                }
            }
            setCloudClosingInventory({ value: totalClosingValue, loading: false });

            // Step 4: Fetch PO (all vendors selected) - using Dashboard API
            console.log('🛒 Fetching PO from Dashboard API:', {
                api: DASHBOARD_API,
                branch: selectedCloudBranch,
                date: selectedCloudDate,
                vendor: 'All'
            });

            const poRes = await axios.get(DASHBOARD_API, {
                params: {
                    user_email: USER_EMAIL,
                    branch: selectedCloudBranch,
                    start: selectedCloudDate,
                    end: selectedCloudDate,
                    vendor: 'All'
                }
            });
            const purchasesValue = poRes.data?.grand_total || 0;
            console.log('✅ PO Response:', { grand_total: purchasesValue, raw: poRes.data });
            setCloudPurchases({ value: purchasesValue, loading: false });

            // Step 5: Fetch Sales from unified food costing API (same as Rista)
            const ristaBranchCode = CLOUD_KITCHEN_TO_RISTA[selectedCloudBranch];
            console.log('🍔 Fetching Sales:', {
                cloudBranch: selectedCloudBranch,
                ristaBranchCode,
                date: selectedCloudDate
            });

            if (!ristaBranchCode) {
                console.warn(`No Rista branch mapping found for cloud kitchen: ${selectedCloudBranch}`);
                setCloudSales({ value: 0, orders: 0, grossSale: 0, gst: 0, discounts: 0, packings: 0, loading: false });
            } else {
                try {
                    const salesData = await ristaService.fetchFoodCostingDaily(ristaBranchCode, selectedCloudDate);
                    console.log('✅ Sales Response:', salesData);

                    const salesInfo = salesData?.sales || {};

                    const grossSale = salesInfo.grossSale || 0;
                    const gst = salesInfo.gstOnOrder || 0;

                    setCloudSales({
                        value: grossSale,
                        orders: salesInfo.noOfOrders || 0,
                        grossSale: grossSale,
                        gst: gst,
                        discounts: salesInfo.discounts || 0,
                        packings: salesInfo.packings || 0,
                        loading: false
                    });
                } catch (err) {
                    console.error(`❌ Failed to fetch sales for ${ristaBranchCode}:`, err);
                    setCloudSales({ value: 0, orders: 0, grossSale: 0, gst: 0, discounts: 0, packings: 0, loading: false });
                }
            }

            console.log('Cloud kitchen data fetched successfully');
        } catch (error) {
            console.error('Error fetching cloud kitchen data:', error);
            showMessage('error', 'Failed to fetch cloud kitchen data. Check console for details.');

            // Set failed states
            setCloudOpeningInventory({ value: 0, loading: false });
            setCloudClosingInventory({ value: 0, loading: false });
            setCloudPurchases({ value: 0, loading: false });
            setCloudSales({ value: 0, orders: 0, loading: false });
        } finally {
            setCloudLoading(false);
        }
    };

    // Auto-calculate cloud kitchen results
    useEffect(() => {
        if (cloudOpeningInventory && cloudClosingInventory && cloudPurchases && cloudSales &&
            !cloudOpeningInventory.loading && !cloudClosingInventory.loading && !cloudPurchases.loading && !cloudSales.loading) {
            autoCalculateCloud();
        }
    }, [cloudOpeningInventory, cloudClosingInventory, cloudPurchases, cloudSales]);

    const autoCalculateCloud = () => {
        if (!cloudOpeningInventory?.value || !cloudClosingInventory?.value || !cloudPurchases?.value || !cloudSales?.value) {
            return;
        }

        const opening = parseFloat(cloudOpeningInventory.value);
        const closing = parseFloat(cloudClosingInventory.value);
        const purchaseAmount = parseFloat(cloudPurchases.value);
        const grossSale = parseFloat(cloudSales.value);
        const gst = parseFloat(cloudSales.gst || 0);

        const dailyCogs = opening + purchaseAmount - closing;
        const salesBase = grossSale;
        const foodCostPercentage = salesBase > 0 ? (dailyCogs / salesBase) * 100 : 0;

        const calculationResults = {
            success: true,
            calculations: {
                openingInventory: opening,
                closingInventory: closing,
                purchases: purchaseAmount,
                dailyCogs: dailyCogs,
                netSales: netSales,
                salesBase: salesBase,
                foodCostPercentage: foodCostPercentage
            },
            salesDetails: {
                ordersCount: cloudSales.orders || 0,
                grossSale: grossSale,
                gst: gst,
                discounts: parseFloat(cloudSales.discounts || 0),
                packings: parseFloat(cloudSales.packings || 0),
                netSale: grossSale
            },
            status: {
                withinTarget: foodCostPercentage <= 25,
                message: foodCostPercentage <= 25 ? 'Within Target ✓' : 'Above Target ⚠'
            },
            metadata: {
                branch: selectedCloudBranch,
                date: selectedCloudDate
            }
        };

        setCloudResults(calculationResults);
        console.log('Cloud kitchen auto-calculation completed:', calculationResults);
    };
    const fetchAutomaticData = async () => {
        if (!selectedBranchId || !selectedBranchKey || !selectedDate) {
            return;
        }

        setLoading(true);
        setMessage({ type: '', text: '' });

        // Initialize with loading states
        setOpeningInventory({ value: 0, loading: true });
        setClosingInventory({ value: 0, loading: true });
        setPurchases({ value: 0, loading: true });
        setSales({ value: 0, orders: 0, loading: true });

        try {
            // Unified backend endpoint: food-costing
            console.log('Fetching unified food costing for', selectedBranchId, selectedDate)
            const costing = await ristaService.fetchFoodCostingDaily(selectedBranchId, selectedDate)

            const openingValue = costing?.opening?.totalAmount || 0
            const closingValue = costing?.closing?.totalAmount || 0
            const purchasesValue = costing?.purchases?.totalAmount || 0
            const salesData = costing?.sales || {}
            const netSales = salesData.netSale || 0
            const orders = salesData.noOfOrders || 0
            const grossSale = salesData.grossSale || 0
            const gst = salesData.gstOnOrder || 0
            const discounts = salesData.discounts || 0
            const packings = salesData.packings || 0

            setOpeningInventory({ value: openingValue, loading: false })
            setClosingInventory({ value: closingValue, loading: false })
            setPurchases({ value: purchasesValue, loading: false })
            setSales({
                value: grossSale,
                orders,
                grossSale,
                gst,
                discounts,
                packings,
                loading: false
            })
            console.log('Food costing fetched:', costing)

        } catch (error) {
            console.error('Error fetching automatic data:', error);
            showMessage('error', 'Failed to fetch some data. Check console for details.');

            // Set failed states
            setOpeningInventory({ value: 0, loading: false });
            setClosingInventory({ value: 0, loading: false });
            setPurchases({ value: 0, loading: false });
            setSales({ value: 0, orders: 0, loading: false });
        } finally {
            setLoading(false);
        }
    };

    const autoCalculate = () => {
        // Check if all data is available
        if (!openingInventory?.value || !closingInventory?.value || !purchases?.value || !sales?.value) {
            console.log('Not all data available for calculation');
            return;
        }

        const opening = parseFloat(openingInventory.value);
        const closing = parseFloat(closingInventory.value);
        const purchaseAmount = parseFloat(purchases.value);
        const grossSale = parseFloat(sales.value);
        const gst = parseFloat(sales.gst || 0);
        const discounts = parseFloat(sales.discounts || 0);
        const packings = parseFloat(sales.packings || 0);

        // Calculate COGS: Opening + Purchases - Closing
        const dailyCogs = opening + purchaseAmount - closing;

        // Calculate base for Food Cost %: Gross Sale
        const salesBase = grossSale;

        // Calculate Food Cost %: (COGS / Gross Sale) × 100
        const foodCostPercentage = salesBase > 0 ? (dailyCogs / salesBase) * 100 : 0;

        const calculationResults = {
            success: true,
            calculations: {
                openingInventory: opening,
                closingInventory: closing,
                purchases: purchaseAmount,
                dailyCogs: dailyCogs,
                netSales: grossSale,
                salesBase: salesBase,
                foodCostPercentage: foodCostPercentage
            },
            salesDetails: {
                ordersCount: sales.orders || 0,
                grossSale: grossSale,
                gst: gst,
                discounts: discounts,
                packings: packings,
                netSale: grossSale
            },
            status: {
                withinTarget: foodCostPercentage <= 25,
                message: foodCostPercentage <= 25 ? 'Within Target ✓' : 'Above Target ⚠'
            },
            metadata: {
                branch: selectedBranch,
                date: selectedDate
            }
        };

        setResults(calculationResults);
        console.log('Auto-calculation completed:', calculationResults);
    };

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    };

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return '₹0.00';
        return `₹${parseFloat(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getOpeningDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        // If Monday (weekday 1), go back 2 days to Saturday
        // Otherwise go back 1 day
        const daysToSubtract = date.getDay() === 1 ? 2 : 1;
        const openingDate = new Date(date);
        openingDate.setDate(date.getDate() - daysToSubtract);
        return openingDate.toISOString().split('T')[0];
    };

    const getStatusColor = (percentage) => {
        return percentage <= 25 ? '#10b981' : '#ef4444';
    };

    const getStatusBgColor = (percentage) => {
        return percentage <= 25 ? '#d1fae5' : '#fee2e2';
    };

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '20px' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    padding: '24px',
                    borderRadius: '12px',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}>
                    <div style={{
                        background: 'rgba(255,255,255,0.2)',
                        width: '56px',
                        height: '56px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.3)'
                    }}>
                        <div style={{
                            color: '#fff',
                            fontSize: '24px',
                            fontWeight: '700'
                        }}>
                            %
                        </div>
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '26px', color: '#fff', fontWeight: '700' }}>
                            Daily Food Costing
                        </h1>
                        <p style={{ margin: '4px 0 0 0', color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>
                            Track daily COGS and food cost percentage (Target: 25%)
                        </p>
                    </div>
                </div>

                {/* Message Banner */}
                {message.text && (
                    <div style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        background: message.type === 'success' ? '#d1fae5' : '#fee2e2',
                        color: message.type === 'success' ? '#065f46' : '#991b1b',
                        border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`
                    }}>
                        {message.text}
                    </div>
                )}

                {/* ============ CLOUD KITCHEN SECTION ============ */}
                <div style={{
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    padding: '16px 24px',
                    borderRadius: '12px 12px 0 0',
                    marginBottom: '0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <div style={{ color: '#fff', fontSize: '20px' }}>☁️</div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#fff', fontWeight: '600' }}>
                        Cloud Kitchen Food Costing
                    </h2>
                </div>

                <div style={{
                    background: '#fff',
                    borderRadius: '0 0 12px 12px',
                    padding: '24px',
                    marginBottom: '32px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                    {/* Cloud Kitchen Controls */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '16px', marginBottom: '24px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                                Cloud Branch
                            </label>
                            <select
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '2px solid #e5e7eb',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    color: '#1f2937',
                                    background: '#fff'
                                }}
                                value={selectedCloudBranch}
                                onChange={(e) => {
                                    setSelectedCloudBranch(e.target.value);
                                    setCloudResults(null);
                                }}
                            >
                                <option value="">Select cloud branch</option>
                                {cloudBranches.map((branch) => (
                                    <option key={branch} value={branch}>
                                        {branch}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                                Date
                            </label>
                            <input
                                id="cloudDailyDatePicker"
                                type="text"
                                placeholder="YYYY-MM-DD"
                                readOnly
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '2px solid #e5e7eb',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    color: '#1f2937',
                                    background: '#fff',
                                    cursor: 'pointer'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button
                                onClick={fetchCloudKitchenData}
                                disabled={!selectedCloudBranch || !selectedCloudDate || cloudLoading}
                                style={{
                                    padding: '10px 24px',
                                    background: (!selectedCloudBranch || !selectedCloudDate || cloudLoading)
                                        ? '#d1d5db'
                                        : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    cursor: (!selectedCloudBranch || !selectedCloudDate || cloudLoading) ? 'not-allowed' : 'pointer',
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {cloudLoading ? 'Fetching...' : 'Fetch Cloud Data'}
                            </button>
                        </div>
                    </div>

                    {/* Cloud Kitchen Data Display */}
                    {(cloudOpeningInventory || cloudClosingInventory || cloudPurchases || cloudSales) && (
                        <>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: '16px',
                                marginBottom: '24px'
                            }}>
                                {/* Opening */}
                                <div style={{
                                    padding: '16px',
                                    background: '#f0f9ff', // much lighter blue
                                    borderRadius: '8px',
                                    border: '1px solid #bae6fd' // much lighter border
                                }}>
                                    <div style={{ fontSize: '12px', color: '#000', fontWeight: '600', marginBottom: '8px' }}>
                                        Opening Inventory
                                        <div style={{ fontSize: '10px', color: '#000', marginTop: '2px' }}>
                                            (closing of {getOpeningDate(selectedCloudDate)})
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#000' }}>
                                        {cloudOpeningInventory?.loading ? 'Loading...' : `₹${cloudOpeningInventory?.value?.toFixed(2) || '0.00'}`}
                                    </div>
                                </div>

                                {/* Closing */}
                                <div style={{
                                    padding: '16px',
                                    background: '#f0f9ff', // much lighter blue
                                    borderRadius: '8px',
                                    border: '1px solid #bae6fd' // much lighter border
                                }}>
                                    <div style={{ fontSize: '12px', color: '#000', fontWeight: '600', marginBottom: '8px' }}>
                                        Closing Inventory
                                        <div style={{ fontSize: '10px', color: '#000', marginTop: '2px' }}>
                                            (closing on {selectedCloudDate})
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#000' }}>
                                        {cloudClosingInventory?.loading ? 'Loading...' : `₹${cloudClosingInventory?.value?.toFixed(2) || '0.00'}`}
                                    </div>
                                </div>

                                {/* Purchases */}
                                <div style={{
                                    padding: '16px',
                                    background: '#f0f9ff', // much lighter blue
                                    borderRadius: '8px',
                                    border: '1px solid #bae6fd' // much lighter border
                                }}>
                                    <div style={{ fontSize: '12px', color: '#000', fontWeight: '600', marginBottom: '8px' }}>
                                        Purchases
                                        <div style={{ fontSize: '10px', color: '#000', marginTop: '2px' }}>
                                            (PO on {selectedCloudDate})
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#000' }}>
                                        {cloudPurchases?.loading ? 'Loading...' : `₹${cloudPurchases?.value?.toFixed(2) || '0.00'}`}
                                    </div>
                                </div>

                                {/* Sales */}
                                <div style={{
                                    padding: '16px',
                                    background: '#f0f9ff', // much lighter blue
                                    borderRadius: '8px',
                                    border: '1px solid #bae6fd' // much lighter border
                                }}>
                                    <div style={{ fontSize: '12px', color: '#000', fontWeight: '600', marginBottom: '8px' }}>
                                        Sales Summary
                                    </div>
                                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#000' }}>
                                        {cloudSales?.loading ? 'Loading...' : `₹${cloudSales?.value?.toFixed(2) || '0.00'}`}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#000', marginTop: '4px' }}>
                                        {cloudSales?.orders || 0} orders
                                    </div>
                                </div>
                            </div>

                            {/* Cloud Results */}
                            {cloudResults && cloudResults.success && (
                                <div style={{
                                    marginTop: '24px',
                                    padding: '20px',
                                    background: '#fafafa',
                                    borderRadius: '12px',
                                    border: '2px solid #e5e7eb'
                                }}>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '2fr 1fr',
                                        gap: '24px'
                                    }}>
                                        {/* Left: Calculations */}
                                        <div>
                                            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#374151', fontWeight: '600' }}>
                                                📊 Calculation Breakdown
                                            </h3>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#fff', borderRadius: '6px' }}>
                                                    <span style={{ color: '#6b7280' }}>Opening Inventory:</span>
                                                    <span style={{ fontWeight: '600', color: '#1f2937' }}>₹{cloudResults.calculations.openingInventory.toFixed(2)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#fff', borderRadius: '6px' }}>
                                                    <span style={{ color: '#6b7280' }}>+ Purchases:</span>
                                                    <span style={{ fontWeight: '600', color: '#1f2937' }}>₹{cloudResults.calculations.purchases.toFixed(2)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#fff', borderRadius: '6px' }}>
                                                    <span style={{ color: '#6b7280' }}>- Closing Inventory:</span>
                                                    <span style={{ fontWeight: '600', color: '#1f2937' }}>₹{cloudResults.calculations.closingInventory.toFixed(2)}</span>
                                                </div>
                                                <div style={{ height: '1px', background: '#d1d5db', margin: '4px 0' }}></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#fff', borderRadius: '6px' }}>
                                                    <span style={{ color: '#374151', fontWeight: '600' }}>Daily COGS:</span>
                                                    <span style={{ fontWeight: '700', color: '#f97316', fontSize: '16px' }}>₹{cloudResults.calculations.dailyCogs.toFixed(2)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#fff', borderRadius: '6px' }}>
                                                    <span style={{ color: '#6b7280' }}>Gross Sale:</span>
                                                    <span style={{ fontWeight: '600', color: '#1f2937' }}>₹{cloudResults.salesDetails.grossSale.toFixed(2)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#fff', borderRadius: '6px' }}>
                                                    <span style={{ color: '#6b7280' }}>- GST:</span>
                                                    <span style={{ fontWeight: '600', color: '#1f2937' }}>₹{cloudResults.salesDetails.gst.toFixed(2)}</span>
                                                </div>
                                                <div style={{ height: '1px', background: '#d1d5db', margin: '4px 0' }}></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#fff', borderRadius: '6px' }}>
                                                    <span style={{ color: '#374151', fontWeight: '600' }}>Sales Base:</span>
                                                    <span style={{ fontWeight: '700', color: '#10b981', fontSize: '16px' }}>₹{cloudResults.calculations.salesBase.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Food Cost % */}
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            padding: '24px',
                                            background: getStatusBgColor(cloudResults.calculations.foodCostPercentage),
                                            borderRadius: '12px',
                                            border: `2px solid ${getStatusColor(cloudResults.calculations.foodCostPercentage)}`
                                        }}>
                                            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', textAlign: 'center' }}>
                                                Food Cost %
                                            </div>
                                            <div style={{
                                                fontSize: '48px',
                                                fontWeight: '700',
                                                color: getStatusColor(cloudResults.calculations.foodCostPercentage),
                                                marginBottom: '8px'
                                            }}>
                                                {cloudResults.calculations.foodCostPercentage.toFixed(2)}%
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '12px', textAlign: 'center' }}>
                                                COGS ÷ (Gross Sale - GST) × 100
                                            </div>
                                            <div style={{
                                                fontSize: '14px',
                                                fontWeight: '600',
                                                color: getStatusColor(cloudResults.calculations.foodCostPercentage)
                                            }}>
                                                {cloudResults.status.message}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ============ RISTA BRANCHES SECTION ============ */}
                <div style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    padding: '16px 24px',
                    borderRadius: '12px 12px 0 0',
                    marginBottom: '0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <div style={{ color: '#fff', fontSize: '20px' }}>🏪</div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#fff', fontWeight: '600' }}>
                        Rista Branches Food Costing
                    </h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Left Column - Selection Controls */}
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h2 style={{ marginTop: 0, fontSize: '18px', color: '#1e293b', fontWeight: '600' }}>
                            Select Date & Branch
                        </h2>

                        {/* Branch Selection */}
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: '#475569', fontSize: '14px', fontWeight: '500' }}>
                                Branch *
                            </label>
                            <select
                                value={selectedBranch}
                                onChange={(e) => {
                                    const branchName = e.target.value;
                                    const branch = branches.find(b => b.name === branchName);
                                    setSelectedBranch(branchName);
                                    setSelectedBranchId(branch?.code || '');
                                    setSelectedBranchKey(branch?.key || '');
                                    setResults(null);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    color: '#1e293b'
                                }}
                            >
                                <option value="">Select Branch</option>
                                {branches.map((branch) => (
                                    <option key={branch.code} value={branch.name}>
                                        {branch.name} ({branch.code})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Date Selection */}
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', color: '#475569', fontSize: '14px', fontWeight: '500' }}>
                                Date *
                            </label>
                            <input
                                type="text"
                                id="dailyFoodCostingDatePicker"
                                value={selectedDate}
                                readOnly
                                placeholder="Select date"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    color: '#1e293b',
                                    cursor: 'pointer'
                                }}
                            />
                        </div>

                        {/* Fetch Button */}
                        <div style={{ marginBottom: '20px' }}>
                            <button
                                onClick={fetchAutomaticData}
                                disabled={!selectedBranchId || !selectedDate || loading}
                                style={{
                                    width: '100%',
                                    padding: '12px 20px',
                                    background: (!selectedBranchId || !selectedDate || loading) ? '#cbd5e1' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    cursor: (!selectedBranchId || !selectedDate || loading) ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: (!selectedBranchId || !selectedDate || loading) ? 'none' : '0 4px 6px rgba(102, 126, 234, 0.3)'
                                }}
                            >
                                {loading ? 'Fetching Data...' : 'Fetch Food Costing Data'}
                            </button>
                        </div>

                        {/* Auto-Fetched Data Display */}
                        <div style={{
                            background: '#f8fafc',
                            padding: '16px',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '14px', color: '#64748b', fontWeight: '600' }}>
                                Auto-Fetched Data
                            </h3>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ color: '#64748b', fontSize: '13px' }}>
                                    Opening Inventory:
                                    {selectedDate && <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '4px' }}>(closing of {getOpeningDate(selectedDate)})</span>}
                                </span>
                                <span style={{ color: '#1e293b', fontSize: '13px', fontWeight: '600' }}>
                                    {openingInventory?.loading ? 'Loading...' : formatCurrency(openingInventory?.value)}
                                </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ color: '#64748b', fontSize: '13px' }}>
                                    Purchases:
                                    {selectedDate && <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '4px' }}>(PO on {selectedDate})</span>}
                                </span>
                                <span style={{ color: '#1e293b', fontSize: '13px', fontWeight: '600' }}>
                                    {purchases?.loading ? 'Loading...' : formatCurrency(purchases?.value)}
                                </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ color: '#64748b', fontSize: '13px' }}>
                                    Closing Inventory:
                                    {selectedDate && <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '4px' }}>(closing on {selectedDate})</span>}
                                </span>
                                <span style={{ color: '#1e293b', fontSize: '13px', fontWeight: '600' }}>
                                    {closingInventory?.loading ? 'Loading...' : formatCurrency(closingInventory?.value)}
                                </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748b', fontSize: '13px' }}>Sales (Today):</span>
                                <span style={{ color: '#1e293b', fontSize: '13px', fontWeight: '600' }}>
                                    {sales?.loading ? 'Loading...' : `${formatCurrency(sales?.value)} (${sales?.orders || 0} orders)`}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Results */}
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h2 style={{ marginTop: 0, fontSize: '18px', color: '#1e293b', fontWeight: '600', marginBottom: '20px' }}>
                            Calculation Results
                        </h2>

                        {!results ? (
                            <div style={{
                                textAlign: 'center',
                                padding: '60px 20px',
                                color: '#94a3b8'
                            }}>
                                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📈</div>
                                <p style={{ margin: 0, fontSize: '15px' }}>
                                    Select a branch and date to auto-fetch and calculate results
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* COGS Calculation Breakdown */}
                                <div style={{
                                    background: '#f8fafc',
                                    padding: '16px',
                                    borderRadius: '8px',
                                    marginBottom: '20px',
                                    border: '1px solid #e2e8f0'
                                }}>
                                    <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '14px', color: '#64748b', fontWeight: '600' }}>
                                        COGS Calculation
                                    </h3>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ color: '#64748b', fontSize: '13px' }}>Opening Inventory</span>
                                        <span style={{ color: '#1e293b', fontSize: '13px', fontWeight: '600' }}>
                                            {formatCurrency(results.calculations.openingInventory)}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ color: '#10b981', fontSize: '13px' }}>+ Purchases</span>
                                        <span style={{ color: '#10b981', fontSize: '13px', fontWeight: '600' }}>
                                            {formatCurrency(results.calculations.purchases)}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                        <span style={{ color: '#ef4444', fontSize: '13px' }}>- Closing Inventory</span>
                                        <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600' }}>
                                            {formatCurrency(results.calculations.closingInventory)}
                                        </span>
                                    </div>

                                    <div style={{
                                        borderTop: '2px solid #e2e8f0',
                                        paddingTop: '12px',
                                        display: 'flex',
                                        justifyContent: 'space-between'
                                    }}>
                                        <span style={{ color: '#1e293b', fontSize: '14px', fontWeight: '700' }}>Daily COGS</span>
                                        <span style={{ color: '#1e293b', fontSize: '14px', fontWeight: '700' }}>
                                            {formatCurrency(results.calculations.dailyCogs)}
                                        </span>
                                    </div>
                                </div>

                                {/* Sales Info */}
                                <div style={{
                                    background: '#f8fafc',
                                    padding: '16px',
                                    borderRadius: '8px',
                                    marginBottom: '20px',
                                    border: '1px solid #e2e8f0'
                                }}>
                                    <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '14px', color: '#64748b', fontWeight: '600' }}>
                                        Sales Summary
                                    </h3>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ color: '#64748b', fontSize: '13px' }}>Total Orders</span>
                                        <span style={{ color: '#1e293b', fontSize: '13px', fontWeight: '600' }}>
                                            {results.salesDetails.ordersCount}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ color: '#64748b', fontSize: '13px' }}>Gross Sale</span>
                                        <span style={{ color: '#1e293b', fontSize: '13px', fontWeight: '600' }}>
                                            {formatCurrency(results.salesDetails.grossSale)}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#64748b', fontSize: '13px' }}>GST</span>
                                        <span style={{ color: '#1e293b', fontSize: '13px', fontWeight: '600' }}>
                                            {formatCurrency(results.salesDetails.gst)}
                                        </span>
                                    </div>
                                </div>

                                {/* Food Cost Percentage - Large Display */}
                                <div style={{
                                    background: getStatusBgColor(results.calculations.foodCostPercentage),
                                    padding: '24px',
                                    borderRadius: '12px',
                                    textAlign: 'center',
                                    border: `2px solid ${getStatusColor(results.calculations.foodCostPercentage)}`
                                }}>
                                    <div style={{ color: '#64748b', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>
                                        FOOD COST PERCENTAGE
                                    </div>
                                    <div style={{
                                        fontSize: '48px',
                                        fontWeight: '700',
                                        color: getStatusColor(results.calculations.foodCostPercentage),
                                        marginBottom: '8px'
                                    }}>
                                        {results.calculations.foodCostPercentage.toFixed(2)}%
                                    </div>
                                    <div style={{
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        color: getStatusColor(results.calculations.foodCostPercentage)
                                    }}>
                                        {results.status.message}
                                    </div>
                                    <div style={{
                                        fontSize: '12px',
                                        color: '#64748b',
                                        marginTop: '8px'
                                    }}>
                                        Target: 25% or below
                                    </div>
                                    <div style={{
                                        fontSize: '11px',
                                        color: '#94a3b8',
                                        marginTop: '12px',
                                        fontStyle: 'italic'
                                    }}>
                                        COGS ÷ (Gross Sale - GST) × 100
                                    </div>
                                </div>

                                {/* Formula Reference */}
                                <div style={{
                                    marginTop: '20px',
                                    padding: '12px',
                                    background: '#f8fafc',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    color: '#64748b',
                                    textAlign: 'center'
                                }}>

                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Info Cards */}
                <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                    <div style={{
                        background: '#fff',
                        padding: '16px',
                        borderRadius: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        borderLeft: '4px solid #3b82f6'
                    }}>
                        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>💡 Auto-Fetch</div>
                        <div style={{ fontSize: '13px', color: '#1e293b' }}>
                            All data is automatically fetched from unified API endpoint
                        </div>
                    </div>

                    <div style={{
                        background: '#fff',
                        padding: '16px',
                        borderRadius: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        borderLeft: '4px solid #10b981'
                    }}>
                        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>✅ Channels Included</div>
                        <div style={{ fontSize: '13px', color: '#1e293b' }}>
                            Swiggy, Zomato, Takeaway, Corporate Orders
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
