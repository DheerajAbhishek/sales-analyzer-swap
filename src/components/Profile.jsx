import React from "react";
import { authService } from "../services/authService";

const Profile = ({ user, onLogout }) => {
  const handleLogout = () => {
    authService.logout();
    if (onLogout) onLogout();
  };

  return (
    <div className="profile-menu">
      <div className="profile-info">
        <strong>
          {user?.businessName || user?.restaurantName || user?.businessEmail}
        </strong>
        <div className="profile-email">{user?.businessEmail}</div>
      </div>
      <div className="profile-actions">
        <button className="btn-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default Profile;
