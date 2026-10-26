import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";

const SUPABASE_URL = "https://giqtnbwyktbnbhdvjraa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_MyJ9AT14UwzvcaHXMVbBHA_ULqxXW5t";

// Explicitly retain Supabase's default project-scoped browser storage key.
const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: AUTH_STORAGE_KEY },
});

// Local fallback for rejected logins when normal SDK sign-out fails. Never
// clear unrelated projects or application data, and never call private SDK APIs.
export async function clearStoredAuthSession() {
  try {
    await supabase.auth.stopAutoRefresh();
  } finally {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(`${AUTH_STORAGE_KEY}-user`);
  }
}
