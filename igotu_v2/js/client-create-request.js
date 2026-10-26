import { authorizeWorkspace } from "./profile-guard.js";
import { safeUrl } from "./html-safety.js";
import { supabase } from "./supabaseClient.js";

const L = window.L;

const params = new URLSearchParams(window.location.search);
const requestId = params.get("request_id");

let map = null;
let marker = null;
let accuracyCircle = null;
let editingRequest = null;
function creationKey(userId) {
    const key = `igotu-create-request:${userId}`;
    let value = sessionStorage.getItem(key);
    if (!/^[0-9a-f-]{36}$/i.test(value || "")) {
        value = crypto.randomUUID();
        sessionStorage.setItem(key, value);
    }
    return value;
}

const defaultLat = 6.0367;
const defaultLng = 116.1186;

const SERVICE_TYPES = {
  Cleaning: ["Home Cleaning", "Deep Cleaning", "Move-in / Move-out Cleaning", "Office Cleaning", "Post-event Cleaning", "General Cleaning"],
  Delivery: ["Food Delivery", "Grocery Delivery", "Parcel Delivery", "Document Delivery", "General Delivery"],
  Repair: ["Roofing", "Plumbing", "Electrical", "Appliance Repair", "Furniture Repair", "General Repair"],
  "Moving Help": ["Furniture Moving", "House Moving", "Room Moving", "Packing & Unpacking", "Loading & Unloading", "General Moving Help"],
  Errands: ["Grocery Shopping", "Queueing", "Item Pickup", "Document Collection", "Personal Runner", "General Errands"],
  Tutoring: ["Mathematics", "Science", "English / MUET", "ICT / Computer", "General Tutoring"],
  Other: ["Event Setup", "General Assistance", "Other Service"],
};

function updateServiceTypeOptions(category, selectedValue = "") {
  const serviceTypeSelect = document.getElementById("serviceType");
  if (!serviceTypeSelect) return;

  const options = SERVICE_TYPES[category] || [];
  serviceTypeSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = category ? "Select service type" : "Select a category first";
  serviceTypeSelect.appendChild(placeholder);

  options.forEach(function (serviceType) {
    const option = document.createElement("option");
    option.value = serviceType;
    option.textContent = serviceType;
    serviceTypeSelect.appendChild(option);
  });

  serviceTypeSelect.disabled = options.length === 0;
  serviceTypeSelect.value = options.includes(selectedValue) ? selectedValue : "";
}

function setupServiceTypeSelector() {
  const categorySelect = document.getElementById("category");
  if (!categorySelect) return;

  categorySelect.addEventListener("change", function () {
    updateServiceTypeOptions(categorySelect.value);
  });

  updateServiceTypeOptions(categorySelect.value);
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

function getFileExtension(fileName) {
    return fileName.split(".").pop().toLowerCase();
}

function getSelectedRequestImageFile() {
    const requestImageInput = document.getElementById("requestImage");

    if (!requestImageInput || requestImageInput.files.length === 0) {
        return null;
    }

    return requestImageInput.files[0];
}

function validateRequestImageFile(file) {
    if (!file) return "";

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxFileSize = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
        return "Request image must be JPG, PNG, or WEBP.";
    }

    if (file.size > maxFileSize) {
        return "Request image must be 5MB or below.";
    }

    return "";
}

function getRequestImageUrl(request) {
    if (!request) return null;

    return request.request_image_url || null;
}

function clearRequestImagePreview() {
    const requestImageInput = document.getElementById("requestImage");
    const uploadBox = document.getElementById("requestImageUploadBox");
    const previewBox = document.getElementById("requestImagePreview");
    const previewImg = document.getElementById("requestImagePreviewImg");
    const fileName = document.getElementById("requestImageFileName");
    const fileStatus = document.getElementById("requestImageFileStatus");

    if (requestImageInput) requestImageInput.value = "";
    if (previewImg) {
        previewImg.src = "";
        previewImg.classList.add("hidden");
    }
    if (fileName) fileName.textContent = "Image selected";
    if (fileStatus) fileStatus.textContent = "Ready to upload";
    if (previewBox) previewBox.classList.add("hidden");
    if (uploadBox) uploadBox.classList.remove("hidden");
}

function showExistingRequestImage(imageUrl) {
    const uploadBox = document.getElementById("requestImageUploadBox");
    const previewBox = document.getElementById("requestImagePreview");
    const previewImg = document.getElementById("requestImagePreviewImg");
    const fileName = document.getElementById("requestImageFileName");
    const fileStatus = document.getElementById("requestImageFileStatus");

    if (!previewBox || !previewImg || !fileName || !imageUrl) return;

    const previewUrl = safeUrl(imageUrl);
    if (!previewUrl) return;
    previewImg.src = previewUrl;
    previewImg.classList.remove("hidden");
    fileName.textContent = "Request image uploaded";
    if (fileStatus) fileStatus.textContent = "Current image for this service request";
    previewBox.classList.remove("hidden");
    if (uploadBox) uploadBox.classList.add("hidden");
}

