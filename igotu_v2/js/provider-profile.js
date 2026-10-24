import { authorizeWorkspace } from "./profile-guard.js";
import { supabase } from "./supabaseClient.js";

const L = window.L;
const isOnboardingMode = document.body.dataset.page === "provider-complete-profile";

let map = null;
let marker = null;
let accuracyCircle = null;
let currentBaseLayer = null;
let baseLayerRetryTimer = null;
let activeMapSource = 0;

// Use basemap sources that do not require a CARTO API key.
// CARTO was removed because it now returns an 'API KEY REQUIRED' placeholder
// as a successful PNG response; Leaflet's tileerror fallback cannot catch it.
// OpenStreetMap is primary; Esri World Street Map is a backup if tiles fail.
const MAP_TILE_SOURCES = [
  {
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  {
    name: "Esri World Street Map",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri; map data contributors',
    maxZoom: 19,
  },
];

// A blank grey map with a visible pin means Leaflet loaded but image tiles did not.
function loadMapTiles(sourceIndex = 0) {
  if (!map || !L) return;

  if (baseLayerRetryTimer) {
    clearTimeout(baseLayerRetryTimer);
    baseLayerRetryTimer = null;
  }
  if (currentBaseLayer) {
    currentBaseLayer.off();
    map.removeLayer(currentBaseLayer);
  }

  activeMapSource = sourceIndex;
  const source = MAP_TILE_SOURCES[sourceIndex];
  let errors = 0;
  let hasLoadedATile = false;

  const layer = L.tileLayer(source.url, {
    maxZoom: source.maxZoom,
    attribution: source.attribution,
    // Do not use cached error images, and avoid overloading public tile servers.
    updateWhenIdle: true,
    keepBuffer: 2,
  });
  currentBaseLayer = layer;

  const tryNextSource = () => {
    if (currentBaseLayer !== layer) return;
    if (sourceIndex + 1 < MAP_TILE_SOURCES.length) {
      setMapStatus(`Map tiles from ${source.name} are unavailable. Loading a backup map...`);
      loadMapTiles(sourceIndex + 1);
    } else {
      setMapStatus("The map background could not load. Check your connection or browser extensions and allow the map tile websites. You can still search or use GPS to set the pin.");
    }
  };

  layer.on("tileload", () => {
    if (currentBaseLayer !== layer) return;
    hasLoadedATile = true;
    if (baseLayerRetryTimer) {
      clearTimeout(baseLayerRetryTimer);
      baseLayerRetryTimer = null;
    }
    setMapStatus("Map ready. Click, search or drag the marker to choose your provider location.");
  });

  layer.on("tileerror", (event) => {
    if (currentBaseLayer !== layer) return;
    errors += 1;
    if (errors >= 2 && !hasLoadedATile) {
      console.warn(`IGotU: Map tiles failed from ${source.name}`, event);
      tryNextSource();
    }
  });

  layer.addTo(map);
  // Some browsers/extensions leave tile images pending without firing tileerror.
  // Switch sources if not even one tile appears within 7 seconds.
  baseLayerRetryTimer = setTimeout(() => {
    baseLayerRetryTimer = null;
    if (!hasLoadedATile && currentBaseLayer === layer) tryNextSource();
  }, 7000);
}


const defaultLat = 6.0367;
const defaultLng = 116.1186;

// day_of_week follows PostgreSQL / JavaScript convention: 0 = Sunday, 1 = Monday.
const WEEK_DAYS = [
  { day: 1, name: "Monday", short: "Mon" },
  { day: 2, name: "Tuesday", short: "Tue" },
  { day: 3, name: "Wednesday", short: "Wed" },
  { day: 4, name: "Thursday", short: "Thu" },
  { day: 5, name: "Friday", short: "Fri" },
  { day: 6, name: "Saturday", short: "Sat" },
  { day: 0, name: "Sunday", short: "Sun" },
];
let weeklyScheduleLoadFailed = false;

const SERVICE_SPECIALIZATIONS = {
  Cleaning: ["Home Cleaning", "Deep Cleaning", "Move-in / Move-out Cleaning", "Office Cleaning", "Post-event Cleaning", "General Cleaning"],
  Delivery: ["Food Delivery", "Grocery Delivery", "Parcel Delivery", "Document Delivery", "General Delivery"],
  Repair: ["Roofing", "Plumbing", "Electrical", "Appliance Repair", "Furniture Repair", "General Repair"],
  "Moving Help": ["Furniture Moving", "House Moving", "Room Moving", "Packing & Unpacking", "Loading & Unloading", "General Moving Help"],
  Errands: ["Grocery Shopping", "Queueing", "Item Pickup", "Document Collection", "Personal Runner", "General Errands"],
  Tutoring: ["Mathematics", "Science", "English / MUET", "ICT / Computer", "General Tutoring"],
  Other: ["Event Setup", "General Assistance", "Other Service"],
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMessage(message, type = "error") {
  const messageBox = document.getElementById("messageBox");

  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = `message-box ${type}`;
}

function clearMessage() {
  const messageBox = document.getElementById("messageBox");

  if (!messageBox) return;

  messageBox.textContent = "";
  messageBox.className = "message-box hidden";
}

function setButtonLoading(button, isLoading, loadingText, normalText) {
  if (!button) return;

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : normalText;
}

function setMapStatus(message) {
  const mapStatus = document.getElementById("mapStatus");

  if (!mapStatus) return;

  mapStatus.textContent = message;
}

async function getSessionUser() {
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    window.location.href = "../login.html";
    return null;
  }

  return data.session.user;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) {
    window.location.href = "../login.html";
    return null;
  }

  if (data.role !== "provider" || data.status !== "active") {
    await supabase.auth.signOut();
    window.location.href = "../login.html";
    return null;
  }

  return data;
}

