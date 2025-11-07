import React, { useEffect, useRef } from 'react'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { CHART_COLORS } from '../../utils/constants'
import {
    formatValue,
    formatChartValue,
    formatWeekPeriod,
    formatMonthPeriod,
} from '../../utils/helpers'

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
)

const MetricChart = ({ metric, type, data, periods = [], groupBy }) => {
    const chartRef = useRef()

    const getChartData = () => {
        if (type === 'comparison') {
            const labels = data.map(item => item.name)
            const values = data.map(item => item.metrics[metric.key] || 0)
            const colors = data.map(item => {
                // Map platform to colors
                if (item.platform === 'zomato') return CHART_COLORS.zomato
                if (item.platform === 'swiggy') return CHART_COLORS.swiggy
                if (item.platform === 'takeaway') return CHART_COLORS.takeaway
                if (item.platform === 'subscription' || item.platform === 'subs') return CHART_COLORS.subscription
                // Fallback to palette colors
                return CHART_COLORS.palette[labels.indexOf(item.name) % CHART_COLORS.palette.length]
            })

            return {
                labels,
                datasets: [{
                    label: metric.title,
                    data: values,
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 2,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            }
        }

        if (type === 'timeSeries') {
            const datasets = []

            // Check what platforms exist in the data
            const samplePeriod = Object.keys(data)[0]
            console.log('🔍 MetricChart timeSeries data:', {
                metric: metric.key,
                samplePeriod,
                allPeriods: Object.keys(data),
                samplePeriodData: data[samplePeriod],
                fullData: data
            })

            if (samplePeriod && data[samplePeriod]) {
                const availablePlatforms = Object.keys(data[samplePeriod]).filter(k => k !== 'period')
                console.log('📊 Available platforms for', metric.key, ':', availablePlatforms)
                console.log('📊 Sample period object keys:', Object.keys(data[samplePeriod]))

                availablePlatforms.forEach(platform => {
                    let color = CHART_COLORS.platform[platform] || CHART_COLORS.primary
                    let label = platform.charAt(0).toUpperCase() + platform.slice(1)

                    // Custom labels for better readability
                    if (platform === 'subs') label = 'Subscription'
                    if (platform === 'takeaway') label = 'Takeaway'

                    console.log('🎨 Creating dataset for platform:', platform, 'with color:', color, 'and label:', label)

                    datasets.push({
                        label: label,
                        data: periods.map(p => data[p]?.[platform]?.[metric.key] || 0),
                        backgroundColor: color + '40', // Add transparency
                        borderColor: color,
                        borderWidth: 3,
                        fill: false,
                        tension: 0.4,
                        pointBackgroundColor: color,
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    })
                })
            }

            console.log('✨ Final datasets for', metric.key, ':', datasets.length, 'datasets')
            return {
                labels: periods.map(period =>
                    groupBy === 'month' ? formatMonthPeriod(period) : formatWeekPeriod(period)
                ),
                datasets: datasets
            }
        }

        return { labels: [], datasets: [] }
    }

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: type === 'timeSeries',
                position: 'top',
                labels: {
                    color: '#0f172a',
                    font: {
                        weight: '600',
                        family: 'Inter, system-ui, sans-serif'
                    }
                }
            },
            title: {
                display: false
            },
            tooltip: {
                backgroundColor: '#1f2937',
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                borderColor: '#6366f1',
                borderWidth: 2,
                cornerRadius: 8,
                titleFont: {
                    family: 'Inter, system-ui, sans-serif',
                    weight: '600'
                },
                bodyFont: {
                    family: 'Inter, system-ui, sans-serif',
                    weight: '500'
                },
                callbacks: {
                    label: (context) => {
                        const value = context.parsed.y
                        let label = context.dataset.label || ''
                        if (label) label += ': '
                        return label + formatValue(value, metric.type)
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    color: '#475569',
                    font: {
                        weight: '500',
                        family: 'Inter, system-ui, sans-serif'
                    }
                },
                grid: {
                    color: '#e2e8f0',
                    lineWidth: 1
                }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    color: '#475569',
                    font: {
                        weight: '500',
                        family: 'Inter, system-ui, sans-serif'
                    },
                    callback: (value) => formatChartValue(value, metric.type)
                },
                grid: {
                    color: '#e2e8f0',
                    lineWidth: 1
                }
            }
        }
    }

    const renderChartValues = () => {
        const chartData = getChartData()

        if (type === 'comparison') {
            return (
                <div className="chart-values">
                    <div className="chart-values-grid">
                        {chartData.labels.map((label, index) => {
                            const value = chartData.datasets[0].data[index]
                            const color = chartData.datasets[0].backgroundColor[index]
                            const platformData = data[index]

                            return (
                                <div key={label} className="chart-value-item">
                                    <div
                                        className="chart-value-indicator"
                                        style={{ backgroundColor: color }}
                                    />
                                    <div className="chart-value-content">
                                        <span className="chart-value-label">{label}</span>
                                        <span className="chart-value-number">
                                            {formatValue(value, metric.type)}
                                        </span>
                                        <span className="chart-value-platform">
                                            {platformData.platform}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )
        }

        if (type === 'timeSeries') {
            return (
                <div className="chart-values">
                    <div className="chart-values-timeseries">
                        {periods.map((period, periodIndex) => {
                            const totalValue = chartData.datasets.reduce((sum, dataset) => {
                                return sum + (dataset.data[periodIndex] || 0)
                            }, 0)

                            return (
                                <div key={period} className="chart-period-values">
                                    <div className="chart-period-label">
                                        {groupBy === 'month' ? formatMonthPeriod(period) : formatWeekPeriod(period)}
                                    </div>
                                    <div className="chart-period-data">
                                        {/* Original rendering for channel breakdown */}
                                        {chartData.datasets.map((dataset) => {
                                            const value = dataset.data[periodIndex]
                                            const color = dataset.borderColor

                                            return (
                                                <div key={dataset.label} className="chart-value-item small">
                                                    <div
                                                        className="chart-value-indicator small"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                    <div className="chart-value-content">
                                                        <span className="chart-value-label small">{dataset.label}</span>
                                                        <span className="chart-value-number small">
                                                            {formatValue(value, metric.type)}
                                                        </span>
                                                    </div>
                                                </div>
                                            )
                                        })}

                                        {/* Show total at the end when grouped by month */}
                                        {groupBy === 'month' && (
                                            <div className="chart-value-item small total-item">
                                                <div
                                                    className="chart-value-indicator small"
                                                    style={{ backgroundColor: '#22c55e' }} // Green color
                                                />
                                                <div className="chart-value-content">
                                                    <span className="chart-value-label small total-label">Total</span>
                                                    <span
                                                        className="chart-value-number small total-number"
                                                        style={{ color: '#166534', fontWeight: '600' }} // Darker green, bold
                                                    >
                                                        {formatValue(totalValue, metric.type)}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )
        }

        return null
    }

    return (
        <div className="chart-container" id={`chart-${metric.key}`}>
            <h3>{metric.title}</h3>
            <div style={{ height: '300px' }}>
                <Bar
                    ref={chartRef}
                    data={getChartData()}
                    options={options}
                />
            </div>
            {renderChartValues()}
        </div>
    )
}

export default MetricChart