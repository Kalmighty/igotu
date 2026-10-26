# Source inventory — backend integration

Generated from `7dbbf89` plus the backend integration working tree. Static discovery is not evidence of live schema installation.

## File inventory

### .html: 30 files

- `admin/dashboard.html`
- `admin/manage-users.html`
- `admin/monitor-payments.html`
- `admin/monitor-requests.html`
- `admin/monitor-reviews.html`
- `admin/reports.html`
- `admin/verifications.html`
- `client/complete-profile.html`
- `client/create-request.html`
- `client/dashboard.html`
- `client/edit-profile.html`
- `client/messages.html`
- `client/my-requests.html`
- `client/recommended-providers.html`
- `client/report.html`
- `client/request-details.html`
- `client/verification.html`
- `forgot-password.html`
- `index.html`
- `login.html`
- `provider/assignment-details.html`
- `provider/complete-profile.html`
- `provider/dashboard.html`
- `provider/edit-profile.html`
- `provider/incoming-requests.html`
- `provider/messages.html`
- `provider/report.html`
- `provider/verification.html`
- `register.html`
- `reset-password.html`

### .css: 7 files

- `css/auth-roles.css`
- `css/home.css`
- `css/messages.css`
- `css/style.css`
- `css/ui.css`
- `css/verification-access.css`
- `css/workspace-gate.css`

### .js: 38 files

- `js/admin-manage-users.js`
- `js/admin-monitor-payments.js`
- `js/admin-monitor-requests.js`
- `js/admin-monitor-reviews.js`
- `js/admin-reports.js`
- `js/admin-verifications.js`
- `js/admin.js`
- `js/app-shell.js`
- `js/auth-roles.js`
- `js/auth.js`
- `js/backend-access.js`
- `js/client-complete-profile.js`
- `js/client-create-request.js`
- `js/client-edit-profile.js`
- `js/client-messages.js`
- `js/client-my-requests.js`
- `js/client-recommended-providers.js`
- `js/client-request-details.js`
- `js/client.js`
- `js/home.js`
- `js/html-safety.js`
- `js/identity-access.js`
- `js/notification-badge.js`
- `js/notification-menu.js`
- `js/notifications.js`
- `js/password-recovery.js`
- `js/payment-receipts.js`
- `js/profile-guard.js`
- `js/profile-menu.js`
- `js/provider-assignment-details.js`
- `js/provider-incoming-requests.js`
- `js/provider-messages.js`
- `js/provider-profile.js`
- `js/provider.js`
- `js/report-service.js`
- `js/service-action-dialogs.js`
- `js/supabaseClient.js`
- `js/verification.js`

### .sql: 23 files

- `database/backend-integration/20261026153952_01_foundation_draft.sql`
- `database/backend-integration/20261026153954_02_private_readers_draft.sql`
- `database/backend-integration/20261026153956_03_integrity_draft.sql`
- `database/backend-integration/20261026153958_04_cutover_draft.sql`
- `database/cancel-request-setup.sql`
- `database/identity-verification-setup.sql`
- `database/mandatory-identity-audit.sql`
- `database/mandatory-identity-verification-draft.sql`
- `database/notifications-setup.sql`
- `database/payment-proof-setup.sql`
- `database/priority-features-setup.sql`
- `database/profile-onboarding-setup.sql`
- `database/provider-weekly-availability-setup.sql`
- `database/remove-admin-notifications.sql`
- `database/request-cancellation-setup.sql`
- `database/request-editing-setup.sql`
- `database/request-image-setup.sql`
- `database/security-hardening-review.sql`
- `database/security-hardening-stage-a-additive.sql`
- `database/security-hardening-stage-c-lockdown.sql`
- `database/service-specialization-setup.sql`
- `database/setup.sql`
- `database/trust-safety-features-setup.sql`

## Pages, entry scripts and stylesheet links