function displayUser(profile) {
  const fullName = profile.full_name || "Provider";
  const initial = fullName.charAt(0).toUpperCase();

  document.getElementById("userName").textContent = fullName;
  document.getElementById("userRole").textContent =
    `Provider · ${profile.user_code}`;
  document.getElementById("avatar").textContent = initial;

  const editAvatar = document.getElementById("editProviderAvatar");
  const editName = document.getElementById("editProviderDisplayName");

  if (editAvatar) editAvatar.textContent = initial;
  if (editName) editName.textContent = fullName;
}

function loadBasicProfileFields(profile) {
  const fullNameInput = document.getElementById("fullName");
  const phoneInput = document.getElementById("phone");

  if (fullNameInput) fullNameInput.value = profile.full_name || "";
  if (phoneInput) phoneInput.value = profile.phone || "";
}

async function handleLogout() {
  const logoutBtn = document.getElementById("logoutBtn");

  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async function (event) {
    event.preventDefault();
    localStorage.removeItem("igotu_user");
    await supabase.auth.signOut();
    window.location.href = "../login.html";
  });
}

function getSelectedSkills() {
  const checkedSkills = document.querySelectorAll(
    'input[name="skills"]:checked',
  );

  return Array.from(checkedSkills).map(function (checkbox) {
    return checkbox.value;
  });
}

function setSelectedSkills(skills) {
  const checkboxes = document.querySelectorAll('input[name="skills"]');

  checkboxes.forEach(function (checkbox) {
    checkbox.checked = skills.includes(checkbox.value);
  });
}

function getSelectedSpecializations() {
  return Array.from(
    document.querySelectorAll('input[name="specializations"]:checked'),
  ).map(function (checkbox) {
    return {
      category: checkbox.dataset.category,
      specialization: checkbox.value,
    };
  });
}

