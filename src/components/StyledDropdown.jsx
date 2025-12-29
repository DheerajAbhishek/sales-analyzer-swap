import { useState, useEffect, useRef } from 'react';

/**
 * StyledDropdown - A custom styled single-select dropdown (similar to vendor dropdown in dashboard)
 * @param {Array} items - Array of items to display (strings)
 * @param {String} selectedItem - Currently selected item
 * @param {Function} onChange - Callback when selection changes (receives selected item string)
 * @param {String} label - Label text for the dropdown
 * @param {String} placeholder - Placeholder text when nothing is selected
 * @param {Boolean} allowCustom - Allow adding custom items
 * @param {String} customValue - Value of custom input if allowCustom is true
 * @param {Function} onCustomChange - Callback for custom input changes
 */
export default function StyledDropdown({
    items = [],
    selectedItem = "",
    onChange,
    label = "Select Item",
    placeholder = "Select...",
    allowCustom = false,
    customValue = "",
    onCustomChange = null
}) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const isCustomMode = selectedItem === "__new__";

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

    const handleSelectItem = (item) => {
        onChange(item);
        setIsOpen(false);
    };

    const getDisplayText = () => {
        if (!selectedItem || selectedItem === "") {
            return placeholder;
        }
        if (isCustomMode && customValue) {
            return customValue;
        }
        if (isCustomMode) {
            return `➕ Add New ${label}`;
        }
        return selectedItem;
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
                <span style={{ color: !selectedItem || selectedItem === "" ? '#9ca3af' : '#1f2937' }}>
                    {getDisplayText()}
                </span>
                <span style={{ color: '#6b7280', fontSize: 12 }}>▼</span>
            </div>

            {/* Custom Input Field (shown when "__new__" is selected) */}
            {isCustomMode && allowCustom && onCustomChange && (
                <input
                    type="text"
                    placeholder={`Enter ${label.toLowerCase()} name`}
                    value={customValue}
                    onChange={(e) => onCustomChange(e.target.value)}
                    style={{
                        marginTop: 10,
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "2px solid #10b981",
                        fontSize: 14,
                        background: "#fff",
                        outline: "none",
                        boxSizing: "border-box"
                    }}
                    onClick={(e) => e.stopPropagation()}
                />
            )}

            {/* Dropdown Menu */}
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
                    {/* Regular Items */}
                    {items.map((item) => (
                        <div
                            key={item}
                            onClick={() => handleSelectItem(item)}
                            style={{
                                padding: '10px 14px',
                                cursor: 'pointer',
                                background: selectedItem === item ? '#eff6ff' : 'transparent',
                                fontSize: 14,
                                color: '#1f2937',
                                transition: 'background 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                                if (selectedItem !== item) {
                                    e.currentTarget.style.background = '#f9fafb';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (selectedItem !== item) {
                                    e.currentTarget.style.background = 'transparent';
                                } else {
                                    e.currentTarget.style.background = '#eff6ff';
                                }
                            }}
                        >
                            {item}
                        </div>
                    ))}

                    {/* Add Custom Item Option */}
                    {allowCustom && (
                        <div
                            onClick={() => handleSelectItem("__new__")}
                            style={{
                                padding: '10px 14px',
                                cursor: 'pointer',
                                borderTop: '1px solid #e5e7eb',
                                background: isCustomMode ? '#f0fdf4' : '#f0fdf4',
                                fontSize: 14,
                                fontWeight: 600,
                                color: '#10b981',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                transition: 'background 0.15s ease'
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
