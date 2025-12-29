import { useState, useEffect, useRef } from 'react';

/**
 * MultiSelectDropdown - A reusable multi-select dropdown with checkboxes
 * @param {Array} items - Array of items to display (strings)
 * @param {Array} selectedItems - Array of currently selected items
 * @param {Function} onChange - Callback when selection changes (receives array of selected items)
 * @param {String} label - Label text for the dropdown
 * @param {String} placeholder - Placeholder text when nothing is selected
 * @param {Boolean} allowCustom - Allow adding custom items
 * @param {Function} onCustomAdd - Callback when custom item is added
 */
export default function MultiSelectDropdown({
    items = [],
    selectedItems = [],
    onChange,
    label = "Select Items",
    placeholder = "Select...",
    allowCustom = false,
    onCustomAdd = null
}) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggleItem = (item) => {
        if (selectedItems.includes(item)) {
            onChange(selectedItems.filter(i => i !== item));
        } else {
            onChange([...selectedItems, item]);
        }
    };

    const handleSelectAll = () => {
        if (selectedItems.length === items.length) {
            onChange([]);
        } else {
            onChange([...items]);
        }
    };

    const getDisplayText = () => {
        if (selectedItems.length === 0) {
            return placeholder;
        } else if (selectedItems.length === 1) {
            return selectedItems[0];
        } else if (selectedItems.length === items.length) {
            return `All ${label}s`;
        } else {
            return `${selectedItems.length} ${label}s selected`;
        }
    };

    return (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
            <label style={{
                display: "block",
                marginBottom: 6,
                fontWeight: 600,
                color: "#374151",
                fontSize: 13
            }}>
                {label}
            </label>

            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "2px solid #e5e7eb",
                    fontSize: 14,
                    background: "#fff",
                    cursor: "pointer",
                    outline: "none",
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}
            >
                <span style={{ color: selectedItems.length === 0 ? '#9ca3af' : '#1f2937' }}>
                    {getDisplayText()}
                </span>
                <span style={{ color: '#6b7280' }}>▼</span>
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 1000,
                    maxHeight: 250,
                    overflowY: 'auto'
                }}>
                    {/* Select All */}
                    {items.length > 1 && (
                        <div
                            onClick={handleSelectAll}
                            style={{
                                padding: '10px 14px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #e5e7eb',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                background: selectedItems.length === items.length ? '#eff6ff' : 'transparent',
                                fontSize: 14,
                                fontWeight: 600,
                                color: '#1f2937'
                            }}
                            onMouseEnter={(e) => {
                                if (selectedItems.length !== items.length) {
                                    e.currentTarget.style.background = '#f9fafb';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (selectedItems.length !== items.length) {
                                    e.currentTarget.style.background = 'transparent';
                                } else {
                                    e.currentTarget.style.background = '#eff6ff';
                                }
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={selectedItems.length === items.length}
                                onChange={() => { }}
                                style={{ cursor: 'pointer' }}
                            />
                            <label style={{ cursor: 'pointer', margin: 0 }}>
                                Select All
                            </label>
                        </div>
                    )}

                    {/* Individual Items */}
                    {items.map((item) => (
                        <div
                            key={item}
                            onClick={() => handleToggleItem(item)}
                            style={{
                                padding: '10px 14px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                background: selectedItems.includes(item) ? '#eff6ff' : 'transparent',
                                fontSize: 14,
                                color: '#1f2937'
                            }}
                            onMouseEnter={(e) => {
                                if (!selectedItems.includes(item)) {
                                    e.currentTarget.style.background = '#f9fafb';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!selectedItems.includes(item)) {
                                    e.currentTarget.style.background = 'transparent';
                                } else {
                                    e.currentTarget.style.background = '#eff6ff';
                                }
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={selectedItems.includes(item)}
                                onChange={() => { }}
                                style={{ cursor: 'pointer' }}
                            />
                            <label style={{ cursor: 'pointer', margin: 0 }}>
                                {item}
                            </label>
                        </div>
                    ))}

                    {/* Add Custom Item */}
                    {allowCustom && onCustomAdd && (
                        <div
                            onClick={() => {
                                setIsOpen(false);
                                onCustomAdd();
                            }}
                            style={{
                                padding: '10px 14px',
                                cursor: 'pointer',
                                borderTop: '1px solid #e5e7eb',
                                background: '#f0fdf4',
                                fontSize: 14,
                                fontWeight: 600,
                                color: '#10b981',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#dcfce7';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#f0fdf4';
                            }}
                        >
                            <span>➕</span>
                            <span>Add New {label}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
