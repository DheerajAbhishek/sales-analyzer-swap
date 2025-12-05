import React, { useState, useCallback, useEffect } from "react";
import { ristaService, restaurantMappingService } from "../services/api";

/**
 * Rista POS Integration Component - Setup Flow
 * Allows users to:
 * 1. Connect their Rista account (API credentials stored securely in SSM)
 * 2. Fetch and view their restaurant branches
 * 3. Map branches to existing restaurant groups or create new ones
 * 4. Select which channels to include (auto-selects Takeaway)
 */
const RistaApiIntegration = ({ restaurants = [], onRestaurantsUpdate }) => {
  // Credentials state
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);

  // Branches state
  const [branches, setBranches] = useState([]);
  const [branchesLoaded, setBranchesLoaded] = useState(false);

  // Mapping state - each branch can be mapped to a restaurant group
  const [branchMappings, setBranchMappings] = useState({});
  // { branchCode: { restaurantGroupId, selectedChannels, isNewGroup, newGroupName } }

  // Existing mappings from DynamoDB
  const [existingMappings, setExistingMappings] = useState([]);

  // Loading and error states
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [savingMappings, setSavingMappings] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // UI state
  const [isExpanded, setIsExpanded] = useState(false);
  const [setupStep, setSetupStep] = useState(1); // 1: Credentials, 2: Branches, 3: Mapping

  // Takeaway regex pattern for auto-selection
  const TAKEAWAY_REGEX = /take\s*away|takeaway|take-away|counter/i;

  // Load stored credentials and mappings on mount
  useEffect(() => {
    const loadStoredData = async () => {
      setLoadingCredentials(true);
      try {
        // Load credentials
        const credResult = await ristaService.getCredentials();
        if (credResult.success && credResult.hasCredentials) {
          setApiKey(credResult.apiKey);
          setApiSecret(credResult.apiSecret);
          setHasStoredCredentials(true);
          setSetupStep(2); // Move to branches step
        }

        // Load existing mappings
        const mappingsResult = await ristaService.getMappings();
        if (mappingsResult.success && mappingsResult.mappings) {
          setExistingMappings(mappingsResult.mappings);

          // If we have mappings, show them
          if (mappingsResult.mappings.length > 0) {
            // Convert mappings to branch data format
            const branchesFromMappings = mappingsResult.mappings.map(m => ({
              id: m.branchCode,
              name: m.branchName,
              channels: m.channels || [],
              businessName: m.businessName,
              address: m.address,
              state: m.state,
            }));
            setBranches(branchesFromMappings);
            setBranchesLoaded(true);

            // Restore mapping state
            const restoredMappings = {};
            mappingsResult.mappings.forEach(m => {
              restoredMappings[m.branchCode] = {
                restaurantGroupId: m.mappedToRestaurantGroup || "",
                selectedChannels: m.selectedChannels || [],
                isNewGroup: m.isNewGroup || false,
                newGroupName: m.restaurantGroupName || "",
              };
            });
            setBranchMappings(restoredMappings);
            setSetupStep(3);
          }
        }
      } catch (err) {
        console.error("Error loading stored data:", err);
      } finally {
        setLoadingCredentials(false);
        setCredentialsLoaded(true);
      }
    };

    loadStoredData();
  }, []);

  // Save credentials to SSM
  const handleSaveCredentials = useCallback(async () => {
    if (!apiKey.trim() || !apiSecret.trim()) {
      setError("Please enter both API Key and API Secret");
      return;
    }

    setSavingCredentials(true);
    setError(null);

    try {
      const result = await ristaService.saveCredentials(apiKey, apiSecret);
      if (result.success) {
        setHasStoredCredentials(true);
        setSuccess("Credentials saved securely!");
        setSetupStep(2);
      } else {
        setError(result.error || "Failed to save credentials");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCredentials(false);
    }
  }, [apiKey, apiSecret]);

  // Fetch branches from Rista API
  const handleFetchBranches = useCallback(async () => {
    if (!apiKey.trim() || !apiSecret.trim()) {
      setError("Please enter credentials first");
      return;
    }

    setLoadingBranches(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await ristaService.fetchBranches(apiKey, apiSecret);

      if (result.success && result.branches) {
        setBranches(result.branches);
        setBranchesLoaded(true);

        // Initialize mappings for each branch
        const initialMappings = {};
        result.branches.forEach((branch) => {
          // Check if we have an existing mapping
          const existing = existingMappings.find(m => m.branchCode === branch.id);

          if (existing) {
            initialMappings[branch.id] = {
              restaurantGroupId: existing.mappedToRestaurantGroup || "",
              selectedChannels: existing.selectedChannels || [],
              isNewGroup: existing.isNewGroup || false,
              newGroupName: existing.restaurantGroupName || "",
            };
          } else {
            // Default: nothing selected - user chooses what they want
            initialMappings[branch.id] = {
              restaurantGroupId: "",
              selectedChannels: [],
              isNewGroup: false,
              newGroupName: "",
            };
          }
        });
        setBranchMappings(initialMappings);

        setSuccess(`Found ${result.branches.length} branches`);
        setSetupStep(3);
      } else {
        setError(result.error || "Failed to fetch branches");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoadingBranches(false);
    }
  }, [apiKey, apiSecret, existingMappings]);

  // Update mapping for a branch
  const updateBranchMapping = useCallback((branchId, field, value) => {
    setBranchMappings((prev) => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        [field]: value,
      },
    }));
  }, []);

  // Toggle channel selection for a branch
  const toggleChannelForBranch = useCallback((branchId, channel) => {
    setBranchMappings((prev) => {
      const currentChannels = prev[branchId]?.selectedChannels || [];
      const newChannels = currentChannels.includes(channel)
        ? currentChannels.filter((ch) => ch !== channel)
        : [...currentChannels, channel];
      return {
        ...prev,
        [branchId]: {
          ...prev[branchId],
          selectedChannels: newChannels,
        },
      };
    });
  }, []);

  // Select all channels for a branch
  const selectAllChannelsForBranch = useCallback((branchId, allChannels) => {
    setBranchMappings((prev) => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        selectedChannels: [...allChannels],
      },
    }));
  }, []);

  // Deselect all channels for a branch
  const deselectAllChannelsForBranch = useCallback((branchId) => {
    setBranchMappings((prev) => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        selectedChannels: [],
      },
    }));
  }, []);

  // Select all branches with all their channels
  const selectAllBranches = useCallback(() => {
    const newMappings = {};
    branches.forEach((branch) => {
      newMappings[branch.id] = {
        ...branchMappings[branch.id],
        selectedChannels: [...(branch.channels || [])],
        isNewGroup: true,
        newGroupName: branch.name,
      };
    });
    setBranchMappings(newMappings);
  }, [branches, branchMappings]);

  // Deselect all branches
  const deselectAllBranches = useCallback(() => {
    const newMappings = {};
    branches.forEach((branch) => {
      newMappings[branch.id] = {
        restaurantGroupId: "",
        selectedChannels: [],
        isNewGroup: false,
        newGroupName: "",
      };
    });
    setBranchMappings(newMappings);
  }, [branches]);

  // Save all mappings
  const handleSaveMappings = useCallback(async () => {
    setSavingMappings(true);
    setError(null);
    setSuccess(null);

    try {
      // Prepare mappings data
      const mappingsToSave = branches.map((branch) => {
        const mapping = branchMappings[branch.id] || {};
        return {
          branchCode: branch.id,
          branchName: branch.name,
          channels: branch.channels,
          selectedChannels: mapping.selectedChannels || [],
          mappedToRestaurantGroup: mapping.isNewGroup ? null : mapping.restaurantGroupId,
          restaurantGroupName: mapping.isNewGroup ? mapping.newGroupName : "",
          isNewGroup: mapping.isNewGroup || false,
          businessName: branch.businessName,
          address: branch.address,
          state: branch.state,
          updatedAt: new Date().toISOString(),
        };
      });

      // Save to DynamoDB
      const result = await ristaService.saveMappings(mappingsToSave);

      if (result.success) {
        // Now update the restaurant groups in the main app
        const updatedRestaurants = [...restaurants];

        for (const mapping of mappingsToSave) {
          if (mapping.selectedChannels.length === 0) continue;

          if (mapping.isNewGroup && mapping.restaurantGroupName) {
            // Create new restaurant group with Rista branch as the ID
            const newRestaurant = {
              id: `rista_${mapping.branchCode}_${Date.now()}`,
              name: mapping.restaurantGroupName,
              platforms: {
                // Use branchCode as the restaurant ID for Rista channels
                rista: mapping.branchCode,
              },
              ristaChannels: mapping.selectedChannels,
              ristaBranchCode: mapping.branchCode,
              ristaBranchName: mapping.branchName,
              createdAt: new Date().toISOString(),
            };
            updatedRestaurants.push(newRestaurant);
          } else if (mapping.mappedToRestaurantGroup) {
            // Add to existing restaurant group
            const existingIdx = updatedRestaurants.findIndex(
              (r) => r.id === mapping.mappedToRestaurantGroup
            );
            if (existingIdx >= 0) {
              updatedRestaurants[existingIdx] = {
                ...updatedRestaurants[existingIdx],
                platforms: {
                  ...updatedRestaurants[existingIdx].platforms,
                  rista: mapping.branchCode,
                },
                ristaChannels: mapping.selectedChannels,
                ristaBranchCode: mapping.branchCode,
                ristaBranchName: mapping.branchName,
              };
            }
          }
        }

        // Save updated restaurants
        if (onRestaurantsUpdate) {
          await onRestaurantsUpdate(updatedRestaurants);
        }

        setSuccess("Mappings saved successfully! You can now view Rista data in the Dashboard.");
        setExistingMappings(mappingsToSave);
      } else {
        setError(result.error || "Failed to save mappings");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingMappings(false);
    }
  }, [branches, branchMappings, restaurants, onRestaurantsUpdate]);

  // Reset and start over
  const handleReset = useCallback(() => {
    setApiKey("");
    setApiSecret("");
    setBranches([]);
    setBranchMappings({});
    setBranchesLoaded(false);
    setHasStoredCredentials(false);
    setSetupStep(1);
    setError(null);
    setSuccess(null);
  }, []);

  // Render step indicator
  const renderStepIndicator = () => (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
      {[1, 2, 3].map((step) => (
        <div
          key={step}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background:
                setupStep >= step
                  ? "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
                  : "#e5e7eb",
              color: setupStep >= step ? "white" : "#9ca3af",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "600",
              fontSize: "0.875rem",
            }}
          >
            {setupStep > step ? "✓" : step}
          </div>
          <span
            style={{
              fontSize: "0.875rem",
              color: setupStep >= step ? "#374151" : "#9ca3af",
              fontWeight: setupStep === step ? "600" : "400",
            }}
          >
            {step === 1 ? "Credentials" : step === 2 ? "Fetch Branches" : "Map to Groups"}
          </span>
          {step < 3 && (
            <div
              style={{
                width: "40px",
                height: "2px",
                background: setupStep > step ? "#7c3aed" : "#e5e7eb",
                margin: "0 0.5rem",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="profile-section"
      style={{
        marginTop: "2rem",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
          color: "white",
          padding: "1.25rem 1.5rem",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: "600" }}>
            🍽️ Rista POS Integration
          </h3>
          <p
            style={{
              margin: "0.25rem 0 0 0",
              fontSize: "0.875rem",
              opacity: 0.9,
            }}
          >
            {hasStoredCredentials
              ? existingMappings.length > 0
                ? `✓ Connected • ${existingMappings.length} branches configured`
                : "✓ Connected • Configure your branches"
              : "Connect your Rista account to import restaurant data"}
          </p>
        </div>
        <span
          style={{
            fontSize: "1.5rem",
            transition: "transform 0.2s",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div style={{ padding: "1.5rem" }}>
          {loadingCredentials ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
              Loading...
            </div>
          ) : (
            <>
              {/* Step Indicator */}
              {renderStepIndicator()}

              {/* Error/Success Messages */}
              {error && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "8px",
                    padding: "1rem",
                    marginBottom: "1rem",
                    color: "#dc2626",
                  }}
                >
                  ❌ {error}
                </div>
              )}
              {success && (
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "8px",
                    padding: "1rem",
                    marginBottom: "1rem",
                    color: "#16a34a",
                  }}
                >
                  ✅ {success}
                </div>
              )}

              {/* Step 1: API Credentials */}
              {setupStep >= 1 && (
                <div
                  style={{
                    marginBottom: "1.5rem",
                    padding: "1rem",
                    background: setupStep === 1 ? "#faf5ff" : "#f9fafb",
                    borderRadius: "8px",
                    border: setupStep === 1 ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                  }}
                >
                  <h4 style={{ margin: "0 0 1rem 0", color: "#374151" }}>
                    Step 1: API Credentials
                    {hasStoredCredentials && (
                      <span style={{ color: "#16a34a", marginLeft: "0.5rem" }}>✓</span>
                    )}
                  </h4>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "0.5rem",
                          fontWeight: "500",
                          color: "#374151",
                        }}
                      >
                        API Key
                      </label>
                      <input
                        type="text"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter your Rista API Key"
                        disabled={hasStoredCredentials && setupStep > 1}
                        style={{
                          width: "100%",
                          padding: "0.75rem",
                          border: "1px solid #d1d5db",
                          borderRadius: "8px",
                          fontSize: "1rem",
                          backgroundColor:
                            hasStoredCredentials && setupStep > 1 ? "#f3f4f6" : "white",
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "0.5rem",
                          fontWeight: "500",
                          color: "#374151",
                        }}
                      >
                        API Secret
                      </label>
                      <div style={{ position: "relative" }}>
                        <input
                          type={showSecret ? "text" : "password"}
                          value={apiSecret}
                          onChange={(e) => setApiSecret(e.target.value)}
                          placeholder="Enter your Rista API Secret"
                          disabled={hasStoredCredentials && setupStep > 1}
                          style={{
                            width: "100%",
                            padding: "0.75rem",
                            paddingRight: "3rem",
                            border: "1px solid #d1d5db",
                            borderRadius: "8px",
                            fontSize: "1rem",
                            backgroundColor:
                              hasStoredCredentials && setupStep > 1 ? "#f3f4f6" : "white",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret(!showSecret)}
                          style={{
                            position: "absolute",
                            right: "0.75rem",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "1.25rem",
                            padding: "0",
                          }}
                        >
                          {showSecret ? "👁️" : "👁️‍🗨️"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {setupStep === 1 && (
                    <div style={{ marginTop: "1rem" }}>
                      <button
                        onClick={handleSaveCredentials}
                        disabled={savingCredentials || !apiKey.trim() || !apiSecret.trim()}
                        style={{
                          padding: "0.75rem 1.5rem",
                          background:
                            savingCredentials || !apiKey.trim() || !apiSecret.trim()
                              ? "#9ca3af"
                              : "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          cursor:
                            savingCredentials || !apiKey.trim() || !apiSecret.trim()
                              ? "not-allowed"
                              : "pointer",
                          fontWeight: "500",
                        }}
                      >
                        {savingCredentials ? "Saving..." : "Save & Continue"}
                      </button>
                    </div>
                  )}

                  {hasStoredCredentials && setupStep > 1 && (
                    <button
                      onClick={handleReset}
                      style={{
                        marginTop: "1rem",
                        padding: "0.5rem 1rem",
                        background: "transparent",
                        color: "#6b7280",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                      }}
                    >
                      Change Credentials
                    </button>
                  )}
                </div>
              )}

              {/* Step 2: Fetch Branches */}
              {setupStep >= 2 && (
                <div
                  style={{
                    marginBottom: "1.5rem",
                    padding: "1rem",
                    background: setupStep === 2 ? "#faf5ff" : "#f9fafb",
                    borderRadius: "8px",
                    border: setupStep === 2 ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                  }}
                >
                  <h4 style={{ margin: "0 0 1rem 0", color: "#374151" }}>
                    Step 2: Fetch Your Branches
                    {branchesLoaded && (
                      <span style={{ color: "#16a34a", marginLeft: "0.5rem" }}>
                        ✓ {branches.length} found
                      </span>
                    )}
                  </h4>

                  {!branchesLoaded ? (
                    <button
                      onClick={handleFetchBranches}
                      disabled={loadingBranches}
                      style={{
                        padding: "0.75rem 1.5rem",
                        background: loadingBranches
                          ? "#9ca3af"
                          : "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        cursor: loadingBranches ? "not-allowed" : "pointer",
                        fontWeight: "500",
                      }}
                    >
                      {loadingBranches ? "Fetching..." : "Fetch Branches from Rista"}
                    </button>
                  ) : (
                    <div style={{ color: "#6b7280", fontSize: "0.875rem" }}>
                      {branches.length} branches loaded. Configure them below.
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Map Branches to Restaurant Groups */}
              {setupStep >= 3 && branchesLoaded && (
                <div
                  style={{
                    padding: "1rem",
                    background: "#faf5ff",
                    borderRadius: "8px",
                    border: "2px solid #7c3aed",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h4 style={{ margin: 0, color: "#374151" }}>
                      Step 3: Configure Branch Mappings
                    </h4>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={selectAllBranches}
                        style={{
                          padding: "0.5rem 1rem",
                          background: "#10b981",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: "500",
                        }}
                      >
                        ✓ Select All
                      </button>
                      <button
                        onClick={deselectAllBranches}
                        style={{
                          padding: "0.5rem 1rem",
                          background: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: "500",
                        }}
                      >
                        ✗ Deselect All
                      </button>
                    </div>
                  </div>
                  <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>
                    Select branches and channels you want to track. Map them to existing restaurant groups or create new ones.
                  </p>

                  <div
                    style={{
                      maxHeight: "500px",
                      overflowY: "auto",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                  >
                    {branches.map((branch) => {
                      const mapping = branchMappings[branch.id] || {};
                      return (
                        <div
                          key={branch.id}
                          style={{
                            padding: "1rem",
                            borderBottom: "1px solid #e5e7eb",
                            background: "white",
                          }}
                        >
                          {/* Branch Header */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              marginBottom: "0.75rem",
                            }}
                          >
                            <div>
                              <strong style={{ color: "#374151" }}>{branch.name}</strong>
                              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                                Code: {branch.id} • {branch.businessName}
                              </div>
                            </div>
                          </div>

                          {/* Channel Selection */}
                          <div style={{ marginBottom: "0.75rem" }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "0.5rem",
                              }}
                            >
                              <label
                                style={{
                                  fontSize: "0.75rem",
                                  fontWeight: "500",
                                  color: "#6b7280",
                                }}
                              >
                                Select Channels:
                              </label>
                              <div style={{ display: "flex", gap: "0.25rem" }}>
                                <button
                                  onClick={() => selectAllChannelsForBranch(branch.id, branch.channels || [])}
                                  style={{
                                    padding: "0.2rem 0.5rem",
                                    background: "#10b981",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "0.65rem",
                                  }}
                                >
                                  All
                                </button>
                                <button
                                  onClick={() => deselectAllChannelsForBranch(branch.id)}
                                  style={{
                                    padding: "0.2rem 0.5rem",
                                    background: "#6b7280",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "0.65rem",
                                  }}
                                >
                                  None
                                </button>
                              </div>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                              {(branch.channels || []).map((channel) => {
                                const isSelected = (mapping.selectedChannels || []).includes(
                                  channel
                                );
                                const isTakeaway = TAKEAWAY_REGEX.test(channel);
                                return (
                                  <label
                                    key={channel}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "0.25rem",
                                      padding: "0.25rem 0.75rem",
                                      background: isSelected
                                        ? isTakeaway
                                          ? "#dcfce7"
                                          : "#ede9fe"
                                        : "#f3f4f6",
                                      border: isSelected
                                        ? isTakeaway
                                          ? "1px solid #22c55e"
                                          : "1px solid #7c3aed"
                                        : "1px solid #e5e7eb",
                                      borderRadius: "16px",
                                      fontSize: "0.75rem",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() =>
                                        toggleChannelForBranch(branch.id, channel)
                                      }
                                      style={{ width: "14px", height: "14px" }}
                                    />
                                    {channel}
                                    {isTakeaway && (
                                      <span style={{ color: "#16a34a" }}>🥡</span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          {/* Restaurant Group Mapping */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: "0.75rem",
                            }}
                          >
                            <div>
                              <label
                                style={{
                                  display: "block",
                                  fontSize: "0.75rem",
                                  fontWeight: "500",
                                  color: "#6b7280",
                                  marginBottom: "0.25rem",
                                }}
                              >
                                Map to:
                              </label>
                              <select
                                value={mapping.isNewGroup ? "new" : mapping.restaurantGroupId || ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (value === "new") {
                                    updateBranchMapping(branch.id, "isNewGroup", true);
                                    updateBranchMapping(branch.id, "restaurantGroupId", "");
                                    updateBranchMapping(branch.id, "newGroupName", branch.name);
                                  } else if (value === "") {
                                    updateBranchMapping(branch.id, "isNewGroup", false);
                                    updateBranchMapping(branch.id, "restaurantGroupId", "");
                                  } else {
                                    updateBranchMapping(branch.id, "isNewGroup", false);
                                    updateBranchMapping(branch.id, "restaurantGroupId", value);
                                  }
                                }}
                                style={{
                                  width: "100%",
                                  padding: "0.5rem",
                                  border: "1px solid #d1d5db",
                                  borderRadius: "6px",
                                  fontSize: "0.875rem",
                                }}
                              >
                                <option value="">-- Select Option --</option>
                                <option value="new">➕ Create New Group</option>
                                {restaurants.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {mapping.isNewGroup && (
                              <div>
                                <label
                                  style={{
                                    display: "block",
                                    fontSize: "0.75rem",
                                    fontWeight: "500",
                                    color: "#6b7280",
                                    marginBottom: "0.25rem",
                                  }}
                                >
                                  New Group Name:
                                </label>
                                <input
                                  type="text"
                                  value={mapping.newGroupName || ""}
                                  onChange={(e) =>
                                    updateBranchMapping(
                                      branch.id,
                                      "newGroupName",
                                      e.target.value
                                    )
                                  }
                                  placeholder="Restaurant name"
                                  style={{
                                    width: "100%",
                                    padding: "0.5rem",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "6px",
                                    fontSize: "0.875rem",
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Save Button */}
                  <div style={{ marginTop: "1rem" }}>
                    <button
                      onClick={handleSaveMappings}
                      disabled={savingMappings}
                      style={{
                        padding: "0.875rem 2rem",
                        background: savingMappings
                          ? "#9ca3af"
                          : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        cursor: savingMappings ? "not-allowed" : "pointer",
                        fontWeight: "600",
                        width: "100%",
                      }}
                    >
                      {savingMappings ? "Saving..." : "💾 Save Configuration"}
                    </button>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "#6b7280",
                        marginTop: "0.5rem",
                        textAlign: "center",
                      }}
                    >
                      After saving, go to the Dashboard to view reports for your Rista restaurants.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default RistaApiIntegration;
