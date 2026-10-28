# Supabase staging Auth Hooks screenshot review — 28 October 2026

**Observed project:** IGotU staging, `oqalpauljjhytnrpzcqp` (continued from the user's Supabase Authentication dashboard screenshots).  
**Scope:** screenshot-only inspection; no Supabase SQL, Auth/config changes, external HTTP hook tests, GitHub merge, deploy or production access.

## Observation

The **Authentication → Auth Hooks** screenshot shows an empty Hooks panel with the prompt **"Create an auth hook"** and buttons to add a hook. **No configured Auth Hooks are listed.** There is no evidence in this UI of a configured Auth HTTP endpoint or customizable PostgreSQL Auth Hook.

This is consistent with no custom Auth Hooks currently configured through the staging project's Auth Hooks UI, so no hook-specific external writer was identified.

## Limitations

- Configurable Supabase Auth Hooks are distinct from the existing Postgres **`auth.users` trigger `on_auth_user_created`**, independently found in the preceding SQL catalog review (D01 expected trigger bindings 11/11). **The Auth Hooks page does not disable or exclude the built-in trigger.**
- The screenshot is not a full inventory of external service-role writers, Auth sessions, direct database clients, mail events, Netlify/CodeSandbox, other projects or Auth URL configuration.
- New signups are disabled according to the separate Sign In / Providers screenshot, but this is not an independent maintenance freeze; authorized/admin flows could still write.
- No action was taken to add or remove a hook.

## Follow-up

1. Read-only review of **Authentication → URL Configuration** (allowed redirect origins and current Site URL; redact query strings/secrets).
2. Existing synthetic staging Auth account/session presence must be assessed by an authorized, privacy-preserving operator check if relevant.
3. Confirm external writer inventory and an operator-controlled maintenance pause immediately before any separately approved D03 application.
4. Leave D03 **NO-GO** until operational controls and a specific migration authorization are complete.

This is supporting evidence for the [external writer review](2026-10-28-external-writer-inventory.md), not an authorization or proof of full writer isolation.