function updateRequestImagePreview() {
    const file = getSelectedRequestImageFile();

    if (!file) {
        clearRequestImagePreview();
        return;
    }

    const imageError = validateRequestImageFile(file);

    if (imageError) {
        clearRequestImagePreview();
        showMessage(imageError);
        return;
    }

    const uploadBox = document.getElementById("requestImageUploadBox");
    const previewBox = document.getElementById("requestImagePreview");
    const previewImg = document.getElementById("requestImagePreviewImg");
    const fileName = document.getElementById("requestImageFileName");
    const fileStatus = document.getElementById("requestImageFileStatus");

    if (!previewBox || !previewImg || !fileName) return;

    previewImg.src = URL.createObjectURL(file);
    previewImg.classList.remove("hidden");
    fileName.textContent = file.name;
    if (fileStatus) fileStatus.textContent = "Ready to upload";
    previewBox.classList.remove("hidden");
    if (uploadBox) uploadBox.classList.add("hidden");
}

function setupRequestImageInput() {
    const requestImageInput = document.getElementById("requestImage");
    const removeRequestImageBtn = document.getElementById("removeRequestImageBtn");

    if (requestImageInput) {
        requestImageInput.addEventListener("change", updateRequestImagePreview);
    }

    if (removeRequestImageBtn) {
        removeRequestImageBtn.addEventListener("click", clearRequestImagePreview);
    }
}

