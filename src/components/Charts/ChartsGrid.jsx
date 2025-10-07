import React from 'react'
import MetricChart from './MetricChart.jsx'
import { METRICS_CONFIG } from '../../utils/constants'

const ChartsGrid = ({ type, data }) => {
    if (type === 'comparison') {
        return (
            <div className="charts-grid">
                {METRICS_CONFIG.map(metric => (
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
                {METRICS_CONFIG.map(metric => (
                    <MetricChart
                        key={metric.key}
                        metric={metric}
                        type="timeSeries"
                        data={data}
                        periods={periods}
                    />
                ))}
            </div>
        )
    }

    return null
}

export default ChartsGrid