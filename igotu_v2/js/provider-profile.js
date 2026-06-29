import { supabase } from "./supabaseClient.js";

const L = window.L;

let map = null;
let marker = null;
let accuracyCircle = null;

const defaultLat = 6.0367;
const defaultLng = 116.1186;

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
  document.getElementById("userName").textContent = profile.full_name;
  document.getElementById("userRole").textContent =
    `Provider · ${profile.user_code}`;
  document.getElementById("avatar").textContent = profile.full_name
    .charAt(0)
    .toUpperCase();
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
    showMessage(
      "Map library failed to load. Please check your internet connection.",
    );
    return;
  }

  const latInput = document.getElementById("providerLat").value.trim();
  const lngInput = document.getElementById("providerLng").value.trim();

  const hasExistingCoordinates =
    latInput !== "" &&
    lngInput !== "" &&
    !Number.isNaN(Number(latInput)) &&
    !Number.isNaN(Number(lngInput));

  const mapLat = hasExistingCoordinates ? Number(latInput) : defaultLat;
  const mapLng = hasExistingCoordinates ? Number(lngInput) : defaultLng;

  map = L.map("providerMap").setView([mapLat, mapLng], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  marker = L.marker([mapLat, mapLng], {
    draggable: true,
  }).addTo(map);

  if (hasExistingCoordinates) {
    updateCoordinateFields(mapLat, mapLng);
    setMapStatus("Existing provider location loaded.");
  }

  map.on("click", function (event) {
    setMarkerLocation(event.latlng.lat, event.latlng.lng, true);
  });

  marker.on("dragend", function () {
    const position = marker.getLatLng();
    setMarkerLocation(position.lat, position.lng, true);
  });

  setTimeout(function () {
    map.invalidateSize();
  }, 300);
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
}

function validateProfile(profileData, selectedSkills) {
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

    const selectedSkills = getSelectedSkills();
    const validationError = validateProfile(profileData, selectedSkills);

    if (validationError) {
      showMessage(validationError);
      return;
    }

    setButtonLoading(saveBtn, true, "Saving profile...", "Save Profile");

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

      showMessage(
        "Provider profile, map location, and skills saved successfully.",
        "success",
      );
    } catch (error) {
      console.error("Save provider profile error:", error);
      showMessage(error.message || "Failed to save profile.");
    }

    setButtonLoading(saveBtn, false, "Saving profile...", "Save Profile");
  });
}

document.addEventListener("DOMContentLoaded", async function () {
  const user = await getSessionUser();
  if (!user) return;

  const profile = await getProfile(user.id);
  if (!profile) return;

  displayUser(profile);
  handleLogout();

  await loadExistingProfile(user.id);

  initMap();
  handleMapButtons();
  handleSaveProfile(user.id);
});