| Page | Direct scripts | Stylesheets |
| --- | --- | --- |
| `admin/dashboard.html` | `../js/app-shell.js`<br>`../js/admin.js`<br>`../js/profile-guard.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `admin/manage-users.html` | `../js/app-shell.js`<br>`../js/admin-manage-users.js`<br>`../js/profile-guard.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `admin/monitor-payments.html` | `../js/app-shell.js`<br>`../js/admin-monitor-payments.js`<br>`../js/profile-guard.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `admin/monitor-requests.html` | `../js/app-shell.js`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`<br>`../js/admin-monitor-requests.js`<br>`../js/profile-guard.js` | `../css/style.css`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `admin/monitor-reviews.html` | `../js/app-shell.js`<br>`../js/admin-monitor-reviews.js`<br>`../js/profile-guard.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `admin/reports.html` | `../js/app-shell.js`<br>`../js/admin-reports.js`<br>`../js/profile-guard.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `admin/verifications.html` | `../js/app-shell.js`<br>`../js/admin-verifications.js`<br>`../js/profile-guard.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/verification-access.css`<br>`../css/workspace-gate.css` |
| `client/complete-profile.html` | `../js/app-shell.js`<br>`../js/profile-guard.js`<br>`../js/client-complete-profile.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `client/create-request.html` | `../js/app-shell.js`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/client-create-request.js` | `../css/style.css`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `client/dashboard.html` | `../js/app-shell.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/client.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `client/edit-profile.html` | `../js/app-shell.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/client-edit-profile.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `client/messages.html` | `../js/app-shell.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/client-messages.js` | `../css/style.css`<br>`../css/messages.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `client/my-requests.html` | `../js/app-shell.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/client-my-requests.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `client/recommended-providers.html` | `../js/app-shell.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/client-recommended-providers.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `client/report.html` | `../js/app-shell.js`<br>`../js/profile-guard.js`<br>`../js/profile-menu.js`<br>`../js/report-service.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `client/request-details.html` | `../js/app-shell.js`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/client-request-details.js` | `../css/style.css`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `client/verification.html` | `../js/profile-guard.js`<br>`../js/verification.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css`<br>`../css/verification-access.css` |
| `forgot-password.html` | `js/password-recovery.js` | `css/style.css` |
| `index.html` | `js/home.js` | `css/home.css` |
| `login.html` | `js/auth-roles.js`<br>`js/auth.js` | `css/style.css`<br>`css/auth-roles.css` |
| `provider/assignment-details.html` | `../js/app-shell.js`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/provider-assignment-details.js` | `../css/style.css`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `provider/complete-profile.html` | `../js/app-shell.js`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`<br>`../js/profile-guard.js`<br>`../js/provider-profile.js` | `../css/style.css`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `provider/dashboard.html` | `../js/app-shell.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/provider.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `provider/edit-profile.html` | `../js/app-shell.js`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/provider-profile.js` | `../css/style.css`<br>`https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `provider/incoming-requests.html` | `../js/app-shell.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/provider-incoming-requests.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `provider/messages.html` | `../js/app-shell.js`<br>`../js/profile-guard.js`<br>`../js/notification-badge.js`<br>`../js/notification-menu.js`<br>`../js/profile-menu.js`<br>`../js/provider-messages.js` | `../css/style.css`<br>`../css/messages.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `provider/report.html` | `../js/app-shell.js`<br>`../js/profile-guard.js`<br>`../js/profile-menu.js`<br>`../js/report-service.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css` |
| `provider/verification.html` | `../js/profile-guard.js`<br>`../js/verification.js` | `../css/style.css`<br>`../css/ui.css`<br>`../css/workspace-gate.css`<br>`../css/verification-access.css` |
| `register.html` | `js/auth-roles.js`<br>`js/auth.js` | `css/style.css`<br>`css/auth-roles.css` |
| `reset-password.html` | `js/password-recovery.js` | `css/style.css` |

## Browser data/API dependency inventory

Literal calls below include Storage `.from` as well as table `.from`. Dynamic `countTable` uses users, service_requests, payment_records and service_reviews. The authorized metadata comparison is recorded in docs/backend-integration; effective staging API behavior remains untested.

