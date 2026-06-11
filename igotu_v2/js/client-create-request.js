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

    if (data.role !== "client" || data.status !== "active") {
        await supabase.auth.signOut();
        window.location.href = "../login.html";
        return null;
    }

    return data;
}

function displayUser(profile) {
    document.getElementById("userName").textContent = profile.full_name;
    document.getElementById("userRole").textContent = `Client · ${profile.user_code}`;
    document.getElementById("avatar").textContent = profile.full_name.charAt(0).toUpperCase();
}

async function handleLogout() {
    const logoutBtn = document.getElementById("logoutBtn");

    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", async function(event) {
        event.preventDefault();
        localStorage.removeItem("igotu_user");
        await supabase.auth.signOut();
        window.location.href = "../login.html";
    });
}

function updateCoordinateFields(lat, lng) {
    document.getElementById("clientLat").value = Number(lat).toFixed(7);
    document.getElementById("clientLng").value = Number(lng).toFixed(7);
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
            setMapStatus("Location selected successfully.");
        } else {
            locationInput.value = `${Number(lat).toFixed(7)}, ${Number(lng).toFixed(7)}`;
            setMapStatus("Location selected, but address name was not found.");
        }
    } catch (error) {
        console.error("Reverse geocode error:", error);
        locationInput.value = `${Number(lat).toFixed(7)}, ${Number(lng).toFixed(7)}`;
        setMapStatus("Location selected. Address search failed, but coordinates are saved.");
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
        return;
    }

    map = L.map("requestMap").setView([defaultLat, defaultLng], 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    marker = L.marker([defaultLat, defaultLng], {
        draggable: true
    }).addTo(map);

    updateCoordinateFields(defaultLat, defaultLng);

    map.on("click", function(event) {
        setMarkerLocation(event.latlng.lat, event.latlng.lng, true);
    });

    marker.on("dragend", function() {
        const position = marker.getLatLng();
        setMarkerLocation(position.lat, position.lng, true);
    });

    setTimeout(function() {
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
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            setMarkerLocation(lat, lng, true);

            if (accuracyCircle !== null) {
                map.removeLayer(accuracyCircle);
            }

            accuracyCircle = L.circle([lat, lng], {
                radius: accuracy
            }).addTo(map);

            map.fitBounds(accuracyCircle.getBounds());

            if (accuracy > 1000) {
                alert(`Location detected, but accuracy is low: about ±${Math.round(accuracy)} meters. Please drag the pin manually if needed.`);
            } else {
                alert(`Current location detected. Accuracy: about ±${Math.round(accuracy)} meters.`);
            }
        },
        function(error) {
            if (error.code === error.PERMISSION_DENIED) {
                alert("Location permission denied. Please allow location access in your browser.");
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                alert("Current location is unavailable. Please search manually.");
            } else if (error.code === error.TIMEOUT) {
                alert("Location request timed out. Please try again.");
            } else {
                alert("Unable to get current location.");
            }

            setMapStatus("GPS failed. You can search or click the map manually.");
        }, {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        }
    );
}

function handleMapButtons() {
    const searchLocationBtn = document.getElementById("searchLocationBtn");
    const useGpsBtn = document.getElementById("useGpsBtn");
    const mapSearch = document.getElementById("mapSearch");

    searchLocationBtn.addEventListener("click", searchLocation);
    useGpsBtn.addEventListener("click", useCurrentLocation);

    mapSearch.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            searchLocation();
        }
    });
}

function validateRequestForm(formData) {
    if (!formData.title ||
        !formData.category ||
        !formData.description ||
        !formData.preferred_date ||
        !formData.preferred_time ||
        !formData.location ||
        formData.client_lat === null ||
        formData.client_lng === null ||
        !formData.priority
    ) {
        return "Please complete all required fields and select your location on the map.";
    }

    const allowedCategories = ["Cleaning", "Delivery", "Repair", "Moving Help", "Errands", "Tutoring", "Other"];

    if (!allowedCategories.includes(formData.category)) {
        return "Invalid service category selected.";
    }

    if (!["normal", "urgent"].includes(formData.priority)) {
        return "Invalid priority selected.";
    }

    if (Number.isNaN(formData.client_lat) || Number.isNaN(formData.client_lng)) {
        return "Invalid map coordinates. Please select your location again.";
    }

    if (formData.budget !== null && formData.budget < 0) {
        return "Budget cannot be negative.";
    }

    return "";
}

async function handleCreateRequest(userId) {
    const form = document.getElementById("createRequestForm");
    const createBtn = document.getElementById("createRequestBtn");

    if (!form) return;

    form.addEventListener("submit", async function(event) {
        event.preventDefault();
        clearMessage();

        const budgetValue = document.getElementById("budget").value.trim();
        const latValue = document.getElementById("clientLat").value.trim();
        const lngValue = document.getElementById("clientLng").value.trim();

        const formData = {
            client_id: userId,
            title: document.getElementById("title").value.trim(),
            category: document.getElementById("category").value,
            description: document.getElementById("description").value.trim(),
            preferred_date: document.getElementById("preferredDate").value,
            preferred_time: document.getElementById("preferredTime").value,
            location: document.getElementById("location").value.trim(),
            client_lat: latValue === "" ? null : Number(latValue),
            client_lng: lngValue === "" ? null : Number(lngValue),
            budget: budgetValue === "" ? null : Number(budgetValue),
            priority: document.getElementById("priority").value,
            status: "pending"
        };

        const validationError = validateRequestForm(formData);

        if (validationError) {
            showMessage(validationError);
            return;
        }

        setButtonLoading(createBtn, true, "Creating request...", "Post Request & Find Providers");

        const { data, error } = await supabase
            .from("service_requests")
            .insert(formData)
            .select("request_id")
            .single();

        if (error) {
            console.error("Create request error:", error);
            showMessage(error.message || "Failed to create request.");
            setButtonLoading(createBtn, false, "Creating request...", "Post Request & Find Providers");
            return;
        }

        showMessage("Service request created successfully. Redirecting to recommended providers...", "success");

        setTimeout(function() {
            window.location.href = `recommended-providers.html?request_id=${data.request_id}`;
        }, 900);
    });
}

document.addEventListener("DOMContentLoaded", async function() {
    const user = await getSessionUser();
    if (!user) return;

    const profile = await getProfile(user.id);
    if (!profile) return;

    displayUser(profile);
    handleLogout();

    initMap();
    handleMapButtons();
    handleCreateRequest(user.id);
});