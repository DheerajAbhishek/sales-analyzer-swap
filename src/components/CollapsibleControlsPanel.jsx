import React, { useState } from "react";

const CollapsibleControlsPanel = ({
  title = "Controls",
  children,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="controls-panel-mobile">
      <div
        className="controls-panel-header"
        onClick={toggleExpanded}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpanded();
          }
        }}
      >
        <h3>
          <span role="img" aria-label="controls">
            ⚙️
          </span>
          {title}
        </h3>
        <span
          className="controls-panel-icon"
          role="img"
          aria-label={isExpanded ? "collapse" : "expand"}
        >
          ▼
        </span>
      </div>
      <div className={`controls-panel-content ${isExpanded ? "expanded" : ""}`}>
        {children}
      </div>
    </div>
  );
};

export default CollapsibleControlsPanel;
