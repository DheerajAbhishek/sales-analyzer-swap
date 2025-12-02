import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './Nav.css';

export default function Nav() {
    const location = useLocation();
    const isCostingModule = location.pathname.startsWith('/costing');

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
                </div>
            )}
        </nav>
    );
}
