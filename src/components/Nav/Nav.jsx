import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import './Nav.css';

export default function Nav() {
    const location = useLocation();
    const queryClient = useQueryClient();
    const isCostingModule = location.pathname.startsWith('/costing');

    const handleClearCache = () => {
        queryClient.clear();
        console.log('[CACHE] All cached data cleared');
        alert('Cache cleared successfully!');
    };

    return (
        <nav className="main-nav">
            <div className="nav-brand">
                <span className="nav-title">Swap Analytics</span>
            </div>

            <div className="nav-links">
                <NavLink
                    to="/"
                    className={({ isActive }) => `nav-link ${isActive && !isCostingModule ? 'active' : ''}`}
                    end
                >
                    <span>Sales Analyzer</span>
                </NavLink>

                <NavLink
                    to="/costing"
                    className={({ isActive }) => `nav-link ${isActive || isCostingModule ? 'active' : ''}`}
                >
                    <span>Costing Module</span>
                </NavLink>

                <button
                    onClick={handleClearCache}
                    className="nav-button clear-cache-btn"
                    title="Clear all cached data"
                >
                    Clear Cache
                </button>
            </div>

            {/* Sub-navigation for Costing Module */}
            {isCostingModule && (
                <div className="nav-subnav">
                    <NavLink
                        to="/costing"
                        className={({ isActive }) => `subnav-link ${isActive ? 'active' : ''}`}
                        end
                    >
                        Dashboard
                    </NavLink>
                    <NavLink
                        to="/costing/upload"
                        className={({ isActive }) => `subnav-link ${isActive ? 'active' : ''}`}
                    >
                        Upload Invoice
                    </NavLink>
                    <NavLink
                        to="/costing/manual-entry"
                        className={({ isActive }) => `subnav-link ${isActive ? 'active' : ''}`}
                    >
                        Manual Entry
                    </NavLink>
                    <NavLink
                        to="/costing/closing-inventory"
                        className={({ isActive }) => `subnav-link ${isActive ? 'active' : ''}`}
                    >
                        Closing Inventory
                    </NavLink>
                    <NavLink
                        to="/costing/daily-food-costing"
                        className={({ isActive }) => `subnav-link ${isActive ? 'active' : ''}`}
                    >
                        Daily Food Costing
                    </NavLink>
                </div>
            )}
        </nav>
    );
}