function renderSpecializationOptions(selectedRows = null) {
  const container = document.getElementById("specializationContainer");
  if (!container) return;

  const selectedCategories = getSelectedSkills();
  const existingSelections = selectedRows
    ? new Set(selectedRows.map((row) => `${row.category}|||${row.specialization}`))
    : new Set(getSelectedSpecializations().map((row) => `${row.category}|||${row.specialization}`));

  if (selectedCategories.length === 0) {
    container.innerHTML = '<div class="specialization-empty">Select at least one Service Skill above to choose your specializations.</div>';
    return;
  }

  container.innerHTML = selectedCategories
    .map(function (category) {
      const options = SERVICE_SPECIALIZATIONS[category] || [];
      return `
        <div class="specialization-group">
          <div class="specialization-group-title">${escapeHtml(category)}</div>
          <div class="checkbox-grid specialization-checkbox-grid">
            ${options
              .map(function (specialization) {
                const key = `${category}|||${specialization}`;
                const checked = existingSelections.has(key) ? "checked" : "";
                return `
                  <label>
                    <input type="checkbox" name="specializations" data-category="${escapeHtml(category)}" value="${escapeHtml(specialization)}" ${checked} />
                    ${escapeHtml(specialization)}
                  </label>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function setupSpecializationSelector() {
  document.querySelectorAll('input[name="skills"]').forEach(function (checkbox) {
    checkbox.addEventListener("change", function () {
      renderSpecializationOptions();
    });
  });
}

function updateCoordinateFields(lat, lng) {
  document.getElementById("providerLat").value = Number(lat).toFixed(7);
  document.getElementById("providerLng").value = Number(lng).toFixed(7);
}

async function reverseGeocode(lat, lng) {
  const locationInput = document.getElementById("location");

  try {
    setMapStatus("Finding address from selected location...");

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data && data.display_name) {
      locationInput.value = data.display_name;
      setMapStatus("Provider location selected successfully.");
    } else {
      locationInput.value = `${Number(lat).toFixed(7)}, ${Number(lng).toFixed(7)}`;
      setMapStatus("Location selected, but address name was not found.");
    }
  } catch (error) {
    console.error("Reverse geocode error:", error);
    locationInput.value = `${Number(lat).toFixed(7)}, ${Number(lng).toFixed(7)}`;
    setMapStatus(
      "Location selected. Address search failed, but coordinates are saved.",
    );
  }
}

function setMarkerLocation(lat, lng, shouldUpdateAddress = true) {
  if (!marker || !map) return;

  marker.setLatLng([lat, lng]);
  map.setView([lat, lng], 16);
  updateCoordinateFields(lat, lng);

  if (shouldUpdateAddress) {
    reverseGeocode(lat, lng);
  }
}

function initMap() {
  if (!L) {
    showMessage("Map library failed to load. Please check your internet connection.");
    setMapStatus("Map library unavailable. Refresh the page when connected.");
    return;
  }

  if (map) return;
  const mapElement = document.getElementById("providerMap");
  if (!mapElement) return;

  const latInput = document.getElementById("providerLat").value.trim();
  const lngInput = document.getElementById("providerLng").value.trim();

  const hasExistingCoordinates =
    latInput !== "" &&
    lngInput !== "" &&
    !Number.isNaN(Number(latInput)) &&
    !Number.isNaN(Number(lngInput));

  const mapLat = hasExistingCoordinates ? Number(latInput) : defaultLat;
  const mapLng = hasExistingCoordinates ? Number(lngInput) : defaultLng;

  map = L.map(mapElement).setView([mapLat, mapLng], 14);
  marker = L.marker([mapLat, mapLng], { draggable: true }).addTo(map);

  if (hasExistingCoordinates) {
    updateCoordinateFields(mapLat, mapLng);
    setMapStatus("Loading your saved provider location...");
  } else {
    setMapStatus("Loading map...");
  }

  map.on("click", function (event) {
    setMarkerLocation(event.latlng.lat, event.latlng.lng, true);
  });

  marker.on("dragend", function () {
    const position = marker.getLatLng();
    setMarkerLocation(position.lat, position.lng, true);
  });

  loadMapTiles(0);

  // Correct Leaflet's calculated size after layout or window changes.
  setTimeout(() => map.invalidateSize({ pan: false }), 250);
  window.addEventListener("resize", () => map?.invalidateSize({ pan: false }));
  if (typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
    resizeObserver.observe(mapElement);
  }
  // Retry with the main source if connectivity returns after an outage.
  window.addEventListener("online", () => {
    if (map && activeMapSource > 0) loadMapTiles(0);
  });
}

async function searchLocation() {
  const searchInput = document.getElementById("mapSearch");
  const query = searchInput.value.trim();

  if (!query) {
    alert("Please enter a location to search.");
    return;
  }

  try {
    setMapStatus("Searching location...");

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data || data.length === 0) {
      alert("Location not found. Try a more specific place name.");
      setMapStatus("Location not found.");
      return;
    }

    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);

    document.getElementById("location").value = data[0].display_name;
    setMarkerLocation(lat, lng, false);
    setMapStatus("Location found and selected.");
  } catch (error) {
    console.error("Search location error:", error);
    alert("Search failed. Please check your internet connection.");
    setMapStatus("Location search failed.");
  }
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  setMapStatus("Detecting your current location. Please wait...");

  navigator.geolocation.getCurrentPosition(
    function (position) {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      setMarkerLocation(lat, lng, true);

      if (accuracyCircle !== null) {
        map.removeLayer(accuracyCircle);
      }

      accuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
      }).addTo(map);

      map.fitBounds(accuracyCircle.getBounds());

      if (accuracy > 1000) {
        alert(
          `Location detected, but accuracy is low: about ±${Math.round(accuracy)} meters. Please drag the pin manually if needed.`,
        );
      } else {
        alert(
          `Current location detected. Accuracy: about ±${Math.round(accuracy)} meters.`,
        );
      }
    },
    function (error) {
      if (error.code === error.PERMISSION_DENIED) {
        alert(
          "Location permission denied. Please allow location access in your browser.",
        );
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        alert("Current location is unavailable. Please search manually.");
      } else if (error.code === error.TIMEOUT) {
        alert("Location request timed out. Please try again.");
      } else {
        alert("Unable to get current location.");
      }

      setMapStatus("GPS failed. You can search or click the map manually.");
    },
    {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    },
  );
}

