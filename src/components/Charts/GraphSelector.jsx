import React from 'react'
import { METRICS_CONFIG } from '../../utils/constants'

const GraphSelector = ({ selectedGraphs, onGraphsChange }) => {
    const handleToggle = (metricKey) => {
        if (selectedGraphs.includes(metricKey)) {
            onGraphsChange(selectedGraphs.filter(key => key !== metricKey))
        } else {
            onGraphsChange([...selectedGraphs, metricKey])
        }
    }

    const handleSelectAll = () => {
        onGraphsChange(METRICS_CONFIG.map(m => m.key))
    }

    const handleDeselectAll = () => {
        onGraphsChange([])
    }

    return (
        <div style={{
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            border: '1px solid #cbd5e1',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            marginTop: '16px'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <h3 style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#0f172a'
                }}>
                    📊 Select Graphs to Display
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={handleSelectAll}
                        style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            background: '#6366f1',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '500',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseOver={e => e.target.style.background = '#4f46e5'}
                        onMouseOut={e => e.target.style.background = '#6366f1'}
                    >
                        Select All
                    </button>
                    <button
                        onClick={handleDeselectAll}
                        style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            background: '#94a3b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '500',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseOver={e => e.target.style.background = '#64748b'}
                        onMouseOut={e => e.target.style.background = '#94a3b8'}
                    >
                        Deselect All
                    </button>
                </div>
            </div>
            
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '12px'
            }}>
                {METRICS_CONFIG.map(metric => (
                    <label
                        key={metric.key}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 12px',
                            background: selectedGraphs.includes(metric.key) ? '#e0e7ff' : 'white',
                            border: selectedGraphs.includes(metric.key) ? '2px solid #6366f1' : '1px solid #e2e8f0',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            fontSize: '0.9rem',
                            fontWeight: selectedGraphs.includes(metric.key) ? '600' : '500',
                            color: selectedGraphs.includes(metric.key) ? '#312e81' : '#475569'
                        }}
                        onMouseOver={e => {
                            if (!selectedGraphs.includes(metric.key)) {
                                e.currentTarget.style.background = '#f8fafc'
                                e.currentTarget.style.borderColor = '#cbd5e1'
                            }
                        }}
                        onMouseOut={e => {
                            if (!selectedGraphs.includes(metric.key)) {
                                e.currentTarget.style.background = 'white'
                                e.currentTarget.style.borderColor = '#e2e8f0'
                            }
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={selectedGraphs.includes(metric.key)}
                            onChange={() => handleToggle(metric.key)}
                            style={{
                                width: '16px',
                                height: '16px',
                                cursor: 'pointer',
                                accentColor: '#6366f1'
                            }}
                        />
                        <span>{metric.title}</span>
                    </label>
                ))}
            </div>
        </div>
    )
}

export default GraphSelector
