IGotU Trust & Safety Feature Pack
=================================

This update adds the five priority improvements:

1. Report / Dispute System
   - Client can report selected Provider from Request Details.
   - Provider can report Client from Incoming Requests / Assignments.
   - Optional evidence upload uses PRIVATE Supabase bucket: report-evidence.
   - Admin -> Service Reports can mark Under Review, Resolve, or Dismiss.

2. Cancellation Reason + Re-matching
   - Client cancellation now requires a reason.
   - Provider decline now requires a reason.
   - Declined request returns to pending automatically.
   - A provider who declined the request is excluded from that request's recommendations.

3. Double-booking Prevention
   - Matching excludes providers already selected/confirmed/in progress at the exact requested date/time.
   - client_select_provider RPC checks again when Client selects.
   - provider_confirm_request RPC checks again when Provider confirms.

4. Location Privacy
   - Provider Incoming Requests show only an approximate area.
   - Exact service address/map is shown after confirmation in Assignments.
   - Client and Admin still retain their normal views.

5. Forgot Password / Account Recovery
   - Login -> Forgot password?
   - Supabase sends a recovery email.
   - reset-password.html lets the user set a new password.

SETUP
-----
1. Run database/trust-safety-features-setup.sql in Supabase SQL Editor.
2. Replace the changed website files, or use the full project ZIP.
3. In Supabase Dashboard -> Authentication -> URL Configuration, make sure your deployed Netlify site URL is configured as the Site URL / allowed redirect URL so password reset links can return to reset-password.html.

NOTES
-----
- Report evidence is PRIVATE.
- Location privacy is enforced in the IGotU application UI; the existing service_requests table still stores exact coordinates because matching and Admin monitoring need them.
- Double-booking currently treats the same preferred date + exact preferred time as a conflict because IGotU does not yet store service duration.
