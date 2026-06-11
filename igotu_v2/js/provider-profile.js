import { supabase } from "./supabaseClient.js";

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
    document.getElementById("userRole").textContent = `Provider · ${profile.user_code}`;
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

function getSelectedSkills() {
    const checkedSkills = document.querySelectorAll('input[name="skills"]:checked');

    return Array.from(checkedSkills).map(function(checkbox) {
        return checkbox.value;
    });
}

function setSelectedSkills(skills) {
    const checkboxes = document.querySelectorAll('input[name="skills"]');

    checkboxes.forEach(function(checkbox) {
        checkbox.checked = skills.includes(checkbox.value);
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
        document.getElementById("providerLat").value = profile.provider_lat !== null && profile.provider_lat !== undefined ? profile.provider_lat : "";
        document.getElementById("providerLng").value = profile.provider_lng !== null && profile.provider_lng !== undefined ? profile.provider_lng : "";
        document.getElementById("isAvailable").value = profile.is_available ? "true" : "false";
    }

    const { data: skills, error: skillsError } = await supabase
        .from("provider_skills")
        .select("category")
        .eq("provider_id", userId);

    if (skillsError) {
        console.error("Load skills error:", skillsError);
        return;
    }

    const skillList = (skills || []).map(function(item) {
        return item.category;
    });

    setSelectedSkills(skillList);
}

function validateProfile(profileData, selectedSkills) {
    if (!profileData.bio || !profileData.location) {
        return "Please complete bio and service location.";
    }

    if (selectedSkills.length === 0) {
        return "Please select at least one service skill.";
    }

    if (profileData.provider_lat !== null && Number.isNaN(profileData.provider_lat)) {
        return "Latitude must be a valid number.";
    }

    if (profileData.provider_lng !== null && Number.isNaN(profileData.provider_lng)) {
        return "Longitude must be a valid number.";
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

    const skillRows = selectedSkills.map(function(category) {
        return {
            provider_id: userId,
            category: category
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

    form.addEventListener("submit", async function(event) {
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
            is_available: document.getElementById("isAvailable").value === "true"
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
                    onConflict: "provider_id"
                });

            if (profileError) {
                throw profileError;
            }

            await saveProviderSkills(userId, selectedSkills);

            showMessage("Provider profile saved successfully.", "success");
        } catch (error) {
            console.error("Save provider profile error:", error);
            showMessage(error.message || "Failed to save profile.");
        }

        setButtonLoading(saveBtn, false, "Saving profile...", "Save Profile");
    });
}

document.addEventListener("DOMContentLoaded", async function() {
    const user = await getSessionUser();
    if (!user) return;

    const profile = await getProfile(user.id);
    if (!profile) return;

    displayUser(profile);
    handleLogout();
    await loadExistingProfile(user.id);
    handleSaveProfile(user.id);
});