import React from "react";

const DataAvailabilityModal = ({
  isVisible,
  onClose,
  selectedChannels,
  availableChannels,
  missingChannels,
  onContinue,
}) => {
  if (!isVisible) return null;

  const hasData = availableChannels.length > 0;
  const hasMissingData = missingChannels.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            Data Availability Status
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            ×
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-3">
            Selected Channels: {selectedChannels.length}
          </p>

          {hasData && (
            <div className="mb-3">
              <p className="text-sm font-medium text-green-700 mb-2">
                ✓ Data Available ({availableChannels.length} channels):
              </p>
              <ul className="text-sm text-green-600 ml-4">
                {availableChannels.map((channel, index) => (
                  <li key={index} className="capitalize">
                    • {channel}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasMissingData && (
            <div className="mb-3">
              <p className="text-sm font-medium text-red-700 mb-2">
                ⚠ Data Not Found ({missingChannels.length} channels):
              </p>
              <ul className="text-sm text-red-600 ml-4">
                {missingChannels.map((channel, index) => (
                  <li key={index} className="capitalize">
                    • {channel}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!hasData && (
            <div className="text-center py-4">
              <div className="text-6xl mb-4">⚠️</div>
              <p className="text-red-600 font-medium">
                No data available for any selected channels
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Please select different channels or check data availability.
              </p>
            </div>
          )}

          {hasData && hasMissingData && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Only data from available channels will be
                displayed in the dashboard.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          {hasData && (
            <button
              onClick={onContinue}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Continue with Available Data
            </button>
          )}
          {!hasData && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Select Different Channels
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataAvailabilityModal;
