import React from "react";
import MetricChart from "./MetricChart.jsx";
import { METRICS_CONFIG } from "../../utils/constants";

const ChartsGrid = ({ type, data, groupBy, selectedCharts }) => {
  // Filter metrics based on selectedCharts
  const visibleMetrics = selectedCharts
    ? METRICS_CONFIG.filter((metric) => selectedCharts.includes(metric.key))
    : METRICS_CONFIG;

  if (type === "comparison") {
    return (
      <div className="charts-grid">
        {visibleMetrics.map((metric) => (
          <MetricChart
            key={metric.key}
            metric={metric}
            type="comparison"
            data={data}
          />
        ))}
      </div>
    );
  }

  if (type === "timeSeries") {
    const periods = Object.keys(data).sort();

    return (
      <div className="charts-grid">
        {visibleMetrics.map((metric) => (
          <MetricChart
            key={metric.key}
            metric={metric}
            type="timeSeries"
            data={data}
            periods={periods}
            groupBy={groupBy}
          />
        ))}
      </div>
    );
  }

  return null;
};

export default ChartsGrid;
