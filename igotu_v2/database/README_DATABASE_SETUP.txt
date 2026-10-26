REVIEW STATUS — HISTORICAL SETUP NOTES
These instructions describe older schema assumptions, not a tested migration order.
Do not rerun old setup SQL to repair a frontend error: some scripts backfill
legacy accounts or replace policies/RPC signatures. The mandatory verification
consent/enforcement draft and Stage A/B/C still need separate integration review
and authorized isolated staging tests. No production change is authorized here.
See docs/system-audit.md and docs/mandatory-identity-verification.md at repository root.

IGotU Database Setup Notes

Run this file first in Supabase SQL Editor:

database/priority-features-setup.sql

It adds:
1. Provider verification fields for the provider trust section.
2. Payment proof fields using the code column names: proof_url, proof_path, proof_uploaded_at.
3. Notifications table and policies.
4. Payment proof storage bucket.
5. Policies so client, provider, and admin can view the required records.
6. A secure client_cancel_request function that keeps cancelled requests as records.
7. A secure client_update_request function for editing pending requests.

Important:
The updated code uses proof_url, proof_path, and proof_uploaded_at for payment proof.
If your report/data dictionary still says proof_payment_url, update it to proof_url for consistency.


Request image upload:
Run database/request-image-setup.sql to add optional request image upload for service requests.


Service specialization matching:
Run database/service-specialization-setup.sql after the existing database setup.
