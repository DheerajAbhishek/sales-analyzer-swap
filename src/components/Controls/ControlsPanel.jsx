import React from 'react'
import FileUpload from './FileUpload.jsx'
import ReportControls from './ReportControls.jsx'

const ControlsPanel = ({ onGetReport, loading }) => {
    return (
        <>
            <FileUpload />
            <ReportControls
                onGetReport={onGetReport}
                loading={loading}
            />
        </>
    )
}

export default ControlsPanel