function handleMapButtons() {
  const searchLocationBtn = document.getElementById("searchLocationBtn");
  const useGpsBtn = document.getElementById("useGpsBtn");
  const mapSearch = document.getElementById("mapSearch");

  searchLocationBtn.addEventListener("click", searchLocation);
  useGpsBtn.addEventListener("click", useCurrentLocation);

  mapSearch.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchLocation();
    }
  });
}

function renderWeeklyAvailabilityEditor() {
  const container = document.getElementById("weeklyAvailabilityContainer");
  if (!container) return;

  container.innerHTML = WEEK_DAYS.map(({ day, name }) => `
    <div class="weekly-day-row" data-day="${day}">
      <label class="weekly-day-toggle" for="weekly-day-${day}">
        <input type="checkbox" id="weekly-day-${day}" class="weekly-day-checkbox" data-day="${day}" />
        <span>${name}</span>
      </label>
      <div class="weekly-day-times">
        <label for="weekly-start-${day}">From
          <input type="time" id="weekly-start-${day}" class="weekly-start-time" value="08:00" disabled />
        </label>
        <span class="weekly-time-divider" aria-hidden="true">–</span>
        <label for="weekly-end-${day}">To
          <input type="time" id="weekly-end-${day}" class="weekly-end-time" value="20:00" disabled />
        </label>
      </div>
      <span class="weekly-day-state">Closed</span>
    </div>
  `).join("");

  container.querySelectorAll(".weekly-day-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", () => updateWeeklyDayState(checkbox.dataset.day));
  });
}

function updateWeeklyDayState(day) {
  const row = document.querySelector(`.weekly-day-row[data-day="${day}"]`);
  if (!row) return;
  const active = row.querySelector(".weekly-day-checkbox").checked;
  row.classList.toggle("weekly-day-active", active);
  row.querySelector(".weekly-start-time").disabled = !active;
  row.querySelector(".weekly-end-time").disabled = !active;
  row.querySelector(".weekly-day-state").textContent = active ? "Open" : "Closed";
}

function getWeeklyAvailability() {
  const rows = [];
  for (const { day, name } of WEEK_DAYS) {
    const checkbox = document.getElementById(`weekly-day-${day}`);
    if (!checkbox?.checked) continue;

    const start_time = document.getElementById(`weekly-start-${day}`).value;
    const end_time = document.getElementById(`weekly-end-${day}`).value;
    if (!start_time || !end_time) {
      throw new Error(`Please set both start and end times for ${name}.`);
    }
    // Single daytime interval per day; overnight shifts are not supported by this form.
    if (start_time >= end_time) {
      throw new Error(`${name}: end time must be later than start time.`);
    }
    rows.push({ day_of_week: day, start_time, end_time });
  }
  return rows;
}

async function loadWeeklyAvailability(userId) {
  const { data, error } = await supabase
    .from("provider_weekly_availability")
    .select("day_of_week, start_time, end_time")
    .eq("provider_id", userId);

  if (error) {
    weeklyScheduleLoadFailed = true;
    console.error("Load weekly availability error:", error);
    showMessage("Could not load working hours. Run database/provider-weekly-availability-setup.sql in Supabase before saving.");
    return;
  }

  for (const item of data || []) {
    const day = Number(item.day_of_week);
    const checkbox = document.getElementById(`weekly-day-${day}`);
    if (!checkbox) continue;
    checkbox.checked = true;
    document.getElementById(`weekly-start-${day}`).value = String(item.start_time).slice(0, 5);
    document.getElementById(`weekly-end-${day}`).value = String(item.end_time).slice(0, 5);
    updateWeeklyDayState(day);
  }
}

