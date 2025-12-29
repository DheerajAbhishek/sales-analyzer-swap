import React, { useState, useEffect } from 'react'
import Select from 'react-select'
import flatpickr from 'flatpickr'
import { ristaService } from '../../services/api'
import { useRistaBranches } from '../../hooks/useQueries'

const RistaApiIntegration = ({ onFetchComplete, loading: parentLoading, groupBy = 'total' }) => {
    // Use React Query for branches (cached for 1 hour)
    const {
        data: branchesData,
        isLoading: fetchingBranches,
        error: branchesError
    } = useRistaBranches()

    // Process branches from React Query
    const [branches, setBranches] = useState([])
    const [branchChannels, setBranchChannels] = useState({})
    const branchesLoaded = !!branchesData && branches.length > 0

    // Process branch data when it loads
    useEffect(() => {
        if (branchesData && Array.isArray(branchesData) && branchesData.length > 0) {
            const processedBranches = branchesData.map(branch => ({
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
        }
    }, [branchesData])

    const [selectedBranches, setSelectedBranches] = useState([])

    // Selected channels per branch
    const [selectedChannels, setSelectedChannels] = useState({})

    // Date range state
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    // Loading/Error state
    const [fetchingSales, setFetchingSales] = useState(false)
    const [error, setError] = useState(branchesError?.message || null)

    // Update error when branches error changes
    useEffect(() => {
        if (branchesError) {
            setError(branchesError.message || 'Failed to fetch branches')
        }
    }, [branchesError])

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

    // Helper function to split date range into weekly chunks
    const getWeeklyChunks = (start, end) => {
        const chunks = []
        const startD = new Date(start)
        const endD = new Date(end)

        let chunkStart = new Date(startD)
        while (chunkStart <= endD) {
            let chunkEnd = new Date(chunkStart)
            chunkEnd.setDate(chunkEnd.getDate() + 6) // 7-day chunks
            if (chunkEnd > endD) {
                chunkEnd = new Date(endD)
            }
            chunks.push({
                startDate: chunkStart.toISOString().split('T')[0],
                endDate: chunkEnd.toISOString().split('T')[0]
            })
            chunkStart = new Date(chunkEnd)
            chunkStart.setDate(chunkStart.getDate() + 1)
        }
        return chunks
    }

    // Helper to merge multiple results for same branch/channel
    const mergeResults = (results) => {
        if (results.length === 0) return null
        if (results.length === 1) return results[0]

        const merged = {
            ...results[0],
            body: {
                consolidatedInsights: {
                    noOfOrders: 0,
                    grossSale: 0,
                    gstOnOrder: 0,
                    discounts: 0,
                    packings: 0,
                    ads: 0,
                    commissionAndTaxes: 0,
                    netSale: 0,
                    nbv: 0
                },
                discountBreakdown: {}
            }
        }

        for (const result of results) {
            const insights = result?.body?.consolidatedInsights || {}
            merged.body.consolidatedInsights.noOfOrders += insights.noOfOrders || 0
            merged.body.consolidatedInsights.grossSale += insights.grossSale || 0
            merged.body.consolidatedInsights.gstOnOrder += insights.gstOnOrder || 0
            merged.body.consolidatedInsights.discounts += insights.discounts || 0
            merged.body.consolidatedInsights.packings += insights.packings || 0
            merged.body.consolidatedInsights.ads += insights.ads || 0
            merged.body.consolidatedInsights.commissionAndTaxes += insights.commissionAndTaxes || 0
            merged.body.consolidatedInsights.netSale += insights.netSale || 0
        }

        // Recalculate derived values
        const c = merged.body.consolidatedInsights
        c.nbv = c.grossSale - c.discounts
        c.discountPercent = c.grossSale > 0 ? (c.discounts / c.grossSale * 100) : 0
        c.commissionPercent = c.grossSale > 0 ? (c.commissionAndTaxes / c.grossSale * 100) : 0
        c.adsPercent = c.grossSale > 0 ? (c.ads / c.grossSale * 100) : 0

        return merged
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
            // Split date range into weekly chunks
            const weeklyChunks = getWeeklyChunks(startDate, endDate)
            console.log(`[SPLIT] ${startDate} to ${endDate} into ${weeklyChunks.length} weekly chunks:`, weeklyChunks)

            // Build all fetch requests (branch × channel × week)
            const fetchRequests = []
            for (const branch of selectedBranches) {
                const channels = selectedChannels[branch.branchCode] || []
                for (const channel of channels) {
                    for (const chunk of weeklyChunks) {
                        fetchRequests.push({
                            branch,
                            channel,
                            chunk,
                            key: `${branch.branchCode}_${channel}`
                        })
                    }
                }
            }

            console.log(`[REQUESTS] Total fetch requests to make: ${fetchRequests.length}`)            // Execute requests with staggered timing to avoid rate limiting
            const STAGGER_DELAY = 300 // 300ms between batch starts
            const BATCH_SIZE = 5 // Process 5 requests at a time

            const allFetchResults = []

            for (let i = 0; i < fetchRequests.length; i += BATCH_SIZE) {
                const batch = fetchRequests.slice(i, i + BATCH_SIZE)

                // Add delay between batches (except first)
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY))
                }

                // Execute batch in parallel
                const batchPromises = batch.map(req =>
                    ristaService.fetchSalesData(
                        req.branch.branchCode,
                        req.chunk.startDate,
                        req.chunk.endDate,
                        req.channel
                    ).then(result => ({ ...req, result, status: 'fulfilled' }))
                        .catch(error => ({ ...req, error, status: 'rejected' }))
                )

                const batchResults = await Promise.all(batchPromises)
                allFetchResults.push(...batchResults)
            }

            // Group results by branch/channel key and merge
            const groupedResults = {}
            for (const fetchResult of allFetchResults) {
                if (fetchResult.status === 'fulfilled') {
                    if (!groupedResults[fetchResult.key]) {
                        groupedResults[fetchResult.key] = {
                            branch: fetchResult.branch,
                            channel: fetchResult.channel,
                            results: []
                        }
                    }
                    groupedResults[fetchResult.key].results.push(fetchResult.result)
                } else {
                    console.error('Error fetching sales for', fetchResult.branch.branchName, fetchResult.channel, fetchResult.chunk, fetchResult.error)
                }
            }

            // Merge weekly results and build final output
            const allResults = []
            const allDetails = []

            for (const key of Object.keys(groupedResults)) {
                const group = groupedResults[key]
                const mergedResult = mergeResults(group.results)
                if (mergedResult) {
                    allResults.push(mergedResult)
                    allDetails.push({
                        id: group.branch.branchCode,
                        name: group.branch.branchName,
                        platform: group.channel.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                        key: key
                    })
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
                    groupBy: groupBy,
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
