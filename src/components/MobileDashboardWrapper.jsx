import React from "react";
import MobileNavigation from "./MobileNavigation.jsx";
import CollapsibleControlsPanel from "./CollapsibleControlsPanel.jsx";

const MobileDashboardWrapper = ({
  user,
  onLogout,
  onHomeClick,
  onProfileClick,
  controlsContent,
  dashboardContent,
  additionalActions,
}) => {
  return (
    <>
      {/* Mobile Navigation - only visible on mobile */}
      <MobileNavigation
        user={user}
        onLogout={onLogout}
        onHomeClick={onHomeClick}
        onProfileClick={onProfileClick}
      >
        {additionalActions}
      </MobileNavigation>

      {/* Main content with mobile-optimized layout */}
      <div className="main-layout">
        <div className="controls-column">
          {/* Mobile: Collapsible controls */}
          <div className="mobile-only">
            <CollapsibleControlsPanel
              title="Report Controls"
              defaultExpanded={false}
            >
              {controlsContent}
            </CollapsibleControlsPanel>
          </div>

          {/* Desktop: Regular controls */}
          <div className="desktop-only">{controlsContent}</div>
        </div>

        <div className="dashboard-column">{dashboardContent}</div>
      </div>
    </>
  );
};

export default MobileDashboardWrapper;