async function saveWeeklyAvailability(userId, selectedRows) {
  const enabledDays = selectedRows.map((row) => row.day_of_week);
  const closedDays = WEEK_DAYS.map((row) => row.day).filter((day) => !enabledDays.includes(day));

  // Upsert first, so an insert error won't erase the saved schedule.
  if (selectedRows.length) {
    const { error } = await supabase.from("provider_weekly_availability").upsert(
      selectedRows.map((row) => ({ ...row, provider_id: userId })),
      { onConflict: "provider_id,day_of_week" },
    );
    if (error) throw error;
  }
  if (closedDays.length) {
    const { error } = await supabase.from("provider_weekly_availability")
      .delete().eq("provider_id", userId).in("day_of_week", closedDays);
    if (error) throw error;
  }
}

async function loadExistingProfile(userId) {
  const { data: profile, error: profileError } = await supabase
    .from("provider_profiles")
    .select("*")
    .eq("provider_id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("Load provider profile error:", profileError);
  }

  if (profile) {
    document.getElementById("bio").value = profile.bio || "";
    document.getElementById("location").value = profile.location || "";

    document.getElementById("providerLat").value =
      profile.provider_lat !== null && profile.provider_lat !== undefined
        ? profile.provider_lat
        : "";

    document.getElementById("providerLng").value =
      profile.provider_lng !== null && profile.provider_lng !== undefined
        ? profile.provider_lng
        : "";

    document.getElementById("isAvailable").value = profile.is_available
      ? "true"
      : "false";
  }

  const { data: skills, error: skillsError } = await supabase
    .from("provider_skills")
    .select("category")
    .eq("provider_id", userId);

  if (skillsError) {
    console.error("Load skills error:", skillsError);
    return;
  }

  const skillList = (skills || []).map(function (item) {
    return item.category;
  });

  setSelectedSkills(skillList);

  const { data: specializationRows, error: specializationError } = await supabase
    .from("provider_specializations")
    .select("category, specialization")
    .eq("provider_id", userId);

  if (specializationError) {
    console.error("Load specializations error:", specializationError);
  }

  renderSpecializationOptions(specializationRows || []);
}

function validateProfile(profileData, selectedSkills, selectedSpecializations) {
  const fullNameInput = document.getElementById("fullName");
  const phoneInput = document.getElementById("phone");

  if (fullNameInput || phoneInput) {
    const fullName = fullNameInput?.value.trim() || "";
    const phone = phoneInput?.value.trim() || "";

    if (!fullName || !phone) {
      return "Please complete your full name and phone number.";
    }

    if (phone.replace(/[^0-9+]/g, "").length < 7) {
      return "Please enter a valid phone number.";
    }
  }

  if (!profileData.bio || !profileData.location) {
    return "Please complete bio and service location.";
  }

  if (profileData.provider_lat === null || profileData.provider_lng === null) {
    return "Please select your provider location on the map.";
  }

  if (
    Number.isNaN(profileData.provider_lat) ||
    Number.isNaN(profileData.provider_lng)
  ) {
    return "Invalid map coordinates. Please select your provider location again.";
  }

  if (selectedSkills.length === 0) {
    return "Please select at least one service skill.";
  }

  const categoriesWithSpecialization = new Set(
    selectedSpecializations.map((item) => item.category),
  );

  const missingCategory = selectedSkills.find(
    (category) => !categoriesWithSpecialization.has(category),
  );

  if (missingCategory) {
    return `Please select at least one ${missingCategory} specialization.`;
  }

  return "";
}

async function saveProviderSkills(userId, selectedSkills) {
  const { error: deleteError } = await supabase
    .from("provider_skills")
    .delete()
    .eq("provider_id", userId);

  if (deleteError) {
    throw deleteError;
  }

  const skillRows = selectedSkills.map(function (category) {
    return {
      provider_id: userId,
      category: category,
    };
  });

  const { error: insertError } = await supabase
    .from("provider_skills")
    .insert(skillRows);

  if (insertError) {
    throw insertError;
  }
}

