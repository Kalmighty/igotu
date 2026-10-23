import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://giqtnbwyktbnbhdvjraa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MyJ9AT14UwzvcaHXMVbBHA_ULqxXW5t";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);