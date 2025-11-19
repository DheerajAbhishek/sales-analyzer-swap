import React, { useState } from "react";
import { METRICS_CONFIG } from "../../utils/constants";

const ChartFilter = ({ onFilterChange }) => {
  // Initially only grossSale is selected
  const [selectedCharts, setSelectedCharts] = useState(["grossSale"]);
  const [isOpen, setIsOpen] = useState(false);

  const handleToggleChart = (chartKey) => {
    setSelectedCharts((prev) => {
      let newSelection;
      if (prev.includes(chartKey)) {
        // Don't allow deselecting if it's the last one
        if (prev.length === 1) {
          return prev;
        }
        newSelection = prev.filter((key) => key !== chartKey);
      } else {
        newSelection = [...prev, chartKey];
      }
      onFilterChange(newSelection);
      return newSelection;
    });
  };

  const handleSelectAll = () => {
    const allKeys = METRICS_CONFIG.map((metric) => metric.key);
    setSelectedCharts(allKeys);
    onFilterChange(allKeys);
  };

  const handleDeselectAll = () => {
    // Keep at least one selected
    const firstKey = METRICS_CONFIG[0].key;
    setSelectedCharts([firstKey]);
    onFilterChange([firstKey]);
  };

  return (
    <div className="chart-filter-container">
      <div className="chart-filter-header">
        <h3 className="chart-filter-title">
          📊 Chart Filters ({selectedCharts.length}/{METRICS_CONFIG.length})
        </h3>
        <button
          className="chart-filter-toggle"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Collapse filters" : "Expand filters"}
        >
          {isOpen ? "▼" : "▶"}
        </button>
      </div>

      {isOpen && (
        <div className="chart-filter-content">
          <div className="chart-filter-actions">
            <button
              className="filter-action-btn"
              onClick={handleSelectAll}
              disabled={selectedCharts.length === METRICS_CONFIG.length}
            >
              ✓ Select All
            </button>
            <button
              className="filter-action-btn"
              onClick={handleDeselectAll}
              disabled={selectedCharts.length === 1}
            >
              ✗ Clear All
            </button>
          </div>

          <div className="chart-filter-grid">
            {METRICS_CONFIG.map((metric) => (
              <label
                key={metric.key}
                className={`chart-filter-item ${selectedCharts.includes(metric.key) ? "selected" : ""
                  }`}
              >
                <input
                  type="checkbox"
                  checked={selectedCharts.includes(metric.key)}
                  onChange={() => handleToggleChart(metric.key)}
                  disabled={
                    selectedCharts.length === 1 &&
                    selectedCharts.includes(metric.key)
                  }
                />
                <span className="chart-filter-label">{metric.title}</span>
                <span className="chart-filter-checkmark">
                  {selectedCharts.includes(metric.key) ? "✓" : ""}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartFilter;
