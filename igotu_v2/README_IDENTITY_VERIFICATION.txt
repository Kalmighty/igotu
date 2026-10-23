IGotU Identity Verification
============================

1. Run database/identity-verification-setup.sql in Supabase SQL Editor.
2. Client / Provider: Profile dropdown -> Identity Verification.
3. Admin: Sidebar -> Verification Requests.

Privacy design:
- Full MyKad/passport numbers are NOT stored.
- Only the final 4 characters are stored.
- Documents use the PRIVATE verification-documents bucket.
- Admin views documents through short-lived signed URLs.
- No biometric / selfie face matching.

Provider compatibility:
- Provider approval also updates provider_profiles.is_verified,
  so the existing provider matching/trust logic keeps working.
