import React from 'react'
import MetricChart from './MetricChart.jsx'
import { METRICS_CONFIG } from '../../utils/constants'

const ChartsGrid = ({ type, data, groupBy, selectedGraphs = [] }) => {
    // Filter metrics based on selectedGraphs
    const metricsToDisplay = selectedGraphs.length > 0 
        ? METRICS_CONFIG.filter(metric => selectedGraphs.includes(metric.key))
        : METRICS_CONFIG

    if (type === 'comparison') {
        return (
            <div className="charts-grid">
                {metricsToDisplay.map(metric => (
                    <MetricChart
                        key={metric.key}
                        metric={metric}
                        type="comparison"
                        data={data}
                    />
                ))}
            </div>
        )
    }

    if (type === 'timeSeries') {
        const periods = Object.keys(data).sort()

        return (
            <div className="charts-grid">
                {metricsToDisplay.map(metric => (
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
        )
    }

    return null
}

export default ChartsGrid