| Source module | `.from` targets | RPCs | Auth methods |
| --- | --- | --- | --- |
| `admin-manage-users.js` | `users` | `admin_update_user_status` | `getSession`, `signOut` |
| `admin-monitor-payments.js` | `payment_records`, `service_requests`, `users` |  | `getSession`, `signOut` |
| `admin-monitor-requests.js` | `service_requests`, `users` |  | `getSession`, `signOut` |
| `admin-monitor-reviews.js` | `service_requests`, `service_reviews`, `users` |  | `getSession`, `signOut` |
| `admin-reports.js` | `report-evidence`, `service_reports`, `service_requests`, `users` | `admin_review_service_report` | `getSession`, `signOut` |
| `admin-verifications.js` | `users`, `verification-documents`, `verification_requests` | `admin_review_verification`, `verification_reconciliation_queue` | `getSession`, `signOut` |
| `admin.js` | `service_reports`, `service_requests`, `users` |  | `getSession`, `signOut` |
| `auth.js` | `users` |  | `getSession`, `signInWithPassword`, `signOut`, `signUp` |
| `backend-access.js` |  | `igotu_backend_contract`, `provider_service_requests`, `recommended_provider_candidates`, `service_participants` |  |
| `client-complete-profile.js` | `users` | `complete_basic_profile` | `getSession`, `signOut` |
| `client-create-request.js` | `request-images`, `service_requests`, `users` | `client_save_request_image`, `client_update_request`, `create_service_request` | `getSession`, `signOut` |
| `client-edit-profile.js` | `users` | `complete_basic_profile` | `getSession`, `signOut` |
| `client-messages.js` | `internal_messages`, `service_requests`, `users` |  | `getSession`, `signOut` |
| `client-my-requests.js` | `service_requests`, `users` | `client_cancel_request` | `getSession`, `signOut` |
| `client-recommended-providers.js` | `service_requests`, `users` | `client_select_provider` | `getSession`, `signOut` |
| `client-request-details.js` | `payment-proofs`, `payment_records`, `service_requests`, `service_reviews`, `users` | `client_cancel_request`, `client_complete_request` | `getSession`, `signOut` |
| `client.js` | `service_requests`, `users` |  | `getSession`, `signOut` |
| `identity-access.js` | `verification_requests` |  |  |
| `notification-badge.js` | `notifications` |  | `getSession` |
| `notification-menu.js` | `notifications` |  | `getSession` |
| `notifications.js` | `notifications`, `users` |  | `getSession`, `signOut` |
| `password-recovery.js` |  |  | `getSession`, `resetPasswordForEmail`, `signOut`, `updateUser` |
| `payment-receipts.js` | `payment-proofs` | `payment_proof_reference` |  |
| `profile-guard.js` | `users` |  | `getSession`, `signOut` |
| `provider-assignment-details.js` | `payment_records`, `service_reviews`, `users` | `provider_start_request` | `getSession`, `signOut` |
| `provider-incoming-requests.js` | `users` | `provider_confirm_request`, `provider_decline_request` | `getSession`, `signOut` |
| `provider-messages.js` | `internal_messages`, `users` |  | `getSession`, `signOut` |
| `provider-profile.js` | `provider_profiles`, `provider_skills`, `provider_specializations`, `provider_weekly_availability`, `users` | `save_provider_profile` | `getSession`, `signOut` |
| `provider.js` | `service_reviews`, `users` |  | `getSession`, `signOut` |
| `report-service.js` | `report-evidence`, `service_requests`, `users` | `submit_service_report` | `getSession`, `signOut` |
| `supabaseClient.js` |  |  | `stopAutoRefresh` |
| `verification.js` | `users`, `verification-documents`, `verification_requests` |  |  |

## Repository SQL contracts (not an installed schema)

