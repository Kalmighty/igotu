REVIEW STATUS — HISTORICAL SETUP NOTES
These instructions describe older schema assumptions, not a tested migration order.
Do not rerun old setup SQL to repair a frontend error: some scripts backfill
legacy accounts or replace policies/RPC signatures. The mandatory verification
consent/enforcement draft and Stage A/B/C still need separate integration review
and authorized isolated staging tests. No production change is authorized here.
See docs/system-audit.md and docs/mandatory-identity-verification.md at repository root.

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
