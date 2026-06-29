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
