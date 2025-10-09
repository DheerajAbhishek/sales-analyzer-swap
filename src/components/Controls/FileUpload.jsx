import React, { useState } from 'react'
import { uploadFileService } from '../../services/api'
import { authService } from '../../services/authService'

const FileUpload = () => {
    const [selectedFiles, setSelectedFiles] = useState([])
    const [uploadStatus, setUploadStatus] = useState('')
    const [uploading, setUploading] = useState(false)

    const handleFileSelect = (event) => {
        const files = Array.from(event.target.files)
        setSelectedFiles(files)

        if (files.length === 1) {
            setUploadStatus(`Selected: ${files[0].name}`)
        } else if (files.length > 1) {
            setUploadStatus(`${files.length} files selected`)
        } else {
            setUploadStatus('')
        }
    }

    const handleUpload = async () => {
        if (selectedFiles.length === 0) {
            alert('Please select one or more files to upload.')
            return
        }

        setUploadStatus(`Starting upload of ${selectedFiles.length} file(s)...`)
        setUploading(true)

        try {
            const uploadPromises = selectedFiles.map(async (file) => {
                setUploadStatus(`Uploading ${file.name}...`)
                const result = await uploadFileService.uploadFileComplete(file)
                return result.key
            })

            const fileKeys = await Promise.all(uploadPromises)
            setUploadStatus('✅ Upload complete. Starting batch process...')

            // Start batch processing
            const { jobId } = await uploadFileService.processBatch(fileKeys)

            if (jobId) {
                setUploadStatus('Batch process started. Polling for status...')
                pollForJobStatus(jobId)
            } else {
                throw new Error('Could not get Job ID to track progress.')
            }

        } catch (err) {
            setUploadStatus(`🔥 ERROR: ${err.message}`)
        } finally {
            setUploading(false)
        }
    }

    const pollForJobStatus = (jobId) => {
        const interval = setInterval(async () => {
            try {
                const statusData = await uploadFileService.getJobStatus(jobId)

                if (statusData.status === 'IN_PROGRESS') {
                    setUploadStatus(`⏳ Processing file ${statusData.processedCount} of ${statusData.totalFiles}...`)
                } else if (statusData.status === 'COMPLETED') {
                    setUploadStatus(`✅ All ${statusData.totalFiles} files processed successfully!`)
                    clearInterval(interval)
                } else if (statusData.status === 'FAILED') {
                    setUploadStatus(`🔥 ERROR: Processing failed. Check logs for Job ID ${jobId}.`)
                    clearInterval(interval)
                }
            } catch (err) {
                setUploadStatus('🔥 Error checking job status.')
                clearInterval(interval)
            }
        }, 5000)
    }

    const getStatusClass = () => {
        if (uploadStatus.includes('✅')) return 'status success'
        if (uploadStatus.includes('🔥')) return 'status error'
        if (uploadStatus.includes('⏳') || uploading) return 'status loading'
        return 'file-name'
    }

    return (
        <div className="card">
            <h2 className="card-header">Upload New Report(s)</h2>

            <label htmlFor="file-upload">
                <div className="upload-box">
                    <p>Drag & drop files here, or click to browse</p>
                    <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: 'var(--primary-gray)' }}>
                        Supports .xlsx, .xls, .csv files
                    </p>
                    <input
                        id="file-upload"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        multiple
                        className="file-input"
                        onChange={handleFileSelect}
                    />
                </div>
            </label>

            {uploadStatus && (
                <div className={getStatusClass()}>
                    {uploadStatus}
                </div>
            )}

            <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading || selectedFiles.length === 0}
                style={{ marginTop: '1rem' }}
            >
                {uploading ? 'Processing...' : 'Process Reports'}
            </button>
        </div>
    )
}

export default FileUpload