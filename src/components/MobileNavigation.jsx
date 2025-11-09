import React, { useState } from "react";

const MobileNavigation = ({
  user,
  onProfileClick,
  onHomeClick,
  onLogout,
  children,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <div className="mobile-navigation">
      <div className="mobile-nav-header">
        <div className="mobile-nav-brand">
          <span className="brand">Sales Insights</span>
        </div>
        <button
          className="mobile-menu-toggle"
          onClick={toggleMenu}
          aria-label="Toggle navigation menu"
        >
          <span className={`hamburger ${isMenuOpen ? "active" : ""}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>

      <div className={`mobile-nav-menu ${isMenuOpen ? "open" : ""}`}>
        <div className="mobile-nav-user">
          {user?.restaurantName && (
            <span className="mobile-user-name">{user.restaurantName}</span>
          )}
        </div>

        <div className="mobile-nav-actions">
          <button
            className="mobile-nav-button"
            onClick={() => {
              onHomeClick && onHomeClick();
              setIsMenuOpen(false);
            }}
          >
            <span className="nav-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
              </svg>
            </span>
            Home
          </button>

          <button
            className="mobile-nav-button"
            onClick={() => {
              onProfileClick && onProfileClick();
              setIsMenuOpen(false);
            }}
          >
            <span className="nav-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </span>
            Profile
          </button>

          <button
            className="mobile-nav-button logout"
            onClick={() => {
              onLogout && onLogout();
              setIsMenuOpen(false);
            }}
          >
            <span className="nav-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
              </svg>
            </span>
            Logout
          </button>
        </div>

        {children && <div className="mobile-nav-extra">{children}</div>}
      </div>

      {isMenuOpen && (
        <div
          className="mobile-nav-overlay"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </div>
  );
};

export default MobileNavigation;
