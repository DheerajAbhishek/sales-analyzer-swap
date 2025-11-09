import React from "react";
import FileUpload from "./FileUpload.jsx";
import ReportControls from "./ReportControls.jsx";

const ControlsPanel = ({ onGetReport, loading, userRestaurants }) => {
  return (
    <>
      <FileUpload />
      <ReportControls
        onGetReport={onGetReport}
        loading={loading}
        userRestaurants={userRestaurants}
      />
    </>
  );
};

export default ControlsPanel;