async function uploadRequestImage(file, userId, requestIdValue) {
    const imageError = validateRequestImageFile(file);

    if (imageError) {
        throw new Error(imageError);
    }

    const extension = getFileExtension(file.name);
    const filePath = `${userId}/${requestIdValue}-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
        .from("request-images")
        .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false
        });

    if (uploadError) {
        console.error("Request image upload error:", uploadError);
        throw new Error(uploadError.message || "Failed to upload request image.");
    }

    const { data } = supabase.storage
        .from("request-images")
        .getPublicUrl(filePath);

    return {
        imagePath: filePath,
        imageUrl: data.publicUrl
    };
}

async function saveRequestImage(requestIdValue, imageUrl, imagePath) {
    const { error } = await supabase.rpc("client_save_request_image", {
        p_request_id: requestIdValue,
        p_request_image_url: imageUrl,
        p_request_image_path: imagePath
    });

    if (error) {
        console.error("Save request image error:", error);
        throw new Error(error.message || "Failed to save request image details.");
    }
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
        !formData.service_type ||
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

    const allowedServiceTypes = SERVICE_TYPES[formData.category] || [];
    if (!allowedServiceTypes.includes(formData.service_type)) {
        return "Please select a valid service type for the chosen category.";
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

function configureEditMode() {
    document.title = "Edit Request - IGotU V2";
    document.getElementById("pageTitle").textContent = "Edit Service Request";
    document.getElementById("pageDescription").textContent =
        "Update your request details before selecting a provider.";
    document.getElementById("formTitle").textContent = "Edit Request Details";
    document.getElementById("createRequestBtn").textContent = "Save Changes";
}

function populateRequestForm(request) {
    document.getElementById("title").value = request.title || "";
    document.getElementById("category").value = request.category || "";
    updateServiceTypeOptions(request.category || "", request.service_type || "");
    document.getElementById("description").value = request.description || "";
    document.getElementById("preferredDate").value = request.preferred_date || "";
    document.getElementById("preferredTime").value = request.preferred_time || "";
    document.getElementById("budget").value = request.budget ?? "";
    document.getElementById("priority").value = request.priority || "normal";
    document.getElementById("location").value = request.location || "";

    const imageUrl = getRequestImageUrl(request);
    if (imageUrl) {
        showExistingRequestImage(imageUrl);
    }

    const lat = Number(request.client_lat);
    const lng = Number(request.client_lng);

    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        setMarkerLocation(lat, lng, false);
        setMapStatus("Saved service location loaded. You can adjust it if needed.");
    }
}

async function loadRequestForEdit(userId) {
    if (!requestId) return true;

    configureEditMode();

    const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("request_id", requestId)
        .eq("client_id", userId)
        .single();

    if (error || !data) {
        console.error("Load request for edit error:", error);
        showMessage("Request not found or access denied.");
        document.getElementById("createRequestBtn").disabled = true;
        return false;
    }

    if (data.status !== "pending") {
        showMessage("Only pending requests can be edited.");
        document.getElementById("createRequestBtn").disabled = true;
        return false;
    }

    editingRequest = data;
    populateRequestForm(data);
    return true;
}

async function updateRequest(formData, button, requestImageFile, userId) {
    setButtonLoading(button, true, "Saving changes...", "Save Changes");

    const { error } = await supabase.rpc("client_update_request", {
        p_request_id: editingRequest.request_id,
        p_title: formData.title,
        p_category: formData.category,
        p_service_type: formData.service_type,
        p_description: formData.description,
        p_preferred_date: formData.preferred_date,
        p_preferred_time: formData.preferred_time,
        p_location: formData.location,
        p_client_lat: formData.client_lat,
        p_client_lng: formData.client_lng,
        p_budget: formData.budget,
        p_priority: formData.priority
    });

    if (error) {
        console.error("Update request error:", error);
        showMessage(error.message || "Failed to update request.");
        setButtonLoading(button, false, "Saving changes...", "Save Changes");
        return;
    }

    if (requestImageFile) {
        try {
            setButtonLoading(button, true, "Uploading image...", "Save Changes");
            const imageData = await uploadRequestImage(requestImageFile, userId, editingRequest.request_id);
            await saveRequestImage(editingRequest.request_id, imageData.imageUrl, imageData.imagePath);
        } catch (imageError) {
            console.error("Update request image error:", imageError);
            showMessage(imageError.message || "Request updated, but image upload failed.");
            setButtonLoading(button, false, "Saving changes...", "Save Changes");
            return;
        }
    }

    showMessage("Service request updated successfully.", "success");

    setTimeout(function() {
        window.location.href = `request-details.html?request_id=${editingRequest.request_id}`;
    }, 900);
}

async function createRequest(formData, userId, button, requestImageFile) {
    setButtonLoading(button, true, "Creating request...", "Post Request & Find Providers");

    const result = await supabase.rpc("create_service_request", {
        p_idempotency_key: creationKey(userId), p_details: formData,
    });
    const error = result.error;
    const data = Array.isArray(result.data) ? result.data[0] : result.data;

    if (error) {
        console.error("Create request error:", error);
        showMessage(error.message || "Failed to create request.");
        setButtonLoading(button, false, "Creating request...", "Post Request & Find Providers");
        return;
    }

    if (!data?.request_id) {
        showMessage("The request could not be confirmed. Check My Requests before retrying.");
        setButtonLoading(button, false, "", "Post Request & Find Providers");
        return;
    }
    sessionStorage.removeItem(`igotu-create-request:${userId}`);
    if (requestImageFile) {
        try {
            setButtonLoading(button, true, "Uploading image...", "Post Request & Find Providers");
            const imageData = await uploadRequestImage(requestImageFile, userId, data.request_id);
            await saveRequestImage(data.request_id, imageData.imageUrl, imageData.imagePath);
        } catch (imageError) {
            // The request already exists. Retry its attachment through edit mode,
            // including after a refresh, instead of inserting another request.
            editingRequest = { ...formData, request_id: data.request_id, status: "pending" };
            const savedUrl = new URL(window.location.href);
            savedUrl.searchParams.set("request_id", data.request_id);
            window.history.replaceState(null, "", savedUrl);
            configureEditMode();
            showMessage("Your service request was saved, but its image was not attached. Retry Save Changes or open My Requests to continue without the image.");
            setButtonLoading(button, false, "Saving changes...", "Save Changes");
            return;
        }
    }

    showMessage("Service request created successfully. Redirecting to recommended providers...", "success");

    setTimeout(function() {
        window.location.href = `recommended-providers.html?request_id=${data.request_id}`;
    }, 900);
}

async function handleRequestForm(userId) {
    const form = document.getElementById("createRequestForm");
    const createBtn = document.getElementById("createRequestBtn");

    if (!form) return;

    form.addEventListener("submit", async function(event) {
        event.preventDefault();
        if (createBtn.disabled) return;
        clearMessage();

        const budgetValue = document.getElementById("budget").value.trim();
        const latValue = document.getElementById("clientLat").value.trim();
        const lngValue = document.getElementById("clientLng").value.trim();

        const requestImageFile = getSelectedRequestImageFile();

        const formData = {
            title: document.getElementById("title").value.trim(),
            category: document.getElementById("category").value,
            service_type: document.getElementById("serviceType").value,
            description: document.getElementById("description").value.trim(),
            preferred_date: document.getElementById("preferredDate").value,
            preferred_time: document.getElementById("preferredTime").value,
            location: document.getElementById("location").value.trim(),
            client_lat: latValue === "" ? null : Number(latValue),
            client_lng: lngValue === "" ? null : Number(lngValue),
            budget: budgetValue === "" ? null : Number(budgetValue),
            priority: document.getElementById("priority").value
        };

        const imageValidationError = validateRequestImageFile(requestImageFile);

        if (imageValidationError) {
            showMessage(imageValidationError);
            return;
        }

        const validationError = validateRequestForm(formData);

        if (validationError) {
            showMessage(validationError);
            return;
        }

        try {
            if (editingRequest) {
                await updateRequest(formData, createBtn, requestImageFile, userId);
                return;
            }
            await createRequest(formData, userId, createBtn, requestImageFile);
        } catch {
            showMessage("Unable to save the request. Check My Requests before retrying if the connection was interrupted.");
            setButtonLoading(createBtn, false, "", editingRequest ? "Save Changes" : "Post Request & Find Providers");
        }
    });
}

document.addEventListener("DOMContentLoaded", async function() {
    if (!(await authorizeWorkspace()).allowed) return;
    const user = await getSessionUser();
    if (!user) return;

    const profile = await getProfile(user.id);
    if (!profile) return;

    displayUser(profile);
    handleLogout();

    initMap();
    handleMapButtons();
    setupServiceTypeSelector();
    setupRequestImageInput();
    const formReady = await loadRequestForEdit(user.id);
    if (!formReady) return;

    handleRequestForm(user.id);
});
