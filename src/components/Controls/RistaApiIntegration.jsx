import React, { useState } from 'react'
import Select from 'react-select'
import flatpickr from 'flatpickr'
import { ristaService } from '../../services/api'

const RistaApiIntegration = ({ onFetchComplete, loading: parentLoading }) => {
    // Branches state
    const [branches, setBranches] = useState([])
    const [branchesLoaded, setBranchesLoaded] = useState(false)
    const [selectedBranches, setSelectedBranches] = useState([])
    const [branchChannels, setBranchChannels] = useState({})

    // Selected channels per branch
    const [selectedChannels, setSelectedChannels] = useState({})

    // Date range state
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    // Loading/Error state
    const [fetchingBranches, setFetchingBranches] = useState(false)
    const [fetchingSales, setFetchingSales] = useState(false)
    const [error, setError] = useState(null)

    // Initialize date picker
    React.useEffect(() => {
        const dateInput = document.getElementById('ristaDateRange')
        if (dateInput) {
            flatpickr(dateInput, {
                mode: 'range',
                dateFormat: 'Y-m-d',
                onChange: (selectedDates) => {
                    if (selectedDates.length === 2) {
                        const pad = (num) => String(num).padStart(2, '0')
                        const format = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
                        setStartDate(format(selectedDates[0]))
                        setEndDate(format(selectedDates[1]))
                    }
                }
            })
        }
    }, [branchesLoaded])

    // Auto-fetch branches on mount
    React.useEffect(() => {
        handleFetchBranches()
    }, [])

    // Fetch branches using credentials from .env
    const handleFetchBranches = async () => {
        setFetchingBranches(true)
        setError(null)

        try {
            const result = await ristaService.fetchBranches()

            if (result && Array.isArray(result) && result.length > 0) {
                const processedBranches = result.map(branch => ({
                    branchName: branch.branchName,
                    branchCode: branch.branchCode,
                    channels: branch.channels || [],
                    businessName: branch.businessName,
                    status: branch.status
                }))

                setBranches(processedBranches)

                const channelMap = {}
                processedBranches.forEach(branch => {
                    channelMap[branch.branchCode] = branch.channels.map(ch => ch.name)
                })
                setBranchChannels(channelMap)

                setBranchesLoaded(true)
                setError(null)
            } else {
                setError('No branches found')
                setBranches([])
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch branches')
            setBranches([])
            setBranchesLoaded(false)
        } finally {
            setFetchingBranches(false)
        }
    }

    const handleBranchChange = (selectedOption) => {
        if (selectedOption && !selectedBranches.find(b => b.branchCode === selectedOption.value)) {
            const branch = branches.find(b => b.branchCode === selectedOption.value)
            if (branch) {
                setSelectedBranches(prev => [...prev, branch])

                const branchChannelList = branchChannels[branch.branchCode] || []
                const takeawayChannel = branchChannelList.find(ch => /takeaway/i.test(ch))

                if (takeawayChannel) {
                    setSelectedChannels(prev => ({
                        ...prev,
                        [branch.branchCode]: [takeawayChannel]
                    }))
                }
            }
        }
    }

    const removeBranch = (branchCode) => {
        setSelectedBranches(prev => prev.filter(b => b.branchCode !== branchCode))
        setSelectedChannels(prev => {
            const updated = { ...prev }
            delete updated[branchCode]
            return updated
        })
    }

    const handleChannelToggle = (branchCode, channelName, checked) => {
        setSelectedChannels(prev => {
            const currentChannels = prev[branchCode] || []
            if (checked) {
                return { ...prev, [branchCode]: [...currentChannels, channelName] }
            } else {
                return { ...prev, [branchCode]: currentChannels.filter(ch => ch !== channelName) }
            }
        })
    }

    const handleFetchSales = async () => {
        if (selectedBranches.length === 0) {
            setError('Please select at least one branch')
            return
        }

        const hasSelectedChannels = selectedBranches.some(branch =>
            (selectedChannels[branch.branchCode] || []).length > 0
        )

        if (!hasSelectedChannels) {
            setError('Please select at least one channel for the selected branches')
            return
        }

        if (!startDate || !endDate) {
            setError('Please select a date range')
            return
        }

        setFetchingSales(true)
        setError(null)

        try {
            const allResults = []
            const allDetails = []

            for (const branch of selectedBranches) {
                const channels = selectedChannels[branch.branchCode] || []

                for (const channel of channels) {
                    try {
                        const result = await ristaService.fetchSalesData(
                            branch.branchCode, startDate, endDate, channel
                        )

                        allResults.push(result)
                        allDetails.push({
                            id: branch.branchCode,
                            name: branch.branchName,
                            platform: channel.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                            key: `${branch.branchCode}_${channel}`
                        })
                    } catch (err) {
                        console.error('Error fetching sales for', branch.branchName, channel, err)
                    }
                }
            }

            if (allResults.length === 0) {
                throw new Error('Failed to fetch sales data for any selected branch/channel combination')
            }

            if (onFetchComplete) {
                onFetchComplete({
                    results: allResults,
                    details: allDetails,
                    selections: {
                        restaurants: selectedBranches.map(b => b.branchCode),
                        channels: Object.values(selectedChannels).flat(),
                        startDate,
                        endDate
                    },
                    groupBy: 'total',
                    thresholds: { discount: 10, ads: 5 }
                })
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch sales data')
        } finally {
            setFetchingSales(false)
        }
    }

    const customSelectStyles = {
        control: (provided, state) => ({
            ...provided,
            padding: '0.5rem 1rem',
            border: `2px solid ${state.isFocused ? '#6366f1' : '#e2e8f0'}`,
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            boxShadow: state.isFocused ? '0 0 0 4px rgba(99, 102, 241, 0.15)' : '0 1px 3px 0 rgb(0 0 0 / 0.1)',
            minHeight: '56px',
            transition: 'all 0.3s ease',
            '&:hover': { borderColor: '#6366f1' }
        }),
        option: (provided, state) => ({
            ...provided,
            padding: '1rem 1.5rem',
            background: state.isSelected ? 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)' : state.isFocused ? 'rgba(99, 102, 241, 0.1)' : '#ffffff',
            color: state.isSelected ? 'white' : '#0f172a',
            fontWeight: state.isSelected ? '600' : '500',
            borderRadius: '12px',
            margin: '4px 8px',
            cursor: 'pointer',
            '&:hover': { background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)', color: 'white' }
        }),
        menu: (provided) => ({
            ...provided,
            borderRadius: '16px',
            border: '2px solid #6366f1',
            boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
            overflow: 'hidden'
        }),
        placeholder: (provided) => ({ ...provided, color: '#64748b', fontWeight: '500' }),
        dropdownIndicator: (provided, state) => ({
            ...provided,
            color: '#6366f1',
            transition: 'all 0.3s ease',
            transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : 'none'
        }),
        indicatorSeparator: () => ({ display: 'none' })
    }

    const branchOptions = branches
        .filter(branch => !selectedBranches.find(b => b.branchCode === branch.branchCode))
        .filter(branch => branch.status === 'Active')
        .map(branch => ({ value: branch.branchCode, label: `${branch.branchName} (${branch.branchCode})` }))

    return (
        <div className="card">
            <h2 className="card-header">Rista Sales Data</h2>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '1rem', color: '#dc2626', fontSize: '0.9rem' }}>
                    ⚠️ {error}
                </div>
            )}

            {fetchingBranches ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--primary-gray)' }}>
                    <p>Loading branches...</p>
                </div>
            ) : branchesLoaded ? (
                <>
                    <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '8px', padding: '12px', marginBottom: '1rem', color: '#065f46', fontSize: '0.9rem' }}>
                        ✓ Found {branches.length} branches
                    </div>

                    <div className="form-group">
                        <h4 className="form-label">1. Select Branch(es)</h4>
                        <Select value={null} onChange={handleBranchChange} options={branchOptions} styles={customSelectStyles} placeholder="Choose a branch to add..." isSearchable={true} isClearable={false} menuPortalTarget={document.body} menuPosition="fixed" />

                        {selectedBranches.length > 0 && (
                            <div className="selected-items" style={{ marginTop: '1rem' }}>
                                {selectedBranches.map(branch => {
                                    const channels = branchChannels[branch.branchCode] || []
                                    const selected = selectedChannels[branch.branchCode] || []

                                    return (
                                        <div key={branch.branchCode} className="selected-tag" style={{ display: 'block', padding: '1rem', marginBottom: '0.5rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                <strong>{branch.branchName}</strong>
                                                <button type="button" className="remove-tag" onClick={() => removeBranch(branch.branchCode)} title="Remove branch">✕</button>
                                            </div>

                                            <div style={{ fontSize: '0.85rem' }}>
                                                <span style={{ color: '#e2e8f0', marginBottom: '0.5rem', display: 'block' }}>Select channels:</span>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    {channels.map(channelName => {
                                                        const isSelected = selected.includes(channelName)
                                                        const isTakeaway = /takeaway/i.test(channelName)

                                                        return (
                                                            <label key={channelName} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', borderRadius: '4px', cursor: 'pointer', border: isTakeaway ? '1px solid #4ade80' : '1px solid transparent' }}>
                                                                <input type="checkbox" checked={isSelected} onChange={(e) => handleChannelToggle(branch.branchCode, channelName, e.target.checked)} style={{ marginRight: '4px' }} />
                                                                {channelName}
                                                                {isTakeaway && <span style={{ color: '#4ade80', marginLeft: '4px' }}>★</span>}
                                                            </label>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {selectedBranches.length === 0 && (
                            <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--primary-gray)', fontStyle: 'italic', textAlign: 'center' }}>No branches selected yet</p>
                        )}
                    </div>

                    <div className="form-group">
                        <h4 className="form-label">2. Select Date Range</h4>
                        <input id="ristaDateRange" type="text" placeholder="Click to select date range" className="form-control" readOnly />
                        {startDate && endDate && (
                            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--primary-black)', fontWeight: '600' }}>Selected: {startDate} to {endDate}</p>
                        )}
                    </div>

                    <button className="btn btn-primary" onClick={handleFetchSales} disabled={fetchingSales || parentLoading || selectedBranches.length === 0 || !startDate || !endDate} style={{ width: '100%' }}>
                        {fetchingSales ? 'Fetching Sales Data...' : 'Fetch Sales Data'}
                    </button>

                    <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--primary-gray)' }}>
                        <p><strong>Selected:</strong></p>
                        <p>{selectedBranches.length} branch(es)</p>
                        <p>{Object.values(selectedChannels).flat().length} channel(s)</p>
                        <p>{startDate && endDate ? 'Date range set' : 'No date range'}</p>
                    </div>
                </>
            ) : (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <button className="btn btn-primary" onClick={handleFetchBranches}>
                        Load Branches
                    </button>
                </div>
            )}
        </div>
    )
}

export default RistaApiIntegration