async function saveProviderSpecializations(userId, selectedSpecializations) {
  const { error: deleteError } = await supabase
    .from("provider_specializations")
    .delete()
    .eq("provider_id", userId);

  if (deleteError) {
    throw deleteError;
  }

  if (selectedSpecializations.length === 0) return;

  const rows = selectedSpecializations.map(function (item) {
    return {
      provider_id: userId,
      category: item.category,
      specialization: item.specialization,
    };
  });

  const { error: insertError } = await supabase
    .from("provider_specializations")
    .insert(rows);

  if (insertError) {
    throw insertError;
  }
}

async function handleSaveProfile(userId) {
  const form = document.getElementById("providerProfileForm");
  const saveBtn = document.getElementById("saveProfileBtn");

  if (!form) return;

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearMessage();

    const latValue = document.getElementById("providerLat").value.trim();
    const lngValue = document.getElementById("providerLng").value.trim();

    const profileData = {
      provider_id: userId,
      bio: document.getElementById("bio").value.trim(),
      location: document.getElementById("location").value.trim(),
      provider_lat: latValue === "" ? null : Number(latValue),
      provider_lng: lngValue === "" ? null : Number(lngValue),
      is_available: document.getElementById("isAvailable").value === "true",
    };

    if (weeklyScheduleLoadFailed) {
      showMessage("Weekly hours are unavailable. Please run the weekly availability SQL setup first.");
      return;
    }

    let selectedHours;
    try {
      selectedHours = getWeeklyAvailability();
    } catch (error) {
      showMessage(error.message);
      return;
    }
    if (profileData.is_available && selectedHours.length === 0) {
      showMessage("Select at least one working day when your availability is set to Available.");
      return;
    }

    const selectedSkills = getSelectedSkills();
    const selectedSpecializations = getSelectedSpecializations();
    const validationError = validateProfile(
      profileData,
      selectedSkills,
      selectedSpecializations,
    );

    if (validationError) {
      showMessage(validationError);
      return;
    }

    setButtonLoading(saveBtn, true, "Saving profile...", isOnboardingMode ? "Complete Profile & Continue" : "Save Profile");

    try {
      const { error: profileError } = await supabase
        .from("provider_profiles")
        .upsert(profileData, {
          onConflict: "provider_id",
        });

      if (profileError) {
        throw profileError;
      }

      await saveProviderSkills(userId, selectedSkills);
      await saveProviderSpecializations(userId, selectedSpecializations);
      await saveWeeklyAvailability(userId, selectedHours);

      const fullNameInput = document.getElementById("fullName");
      const phoneInput = document.getElementById("phone");

      if (fullNameInput && phoneInput) {
        const fullName = fullNameInput.value.trim();
        const phone = phoneInput.value.trim();

        const { data: completedData, error: completedError } = await supabase.rpc(
          "complete_basic_profile",
          {
            p_full_name: fullName,
            p_phone: phone,
          },
        );

        if (completedError) throw completedError;

        const updatedProfile = Array.isArray(completedData)
          ? completedData[0]
          : completedData;

        if (updatedProfile) {
          localStorage.setItem("igotu_user", JSON.stringify(updatedProfile));
          displayUser(updatedProfile);
        }
      }

      if (isOnboardingMode) {
        showMessage(
          "Provider profile completed successfully. Redirecting to your dashboard...",
          "success",
        );
        setTimeout(function () {
          window.location.replace("dashboard.html");
        }, 800);
        return;
      }

      showMessage("Provider profile updated successfully.", "success");
    } catch (error) {
      console.error("Save provider profile error:", error);
      showMessage(error.message || "Failed to save profile.");
    }

    setButtonLoading(saveBtn, false, "Saving profile...", isOnboardingMode ? "Complete Profile & Continue" : "Save Profile");
  });
}

document.addEventListener("DOMContentLoaded", async function () {
    if (!(await authorizeWorkspace()).allowed) return;
  const user = await getSessionUser();
  if (!user) return;

  const profile = await getProfile(user.id);
  if (!profile) return;

  if (isOnboardingMode && profile.profile_completed === true) {
    window.location.replace("dashboard.html");
    return;
  }

  displayUser(profile);
  loadBasicProfileFields(profile);
  handleLogout();

  setupSpecializationSelector();
  renderWeeklyAvailabilityEditor();
  await loadExistingProfile(user.id);
  await loadWeeklyAvailability(user.id);

  initMap();
  handleMapButtons();
  handleSaveProfile(user.id);
});
