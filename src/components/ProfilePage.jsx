import React, { useState, useEffect, useRef } from "react";
import { authService } from "../services/authService";
import { restaurantMappingService } from "../services/api";

const ProfilePage = ({ user, onLogout, onBack }) => {
  const [platformIds, setPlatformIds] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editingRestaurant, setEditingRestaurant] = useState(null);
  const [creatingRestaurant, setCreatingRestaurant] = useState(false);
  const [newRestaurant, setNewRestaurant] = useState({
    name: "",
    platforms: {},
  });
  const [unusedPlatformIds, setUnusedPlatformIds] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictResolution, setConflictResolution] = useState(null);

  // Refs to track component mount state and background timeout
  const isMountedRef = useRef(true);
  const backgroundTimeoutRef = useRef(null);

  // Determine back button text based on previous route
  const getBackButtonText = () => {
    const previousRoute = localStorage.getItem("previousRoute");
    if (!previousRoute || previousRoute === "/") {
      return "← Back to Home";
    } else {
      return "← Back to Dashboard";
    }
  };

  useEffect(() => {
    // Set mounted flag to true
    isMountedRef.current = true;

    loadRestaurantsOptimized();

    // Safety timeout - ensure loading never takes more than 3 seconds
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }, 3000);

    return () => {
      // Mark component as unmounted
      isMountedRef.current = false;

      // Clear safety timeout
      clearTimeout(timeoutId);

      // Clear background API refresh timeout if it exists
      if (backgroundTimeoutRef.current) {
        clearTimeout(backgroundTimeoutRef.current);
      }
    };
  }, []);

  const loadRestaurantsOptimized = async () => {
    const startTime = Date.now();
    console.log("🚀 ProfilePage: Starting optimized restaurant loading...");

    try {
      // First, immediately load from localStorage for instant UI
      const userRestaurants = authService.getUserRestaurants();

      if (!userRestaurants) {
        console.warn("No user restaurants found");
        setRestaurants([]);
        setPlatformIds([]);
        setUnusedPlatformIds([]);
        setLoading(false);
        console.log(
          `⚡ ProfilePage: Loading completed in ${Date.now() - startTime}ms (no data)`,
        );
        return;
      }

      const allPlatformIds = userRestaurants.restaurantIds || [];
      setPlatformIds(allPlatformIds);

      // Try to load existing restaurant mappings from localStorage first
      const localMappings = localStorage.getItem("restaurantMappings");
      let mappings = [];

      if (localMappings) {
        try {
          mappings = JSON.parse(localMappings);
          console.log("Loaded mappings from localStorage (instant):", mappings);

          // Set initial state immediately with cached data
          setRestaurants(mappings);
          updateUnusedPlatformIds(mappings, allPlatformIds);
          setLoading(false); // Stop loading immediately
          console.log(
            `⚡ ProfilePage: Loading completed in ${Date.now() - startTime}ms (from cache)`,
          );
        } catch (parseErr) {
          console.error("Failed to parse localStorage mappings:", parseErr);
        }
      } else {
        // No cached data, stop loading immediately with empty state
        setRestaurants([]);
        updateUnusedPlatformIds([], allPlatformIds);
        setLoading(false);
        console.log(
          `⚡ ProfilePage: Loading completed in ${Date.now() - startTime}ms (no cache)`,
        );
      }

      // Background API call to refresh data (doesn't block UI)
      backgroundTimeoutRef.current = setTimeout(async () => {
        try {
          console.log(
            "🔄 Background: Refreshing restaurant mappings from API...",
          );
          const response =
            await restaurantMappingService.getRestaurantMappings();

          // Guard against state updates after unmount
          if (!isMountedRef.current) {
            console.log("⚠️ Component unmounted, skipping background update");
            return;
          }

          if (response.success) {
            const freshMappings = response.data || [];
            console.log("✅ Background: Fresh mappings loaded:", freshMappings);

            // Only update UI if data actually changed
            const currentMappingsStr = JSON.stringify(mappings);
            const freshMappingsStr = JSON.stringify(freshMappings);

            if (currentMappingsStr !== freshMappingsStr) {
              console.log("📊 Background: Data changed, updating UI");

              // Double-check component is still mounted before updating state
              if (isMountedRef.current) {
                setRestaurants(freshMappings);
                updateUnusedPlatformIds(freshMappings, allPlatformIds);
                // Save to localStorage as backup
                localStorage.setItem(
                  "restaurantMappings",
                  JSON.stringify(freshMappings),
                );
              }
            } else {
              console.log("📊 Background: Data unchanged");
            }
          }
        } catch (err) {
          console.log("⚠️ Background API refresh failed (not critical):", err);
          // Don't show error - user already has cached data
        }
      }, 100); // Small delay to not block initial render
    } catch (error) {
      console.error("Error in optimized restaurant loading:", error);
      setError("Failed to load profile data");
      setLoading(false);
    }
  };

  // Helper function to guess the default channel based on platform ID pattern
  const guessChannelForId = (platformId) => {
    const id = platformId?.toString().toLowerCase() || "";
    if (id.includes("zomato") || id.includes("zom")) return "zomato";
    if (id.includes("swiggy") || id.includes("swg")) return "swiggy";
    if (id.includes("takeaway") || id.includes("take")) return "takeaway";
    if (id.includes("sub") || id.includes("subscription")) return "subs";
    return "zomato"; // default
  };

  // Helper function to update unused platform IDs
  const updateUnusedPlatformIds = (currentRestaurants, allPlatformIds) => {
    const usedIds = new Set();
    currentRestaurants.forEach((restaurant) => {
      Object.values(restaurant.platforms || {}).forEach((platformId) => {
        if (platformId) usedIds.add(platformId);
      });
    });
    const unused = allPlatformIds.filter((id) => !usedIds.has(id));
    setUnusedPlatformIds(unused);

    // Detect potential conflicts (restaurants with only one platform ID that might be duplicates)
    detectPotentialConflicts(currentRestaurants);
  };

  // Helper function to detect potential conflicts
  const detectPotentialConflicts = (currentRestaurants) => {
    const potentialConflicts = [];

    // Find restaurants that have only one platform ID and similar names
    const singlePlatformRestaurants = currentRestaurants.filter(
      (restaurant) => {
        const platformCount = Object.values(restaurant.platforms || {}).filter(
          (id) => id,
        ).length;
        return platformCount === 1;
      },
    );

    // Helper function: Calculate Levenshtein distance for fuzzy matching
    const levenshteinDistance = (str1, str2) => {
      const m = str1.length;
      const n = str2.length;
      const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;

      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (str1[i - 1] === str2[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1];
          } else {
            dp[i][j] = Math.min(
              dp[i - 1][j] + 1,     // deletion
              dp[i][j - 1] + 1,     // insertion
              dp[i - 1][j - 1] + 1  // substitution
            );
          }
        }
      }

      return dp[m][n];
    };

    // Helper function: Calculate similarity ratio (0 to 1)
    const similarityRatio = (str1, str2) => {
      const distance = levenshteinDistance(str1, str2);
      const maxLength = Math.max(str1.length, str2.length);
      return maxLength === 0 ? 1 : 1 - distance / maxLength;
    };

    // Enhanced normalization that preserves digits and meaningful characters
    const normalizeRestaurantName = (name) => {
      return name
        .normalize('NFKC')                    // Unicode normalization
        .toLowerCase()                         // Fold to lowercase
        .replace(/[^\w\s'-]/g, '')            // Remove punctuation except hyphens and apostrophes
        .replace(/\s+/g, ' ')                 // Collapse consecutive whitespace to single space
        .trim();                               // Trim leading/trailing whitespace
    };

    // Group by fuzzy matching with configurable threshold
    const SIMILARITY_THRESHOLD = 0.85; // 85% similarity to consider as potential duplicate
    const processedRestaurants = new Set();

    singlePlatformRestaurants.forEach((restaurant, index) => {
      if (processedRestaurants.has(restaurant.id)) return;

      const normalizedName1 = normalizeRestaurantName(restaurant.name);
      const similarGroup = [restaurant];

      // Compare with all other restaurants
      for (let j = index + 1; j < singlePlatformRestaurants.length; j++) {
        const otherRestaurant = singlePlatformRestaurants[j];

        if (processedRestaurants.has(otherRestaurant.id)) continue;

        const normalizedName2 = normalizeRestaurantName(otherRestaurant.name);

        // Use fuzzy matching with Levenshtein distance
        const similarity = similarityRatio(normalizedName1, normalizedName2);

        if (similarity >= SIMILARITY_THRESHOLD) {
          similarGroup.push(otherRestaurant);
          processedRestaurants.add(otherRestaurant.id);
        }
      }

      // Mark the first restaurant as processed
      processedRestaurants.add(restaurant.id);

      // If we found similar restaurants, add to conflicts
      if (similarGroup.length > 1) {
        potentialConflicts.push({
          restaurants: similarGroup,
          suggestedAction: "merge",
          reason: `Similar restaurant names (${Math.round(similarityRatio(
            normalizeRestaurantName(similarGroup[0].name),
            normalizeRestaurantName(similarGroup[1].name)
          ) * 100)}% match) with single platform IDs`,
        });
      }
    });

    setConflicts(potentialConflicts);
  };

  const handleEditRestaurant = (restaurantId) => {
    setEditingRestaurant(restaurantId);
  };

  const handleSaveRestaurant = async (restaurantId) => {
    try {
      setSaving(true);
      console.log("Saving restaurants:", restaurants);

      // Save to backend using the API service
      const result =
        await restaurantMappingService.saveRestaurantMappings(restaurants);
      console.log("Save result:", result);

      if (result.success) {
        setEditingRestaurant(null);
        setError(null);
        // Update unused platform IDs
        updateUnusedPlatformIds(restaurants, platformIds);
        // Save to localStorage as backup
        localStorage.setItem("restaurantMappings", JSON.stringify(restaurants));
        console.log("Successfully saved restaurant mappings");
      } else {
        setError("Failed to save restaurant data: " + result.error);
        console.error("Save failed:", result.error);
      }
    } catch (err) {
      setError("Failed to save restaurant data: " + err.message);
      console.error("Error saving restaurant:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = (restaurantId) => {
    setEditingRestaurant(null);
  };

  const handleInputChange = (restaurantId, field, value) => {
    setRestaurants((prev) =>
      prev.map((restaurant) =>
        restaurant.id === restaurantId
          ? { ...restaurant, [field]: value }
          : restaurant,
      ),
    );
  };

  const handlePlatformChange = (restaurantId, channel, platformId) => {
    // If platformId is being assigned, check if it's currently used by another restaurant
    if (platformId) {
      const currentlyUsedBy = restaurants.find(
        (r) =>
          r.id !== restaurantId &&
          Object.values(r.platforms || {}).includes(platformId),
      );

      if (currentlyUsedBy) {
        // Show confirmation dialog for reassignment
        const confirmMessage = `Platform ID "${platformId}" is currently assigned to "${currentlyUsedBy.name}". Do you want to move it to this restaurant? This will remove it from "${currentlyUsedBy.name}".`;

        if (window.confirm(confirmMessage)) {
          // Remove the platform ID from the current restaurant
          setRestaurants((prev) =>
            prev.map((restaurant) => {
              if (restaurant.id === currentlyUsedBy.id) {
                // Remove the platform ID from all channels of the current restaurant
                const updatedPlatforms = { ...restaurant.platforms };
                Object.keys(updatedPlatforms).forEach((key) => {
                  if (updatedPlatforms[key] === platformId) {
                    updatedPlatforms[key] = "";
                  }
                });
                return { ...restaurant, platforms: updatedPlatforms };
              } else if (restaurant.id === restaurantId) {
                // Add the platform ID to the target restaurant
                return {
                  ...restaurant,
                  platforms: {
                    ...restaurant.platforms,
                    [channel]: platformId,
                  },
                };
              }
              return restaurant;
            }),
          );

          // Check if the restaurant we removed the ID from is now empty and should be deleted
          setTimeout(() => {
            setRestaurants((prev) => {
              const updatedCurrentlyUsedBy = prev.find(
                (r) => r.id === currentlyUsedBy.id,
              );
              if (updatedCurrentlyUsedBy) {
                const remainingPlatforms = Object.values(
                  updatedCurrentlyUsedBy.platforms || {},
                ).filter((id) => id && id.trim());
                if (remainingPlatforms.length === 0) {
                  if (window.confirm(
                    `"${currentlyUsedBy.name}" no longer has any platform IDs. Do you want to delete this restaurant?`,
                  )) {
                    return prev.filter((r) => r.id !== currentlyUsedBy.id);
                  }
                }
              }
              return prev;
            });
          }, 100);
        }
        return; // Don't proceed with the normal assignment if user cancelled
      }
    }

    // Normal assignment (no conflict)
    setRestaurants((prev) =>
      prev.map((restaurant) =>
        restaurant.id === restaurantId
          ? {
            ...restaurant,
            platforms: {
              ...restaurant.platforms,
              [channel]: platformId,
            },
          }
          : restaurant,
      ),
    );
  };

  const handleCreateRestaurant = () => {
    setCreatingRestaurant(true);
    setNewRestaurant({ name: "", platforms: {} });
  };

  const handleSaveNewRestaurant = async () => {
    if (!newRestaurant.name.trim()) {
      setError("Restaurant name is required");
      return;
    }

    // Check for conflicts with assigned platform IDs
    const conflictingAssignments = [];
    Object.entries(newRestaurant.platforms).forEach(([channel, platformId]) => {
      if (platformId) {
        const assignedTo = restaurants.find((r) =>
          Object.values(r.platforms || {}).includes(platformId),
        );
        if (assignedTo) {
          conflictingAssignments.push({
            platformId,
            channel,
            assignedTo: assignedTo.name,
            restaurantId: assignedTo.id,
          });
        }
      }
    });

    // If there are conflicts, ask for confirmation
    if (conflictingAssignments.length > 0) {
      const conflictMessage = `The following platform IDs are already assigned:\n${conflictingAssignments
        .map((c) => `• ${c.platformId} (assigned to ${c.assignedTo})`)
        .join("\n")}\n\nDo you want to move them to this new restaurant?`;

      if (!window.confirm(conflictMessage)) {
        return;
      }

      // Remove platform IDs from existing restaurants
      setRestaurants((prev) =>
        prev.map((restaurant) => {
          const conflictingPlatformIds = conflictingAssignments
            .filter((c) => c.restaurantId === restaurant.id)
            .map((c) => c.platformId);

          if (conflictingPlatformIds.length > 0) {
            const updatedPlatforms = { ...restaurant.platforms };
            Object.keys(updatedPlatforms).forEach((key) => {
              if (conflictingPlatformIds.includes(updatedPlatforms[key])) {
                updatedPlatforms[key] = "";
              }
            });
            return { ...restaurant, platforms: updatedPlatforms };
          }
          return restaurant;
        }),
      );
    }

    setSaving(true);
    try {
      const restaurant = {
        id: `restaurant_${Date.now()}`,
        name: newRestaurant.name,
        platforms: newRestaurant.platforms,
        createdAt: new Date().toISOString(),
      };

      const updatedRestaurants = [...restaurants, restaurant];
      setRestaurants(updatedRestaurants);

      // Save to backend using the API service
      const result =
        await restaurantMappingService.saveRestaurantMappings(
          updatedRestaurants,
        );

      if (!result.success) {
        setError(
          "Saved locally but failed to sync with server: " + result.error,
        );
      }

      setCreatingRestaurant(false);
      setNewRestaurant({ name: "", platforms: {} });
      setError(null);
      // Update unused platform IDs
      updateUnusedPlatformIds(updatedRestaurants, platformIds);

      // Check if any restaurants are now empty and should be deleted
      if (conflictingAssignments.length > 0) {
        setTimeout(() => {
          // Use functional state updater to avoid stale closure
          setRestaurants((prev) => {
            // Compute empty restaurants from current state
            const emptyRestaurants = prev.filter((r) => {
              const remainingPlatforms = Object.values(r.platforms || {}).filter(
                (id) => id && id.trim(),
              );
              return remainingPlatforms.length === 0;
            });

            // If there are empty restaurants, prompt user
            if (emptyRestaurants.length > 0) {
              const emptyNames = emptyRestaurants.map((r) => r.name).join(", ");
              if (
                window.confirm(
                  `The following restaurants no longer have any platform IDs: ${emptyNames}. Do you want to delete them?`,
                )
              ) {
                // Return filtered state (removing empty restaurants)
                return prev.filter(
                  (r) => !emptyRestaurants.some((empty) => empty.id === r.id),
                );
              }
            }

            // Return unchanged state if no empty restaurants or user declined
            return prev;
          });
        }, 200);
      }
    } catch (err) {
      setError("Failed to save restaurant: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelNewRestaurant = () => {
    setCreatingRestaurant(false);
    setNewRestaurant({ name: "", platforms: {} });
  };

  const handleDeleteRestaurant = async (restaurantId) => {
    if (
      window.confirm("Are you sure you want to delete this restaurant mapping?")
    ) {
      setSaving(true);
      try {
        const updatedRestaurants = restaurants.filter(
          (r) => r.id !== restaurantId,
        );
        setRestaurants(updatedRestaurants);

        // Save to backend using the API service
        const result =
          await restaurantMappingService.saveRestaurantMappings(
            updatedRestaurants,
          );

        if (!result.success) {
          setError(
            "Deleted locally but failed to sync with server: " + result.error,
          );
        }

        // Update unused platform IDs
        updateUnusedPlatformIds(updatedRestaurants, platformIds);
      } catch (err) {
        setError("Failed to delete restaurant: " + err.message);
      } finally {
        setSaving(false);
      }
    }
  };

  const getUsedPlatformIds = (excludeRestaurantId = null) => {
    const usedIds = new Set();
    restaurants.forEach((restaurant) => {
      if (restaurant.id !== excludeRestaurantId) {
        Object.values(restaurant.platforms || {}).forEach((platformId) => {
          if (platformId) usedIds.add(platformId);
        });
      }
    });
    return usedIds;
  };

  const handleConflictResolution = (action, duplicatesToRemove = []) => {
    if (action === "merge" && conflictResolution) {
      // Apply the original platform change
      setRestaurants((prev) => {
        let updated = prev.map((restaurant) =>
          restaurant.id === conflictResolution.targetRestaurant.id
            ? conflictResolution.targetRestaurant
            : restaurant,
        );

        // Remove selected duplicates
        updated = updated.filter(
          (restaurant) => !duplicatesToRemove.includes(restaurant.id),
        );

        // Save to backend
        setSaving(true);
        restaurantMappingService
          .saveRestaurantMappings(updated)
          .then((result) => {
            if (result.success) {
              updateUnusedPlatformIds(updated, platformIds);
              localStorage.setItem(
                "restaurantMappings",
                JSON.stringify(updated),
              );
              console.log("✅ Merged restaurants saved successfully");
              setError(null);
            } else {
              console.error("Failed to save merged restaurants:", result.error);
              setError("Failed to save merged restaurants: " + result.error);
            }
          })
          .catch((err) => {
            console.error("Failed to save merged restaurants:", err);
            setError("Failed to save merged restaurants: " + err.message);
          })
          .finally(() => {
            setSaving(false);
          });

        return updated;
      });
    } else {
      // If not merging, just clear the error
      setError(null);
    }

    setShowConflictDialog(false);
    setConflictResolution(null);
  };

  const handleCancelConflictResolution = () => {
    setShowConflictDialog(false);
    setConflictResolution(null);
  };

  const handleLogout = () => {
    authService.logout();
    if (onLogout) onLogout();
  };

  const channels = [
    { value: "zomato", label: "Zomato" },
    { value: "swiggy", label: "Swiggy" },
  ];

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-container">
          <div className="profile-header">
            <h1>Profile</h1>
            <button className="btn-back" onClick={onBack}>
              {getBackButtonText()}
            </button>
          </div>
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading your restaurant data...</p>
            <small style={{ color: "#666", marginTop: "0.5rem" }}>
              This should only take a moment
            </small>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="profile-header">
          <h1>Profile</h1>
          <button className="btn-back" onClick={onBack}>
            {getBackButtonText()}
          </button>
        </div>
        {error && <div className="error-message">{error}</div>}
        {/* User Info Section */}
        <div className="profile-section">
          <h2>Account Information</h2>
          <div className="user-info-card">
            <div className="user-info-row">
              <label>Business Name:</label>
              <span>
                {user?.businessName ||
                  user?.restaurantName ||
                  user?.name ||
                  "N/A"}
              </span>
            </div>
            <div className="user-info-row">
              <label>Email:</label>
              <span>{user?.businessEmail || user?.email}</span>
            </div>
            <div className="user-info-row">
              <label>Authentication Method:</label>
              <span>
                {authService.getAuthMethod() === "google"
                  ? "Google OAuth"
                  : "Email & Password"}
              </span>
            </div>
            <div className="user-actions">
              <button className="btn-logout" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
        {/* Restaurants Section */}
        <div className="profile-section">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.5rem",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <h2>Your Restaurants ({restaurants.length})</h2>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {conflicts.length > 0 && (
                <button
                  className="btn-edit"
                  onClick={() => {
                    // Show conflict resolution options for all conflicts
                    if (conflicts.length > 0) {
                      const firstConflict = conflicts[0];
                      setConflictResolution({
                        targetRestaurant: firstConflict.restaurants[0],
                        potentialDuplicates: firstConflict.restaurants.slice(1),
                        channel: "manual",
                        platformId: "manual-merge",
                      });
                      setShowConflictDialog(true);
                    }
                  }}
                  disabled={saving}
                  style={{ backgroundColor: "#f59e0b", borderColor: "#f59e0b" }}
                >
                  🔄 Resolve Conflicts ({conflicts.length})
                </button>
              )}
              <button
                className="btn-edit"
                onClick={handleCreateRestaurant}
                disabled={saving || creatingRestaurant}
              >
                + Create Restaurant Group
              </button>
            </div>
          </div>

          {/* Show conflicts warning */}
          {conflicts.length > 0 && (
            <div
              style={{
                background: "#fef3c7",
                border: "1px solid #f59e0b",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <strong>⚠️ Potential Duplicate Restaurants Detected:</strong>
              <br />
              {conflicts.map((conflict, index) => (
                <div
                  key={index}
                  style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}
                >
                  • {conflict.restaurants.map((r) => r.name).join(", ")} might
                  be the same restaurant
                </div>
              ))}
              <small>Consider merging these when updating platform IDs.</small>
            </div>
          )}

          {/* Show unassigned restaurant IDs */}
          {unusedPlatformIds.length > 0 && (
            <div
              style={{
                background: "#e0f2fe",
                border: "1px solid #0284c7",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <strong>
                🏪 Unassigned Restaurant IDs ({unusedPlatformIds.length}):
              </strong>
              <div
                style={{
                  marginTop: "0.5rem",
                  fontFamily: "monospace",
                  fontSize: "0.9rem",
                }}
              >
                {unusedPlatformIds.join(", ")}
              </div>
              <small style={{ display: "block", marginTop: "0.5rem" }}>
                These restaurant IDs are available in your reports but not
                organized into restaurant groups. Click "Add Restaurant" to
                create organized groups for easier management.
              </small>
            </div>
          )}

          {/* Show no unassigned IDs message */}
          {unusedPlatformIds.length === 0 && restaurants.length > 0 && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #16a34a",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <strong>✅ All restaurant IDs are organized!</strong>
              <br />
              <small>
                All your restaurant IDs have been assigned to restaurant groups.
              </small>
            </div>
          )}

          {creatingRestaurant && (
            <div
              className="restaurant-card"
              style={{ border: "2px dashed var(--primary-purple)" }}
            >
              <div className="restaurant-header">
                <div className="restaurant-id">New Restaurant</div>
              </div>
              <div className="restaurant-content">
                <div className="form-group">
                  <label>Restaurant Name:</label>
                  <input
                    type="text"
                    value={newRestaurant.name}
                    onChange={(e) =>
                      setNewRestaurant((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    className="form-control"
                    placeholder="Enter restaurant name"
                    autoFocus
                  />
                </div>
                {channels.map((channelObj) => {
                  const channel = channelObj.value;
                  return (
                    <div key={channel} className="form-group">
                      <label>
                        {channelObj.label} ID:
                      </label>
                      <select
                        value={newRestaurant.platforms[channel] || ""}
                        onChange={(e) =>
                          setNewRestaurant((prev) => ({
                            ...prev,
                            platforms: {
                              ...prev.platforms,
                              [channel]: e.target.value,
                            },
                          }))
                        }
                        className="form-control"
                      >
                        <option value="">Select Platform ID</option>
                        {platformIds.map((platformId) => {
                          const assignedTo = restaurants.find((r) =>
                            Object.values(r.platforms || {}).includes(
                              platformId,
                            ),
                          );
                          return (
                            <option key={platformId} value={platformId}>
                              {platformId}
                              {assignedTo
                                ? ` (assigned to ${assignedTo.name})`
                                : " (available)"}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  );
                })}
                <div
                  style={{
                    marginTop: "1rem",
                    display: "flex",
                    gap: "0.5rem",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    className="btn-save"
                    onClick={handleSaveNewRestaurant}
                    disabled={!newRestaurant.name.trim()}
                  >
                    Save
                  </button>
                  <button
                    className="btn-cancel"
                    onClick={handleCancelNewRestaurant}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {restaurants.length === 0 && !creatingRestaurant ? (
            <div className="empty-state">
              <p>No restaurant groups created yet.</p>
              <p>
                Your restaurant IDs are available for direct use in reports.
              </p>
              <p>
                Create restaurant groups to organize multiple platform IDs or
                give them meaningful names.
              </p>
            </div>
          ) : (
            <div className="restaurants-grid">
              {restaurants.map((restaurant) => {
                const isEditing = editingRestaurant === restaurant.id;

                // Check if this restaurant is part of a conflict
                const isInConflict = conflicts.some((conflict) =>
                  conflict.restaurants.some((r) => r.id === restaurant.id),
                );

                // Check if this restaurant has only one platform ID (potential for merging)
                const platformCount = Object.values(
                  restaurant.platforms || {},
                ).filter((id) => id).length;

                return (
                  <div
                    key={restaurant.id}
                    className="restaurant-card"
                    style={{
                      border: isInConflict ? "2px solid #f59e0b" : undefined,
                      position: "relative",
                    }}
                  >
                    {isInConflict && (
                      <div
                        style={{
                          position: "absolute",
                          top: "-8px",
                          right: "-8px",
                          backgroundColor: "#f59e0b",
                          color: "white",
                          borderRadius: "50%",
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "12px",
                          fontWeight: "bold",
                        }}
                      >
                        ⚠️
                      </div>
                    )}

                    <div className="restaurant-header">
                      <div className="restaurant-id">
                        {restaurant.name}
                        {platformCount === 1 && (
                          <span
                            style={{
                              marginLeft: "0.5rem",
                              fontSize: "0.75rem",
                              color: "#6b7280",
                              fontWeight: "normal",
                            }}
                          >
                            (Single Platform)
                          </span>
                        )}
                      </div>
                      {!isEditing && (
                        <div>
                          <button
                            className="btn-edit"
                            onClick={() => handleEditRestaurant(restaurant.id)}
                            disabled={saving}
                            style={{ marginRight: "0.5rem" }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-cancel"
                            onClick={() =>
                              handleDeleteRestaurant(restaurant.id)
                            }
                            disabled={saving}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="restaurant-content">
                      <div className="form-group">
                        <label>Restaurant Name:</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={restaurant.name}
                            onChange={(e) =>
                              handleInputChange(
                                restaurant.id,
                                "name",
                                e.target.value,
                              )
                            }
                            className="form-control"
                            placeholder="Enter restaurant name"
                          />
                        ) : (
                          <div className="display-value">{restaurant.name}</div>
                        )}
                      </div>

                      {channels.map((channelObj) => {
                        const channel = channelObj.value;
                        return (
                          <div key={channel} className="form-group">
                            <label>
                              {channelObj.label} ID:
                            </label>
                            {isEditing ? (
                              <select
                                value={restaurant.platforms[channel] || ""}
                                onChange={(e) =>
                                  handlePlatformChange(
                                    restaurant.id,
                                    channel,
                                    e.target.value,
                                  )
                                }
                                className="form-control"
                              >
                                <option value="">No Platform ID</option>
                                {platformIds.map((platformId) => {
                                  const isCurrentlyAssigned =
                                    restaurant.platforms[channel] ===
                                    platformId;
                                  const assignedTo = restaurants.find(
                                    (r) =>
                                      r.id !== restaurant.id &&
                                      Object.values(r.platforms || {}).includes(
                                        platformId,
                                      ),
                                  );

                                  return (
                                    <option key={platformId} value={platformId}>
                                      {platformId}
                                      {assignedTo && !isCurrentlyAssigned
                                        ? ` (assigned to ${assignedTo.name})`
                                        : ""}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <div className="display-value">
                                {restaurant.platforms[channel] || "Not set"}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {isEditing && (
                      <div className="restaurant-actions">
                        <button
                          className="btn-save"
                          onClick={() => handleSaveRestaurant(restaurant.id)}
                          disabled={saving || !restaurant.name.trim()}
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          className="btn-cancel"
                          onClick={() => handleCancelEdit(restaurant.id)}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>{" "}
        <div className="profile-section">
          <h2>How to Use</h2>
          <div className="instructions">
            <div className="instruction-item">
              <strong>Restaurant IDs:</strong> Your uploaded data contains
              restaurant IDs (like "19251816"). These are automatically
              available in your reports and dashboards.
            </div>
            <div className="instruction-item">
              <strong>Restaurant Groups (Optional):</strong> Create restaurant
              groups to organize multiple platform IDs under meaningful names.
              This is helpful if you have the same restaurant on multiple
              platforms (Zomato, Swiggy).
            </div>
            <div className="instruction-item">
              <strong>Unassigned IDs:</strong> Restaurant IDs that aren't
              assigned to any group are shown above. You can use these directly
              in reports or organize them into groups for better management.
            </div>
            <div className="instruction-item">
              <strong>Platform Mapping:</strong> When creating restaurant
              groups, assign platform IDs to the correct channels (Zomato,
              Swiggy) to get accurate channel-specific insights.
            </div>
            <div className="instruction-item">
              <strong>Multiple Locations:</strong> If you have multiple
              restaurant locations, create separate restaurant groups for each
              location to track them individually.
            </div>
          </div>
        </div>
      </div>

      {/* Conflict Resolution Dialog */}
      {showConflictDialog && conflictResolution && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "2rem",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow:
                "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
            }}
          >
            <h3 style={{ marginTop: 0, color: "#7c3aed" }}>
              🔄 Merge Duplicate Restaurants?
            </h3>

            <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
              You're adding a <strong>{conflictResolution.channel}</strong>{" "}
              platform ID to{" "}
              <strong>"{conflictResolution.targetRestaurant.name}"</strong>.
              <br />
              <br />
              We found potentially duplicate restaurants that might represent
              the same business:
            </p>

            <div style={{ marginBottom: "1.5rem" }}>
              {conflictResolution.potentialDuplicates.map((duplicate) => {
                const platformIds = Object.values(
                  duplicate.platforms || {},
                ).filter((id) => id);
                return (
                  <div
                    key={duplicate.id}
                    style={{
                      border: "1px solid #d1d5db",
                      borderRadius: "8px",
                      padding: "1rem",
                      marginBottom: "0.5rem",
                      backgroundColor: "#f9fafb",
                    }}
                  >
                    <strong>{duplicate.name}</strong>
                    <br />
                    <small>
                      Platform IDs: {platformIds.join(", ") || "None"}
                    </small>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                gap: "1rem",
                flexDirection: window.innerWidth < 480 ? "column" : "row",
              }}
            >
              <button
                style={{
                  flex: 1,
                  padding: "0.75rem 1rem",
                  backgroundColor: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "500",
                }}
                onClick={() =>
                  handleConflictResolution(
                    "merge",
                    conflictResolution.potentialDuplicates.map((d) => d.id),
                  )
                }
              >
                ✅ Merge & Delete Duplicates
              </button>
              <button
                style={{
                  flex: 1,
                  padding: "0.75rem 1rem",
                  backgroundColor: "#6b7280",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "500",
                }}
                onClick={handleCancelConflictResolution}
              >
                ❌ Keep Separate
              </button>
            </div>

            <p
              style={{
                fontSize: "0.875rem",
                color: "#6b7280",
                marginTop: "1rem",
                marginBottom: 0,
              }}
            >
              <strong>Merge:</strong> Combines platform IDs into one restaurant
              and removes duplicates.
              <br />
              <strong>Keep Separate:</strong> Maintains current structure
              without changes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