| SQL source | Declared tables | Declared public functions |
| --- | --- | --- |
| `20261026153952_01_foundation_draft.sql` | `igotu_backend_private` |  |
| `20261026153954_02_private_readers_draft.sql` |  | `payment_proof_reference`, `provider_service_requests`, `recommended_provider_candidates`, `service_participants`, `verification_reconciliation_queue` |
| `20261026153956_03_integrity_draft.sql` |  | `admin_review_service_report`, `admin_review_verification`, `admin_update_user_status`, `client_cancel_request`, `client_complete_request`, `client_save_request_image`, `client_select_provider`, `client_update_request`, `complete_basic_profile`, `create_service_request`, `provider_confirm_request`, `provider_decline_request`, `provider_start_request`, `save_provider_profile`, `submit_service_report` |
| `20261026153958_04_cutover_draft.sql` |  | `igotu_backend_contract` |
| `cancel-request-setup.sql` |  |  |
| `identity-verification-setup.sql` | `verification_requests` | `admin_review_verification` |
| `mandatory-identity-audit.sql` |  |  |
| `mandatory-identity-verification-draft.sql` |  | `admin_review_verification` |
| `notifications-setup.sql` | `notifications` |  |
| `payment-proof-setup.sql` |  |  |
| `priority-features-setup.sql` | `notifications` | `client_cancel_request`, `client_update_request` |
| `profile-onboarding-setup.sql` |  | `complete_basic_profile` |
| `provider-weekly-availability-setup.sql` | `provider_weekly_availability` |  |
| `remove-admin-notifications.sql` |  |  |
| `request-cancellation-setup.sql` |  | `client_cancel_request` |
| `request-editing-setup.sql` |  | `client_update_request` |
| `request-image-setup.sql` |  | `client_save_request_image` |
| `security-hardening-review.sql` |  |  |
| `security-hardening-stage-a-additive.sql` |  | `payment_proof_reference`, `provider_match_metadata`, `provider_service_requests` |
| `security-hardening-stage-c-lockdown.sql` |  |  |
| `service-specialization-setup.sql` | `provider_specializations` | `client_update_request` |
| `setup.sql` |  |  |
| `trust-safety-features-setup.sql` | `service_reports`, `service_request_declines` | `admin_review_service_report`, `client_cancel_request`, `client_select_provider`, `provider_confirm_request`, `provider_decline_request`, `submit_service_report` |

## Workflow and duplicate-code notes

- Public: homepage → role-selected Login/Register; forgot/reset password. Auth uses one Supabase project and trusted users rows.
- Client: mandatory verification → basic onboarding → dashboard/create/edit/cancel → request-specific recommendations → select Provider → messages → complete → offline payment and Provider review; participant reports.
- Provider: mandatory verification → basic/service profile, skills/specializations/location/hours → assigned incoming only → confirm/decline → assignment start/history → messages and Client review; participant reports.
- Admin: dashboard/users/status; verification private signed previews and review RPC; request/payment/review monitors; report review RPC.
- `notifications.js` is not referenced by any HTML page; current pages use `notification-menu.js` + badge. It remains legacy code, not silently loaded.
- Cancellation setup exists in cancel-request-setup.sql, request-cancellation-setup.sql and priority-features-setup.sql; definitions/policies differ. request-editing vs specialization scripts contain older/newer edit signatures. These are historical setup scripts, not a reliable ordered migration ledger.
- Old setup/readme instructions include legacy backfills, permissive policies and public receipt assumptions. Do not rerun them to fix UI errors. Stage A/C and the mandatory draft remain review-only, with separate integration gates.
- Repeated Client/Provider session/profile/logout/formatting handlers are identified technical debt. No framework rewrite or wholesale deletion was performed.
- External dependencies: Supabase SDK CDN; Leaflet 1.9.4 CSS/JS, OpenStreetMap tiles and Nominatim geocoder; Provider tiles also Esri fallback; browser geolocation and network permissions. Supabase SDK is pinned to 2.118.0; CDN availability and integrity remain external dependencies.
