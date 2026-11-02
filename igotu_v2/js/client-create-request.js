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
let locationSelection = null;
let locationVersion = 0;
let locationPending = false;
let localImagePreview = null;
function releaseLocalImagePreview() {
    if (localImagePreview) URL.revokeObjectURL(localImagePreview);
    localImagePreview = null;
}
window.addEventListener("pagehide", releaseLocalImagePreview);
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
    releaseLocalImagePreview();
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
    const remove = document.getElementById("removeRequestImageBtn");
    if (remove) remove.hidden = true;
    const existing = getRequestImageUrl(editingRequest);
    if (existing) showExistingRequestImage(existing);
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
    if (fileStatus) fileStatus.textContent = "Stored image. Choose a new image above to replace it when saving.";
    const remove = document.getElementById("removeRequestImageBtn");
    if (remove) remove.hidden = true;
    previewBox.classList.remove("hidden");
    if (uploadBox) uploadBox.classList.remove("hidden");
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

    releaseLocalImagePreview();
    localImagePreview = URL.createObjectURL(file);
    previewImg.src = localImagePreview;
    const remove = document.getElementById("removeRequestImageBtn");
    if (remove) remove.hidden = false;
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

function validCoordinates(lat, lng) {
    return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
function updateCoordinateFields(lat, lng) {
    document.getElementById("clientLat").value = Number(lat).toFixed(7);
    document.getElementById("clientLng").value = Number(lng).toFixed(7);
}
function invalidateLocation(message) {
    locationVersion++;
    locationPending = false;
    locationSelection = null;
    document.getElementById("clientLat").value = "";
    document.getElementById("clientLng").value = "";
    if (map && marker && map.hasLayer(marker)) map.removeLayer(marker);
    if (map && accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
    setMapStatus(message);
}
function pointAddress(lat, lng) { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
async function reverseGeocode(lat, lng, version, notice = "") {
    try {
        setMapStatus(`Finding address for the selected point… ${notice}`.trim());
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Address lookup unavailable");
        const data = await response.json();
        if (version !== locationVersion || locationSelection?.version !== version) return;
        const address = typeof data?.display_name === "string" ? data.display_name.trim() : "";
        document.getElementById("location").value = address || pointAddress(lat, lng);
        locationSelection.address = document.getElementById("location").value.trim();
        document.getElementById("location").dispatchEvent(new Event("change", {bubbles: true}));
        setMapStatus(`${address ? "Location selected. Check the address and pin before posting." : "Address name was not found. The selected point is shown as coordinates."} ${notice}`.trim());
    } catch {
        if (version !== locationVersion || locationSelection?.version !== version) return;
        document.getElementById("location").value = pointAddress(lat, lng);
        locationSelection.address = document.getElementById("location").value;
        document.getElementById("location").dispatchEvent(new Event("change", {bubbles: true}));
        setMapStatus(`Address lookup is unavailable. The selected point is shown as coordinates; check the pin before posting. ${notice}`.trim());
    }
}
function setMarkerLocation(lat, lng, shouldUpdateAddress = true, notice = "") {
    if (!map || !marker || !validCoordinates(lat, lng)) {
        setMapStatus("Choose a valid location on the map before saving.");
        return false;
    }
    const version = ++locationVersion;
    locationPending = false;
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
    marker.setLatLng([lat, lng]);
    if (!map.hasLayer(marker)) marker.addTo(map);
    map.setView([lat, lng], 16);
    updateCoordinateFields(lat, lng);
    if (shouldUpdateAddress) document.getElementById("location").value = pointAddress(lat, lng);
    locationSelection = {lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)), address: document.getElementById("location").value.trim(), version};
    document.getElementById("location").dispatchEvent(new Event("change", {bubbles: true}));
    if (shouldUpdateAddress) void reverseGeocode(lat, lng, version, notice);
    return true;
}
function initMap() {
    if (!L) {
        setMapStatus("The map could not load. Reload the page to choose your service location.");
        showMessage("The map could not load. Your request has not been posted.");
        return;
    }
    map = L.map("requestMap").setView([defaultLat, defaultLng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    // A default map view is not a selected service location. No pin or saved
    // coordinates exist until Search, GPS, map click/drag, or valid owned edit data.
    marker = L.marker([defaultLat, defaultLng], { draggable: true });
    setMapStatus("Map ready near Kota Kinabalu. No service location selected. Search, use GPS or choose a point.");
    map.on("click", event => setMarkerLocation(event.latlng.lat, event.latlng.lng, true));
    marker.on("dragend", () => { const point = marker.getLatLng(); setMarkerLocation(point.lat, point.lng, true); });
    let frame;
    const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => map?.invalidateSize({pan: false})); };
    if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(document.getElementById("requestMap"));
    else window.addEventListener("resize", resize);
    setTimeout(resize, 300);
}
async function searchLocation() {
    if (!map) { setMapStatus("Reload the page to load the map before selecting a location."); return; }
    const query = document.getElementById("mapSearch").value.trim();
    if (!query) { setMapStatus("Enter a place or address to search."); return; }
    const version = ++locationVersion;
    locationPending = true;
    try {
        setMapStatus("Searching location…");
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error("Search unavailable");
        const data = await response.json();
        if (version !== locationVersion) return;
        if (!Array.isArray(data) || !data.length) { setMapStatus("Location not found. Try a more specific place or choose a point on the map."); return; }
        const lat = Number(data[0].lat), lng = Number(data[0].lon);
        if (data[0].lat == null || data[0].lon == null || String(data[0].lat).trim() === "" || String(data[0].lon).trim() === "" || !validCoordinates(lat, lng)) throw new Error("Invalid location");
        document.getElementById("location").value = typeof data[0].display_name === "string" && data[0].display_name.trim() ? data[0].display_name : pointAddress(lat, lng);
        setMarkerLocation(lat, lng, false);
        setMapStatus("Location found and selected. Check the address and pin before posting.");
    } catch {
        if (version === locationVersion) setMapStatus("Location search is unavailable. Try again, use GPS or choose a point on the map.");
    } finally { if (version === locationVersion) locationPending = false; }
}
function useCurrentLocation() {
    if (!map) { setMapStatus("Reload the page to load the map before using GPS."); return; }
    if (!navigator.geolocation) { setMapStatus("GPS is not supported. Search or choose a point on the map."); return; }
    const version = ++locationVersion;
    locationPending = true;
    setMapStatus("Detecting your current location. Please wait…");
    navigator.geolocation.getCurrentPosition(position => {
        if (version !== locationVersion) return;
        const {latitude: lat, longitude: lng, accuracy} = position.coords;
        locationPending = false;
        if (!validCoordinates(lat, lng)) { setMapStatus("GPS did not return a valid location. Search or choose a point on the map."); return; }
        const notice = Number.isFinite(accuracy) && accuracy > 1000 ? `GPS accuracy is low (about ±${Math.round(accuracy)} metres). Check and adjust the pin if needed.` : "Check the detected point before posting.";
        setMarkerLocation(lat, lng, true, notice);
        if (Number.isFinite(accuracy) && accuracy >= 0) { accuracyCircle = L.circle([lat, lng], {radius: accuracy}).addTo(map); map.fitBounds(accuracyCircle.getBounds()); }
    }, error => {
        if (version !== locationVersion) return;
        locationPending = false;
        setMapStatus(error.code === 1 ? "GPS permission denied. Search or choose a point on the map instead." : error.code === 3 ? "GPS timed out. Try again, search or choose a point on the map." : "GPS is unavailable. Search or choose a point on the map instead.");
    }, {enableHighAccuracy: true, timeout: 20000, maximumAge: 0});
}
function handleMapButtons() {
    document.getElementById("searchLocationBtn").addEventListener("click", searchLocation);
    document.getElementById("useGpsBtn").addEventListener("click", useCurrentLocation);
    document.getElementById("mapSearch").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); void searchLocation(); } });
    document.getElementById("location").addEventListener("input", () => invalidateLocation("Address changed. Search or select its matching point on the map again before saving."));
    if (!map) { document.getElementById("searchLocationBtn").disabled = true; document.getElementById("useGpsBtn").disabled = true; }
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

    if (!validCoordinates(formData.client_lat, formData.client_lng)) {
        return "Invalid map coordinates. Please select your location again.";
    }

    if (locationPending) return "Please wait for the location search or GPS result before saving.";
    if (!locationSelection || formData.location !== locationSelection.address || formData.client_lat !== locationSelection.lat || formData.client_lng !== locationSelection.lng)
        return "Select the matching service location on the map again before saving.";

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
    document.getElementById("cancelRequestBtn").href = "my-requests.html";
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

    if (request.client_lat != null && request.client_lng != null && String(request.client_lat).trim() !== "" && String(request.client_lng).trim() !== "" && validCoordinates(lat, lng)) {
        setMarkerLocation(lat, lng, false);
        if (locationSelection) setMapStatus("Saved service location loaded. You can adjust it if needed.");
    } else invalidateLocation("The saved location needs a valid map point. Search or choose its location before saving.");
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
    document.getElementById("createRequestForm").setAttribute("aria-busy", "false");
    if (!formReady) return;

    handleRequestForm(user.id);
    document.getElementById("requestFields").disabled = false;
    document.getElementById("createRequestForm").dataset.ready = "true";
    document.dispatchEvent(new Event("igotu:request-ready"));
});
