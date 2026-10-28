# D03 applied on isolated staging — 28 October 2026

**Target:** `igotu-staging` / `oqalpauljjhytnrpzcqp`, distinct from IGotU production `giqtnbwyktbnbhdvjraa`.  
**Scope of this note:** User-supplied PowerShell execution screenshot and independent SELECT-only Supabase metadata readback. No D04 execution, additional SQL write, Auth/config change, production access or GitHub merge was performed by this review.

## Installation evidence

- The project owner explicitly approved applying **the exact reviewed D03 migration only**, conditional on an exclusive staging maintenance pause and supported operator connection. The owner then confirmed they were the only person using their staging project and had not connected it to CodeSandbox, Netlify, a local website or an external script.
- The owner's Windows workstation showed `psql 17.11`, successful direct IPv6 connection to the exact staging hostname using `postgres`, and a successful SHA-256 check of the downloaded D03 SQL:
  `e1bfd24182dc7f4fe3faf405b102cf87030a3adc53edeb01260b99dc936c11e6`.
- The owner ran the reviewed D03 SQL via the approved direct `psql` session, with session-specific attestation settings and error-stop. Their screenshot shows `UPDATE 1`, `COMMIT`, and the installation readback for `20261026.1` / `oqalpauljjhytnrpzcqp` / **phase 3**, followed by `D03 COMMAND COMPLETED`.
- Independent SELECT-only readback through the staging Supabase connection confirmed the exact installation record `version=20261026.1`, `project_ref=oqalpauljjhytnrpzcqp`, **`phase=3`**.

## Independent routine/privilege readback

A focused SELECT of `pg_proc` / effective routine execute privileges checked **27** affected routines (15 public entry points created or replaced, 12 private routines newly introduced):

| Check | Observed |
| --- | --- |
| Required signatures resolved | **27 / 27** |
| Missing required routines | **0** |
| `anon` effective EXECUTE on the 15 checked public routines | **0** |
| Raw `PUBLIC` EXECUTE grants on the 15 checked public routines | **0** |
| Raw `PUBLIC` EXECUTE grants on the 12 checked private routines | **0** |
| `authenticated` EXECUTE on the 12 checked private routines | **8** (explicit design grants; private namespace not exposed through Data API in the last screenshot-based review) |

These results confirm installation and initial routine-grant controls, **not complete runtime authorization/RLS/Storage behavior**. No real Auth user workflows or application writes were tested.

## IMPORTANT: SQL installation record vs Supabase CLI migration ledger

The operator applied D03 through `psql`, and the private IGotU installation phase now correctly says **3**. A fresh Supabase migration-ledger read still lists only the default-privilege quarantine, D01 and D02. **There is no D03 Supabase CLI migration-ledger entry.** This is an expected difference for manual `psql` execution, but must be **explicitly reconciled** before any later `supabase db push`, automated migration workflow or D04 ledger plan. **Do not rerun D03** or fabricate/force a ledger entry to make the histories match without separate reviewed approval.

## Decision and next step

- **D03 installed:** YES. **Phase 2 completed / Phase 3 entered.**
- **D04 installed:** NO, remains separate review and authorization.
- Keep staging Auth signup disabled, do not deploy the production-hardcoded frontend as a staging test client, and do not open staging to browser traffic yet.
- Prior to D04, review independent gates: effective API/private schema exposure, historical receipt/Storage ownership, notification emitters and duplicate writers, default/object/column ACLs and custom roles, safe operator connection + verified maintenance pause, SQL checksum, and D04's explicit `pre_cutover_reviewed`, `notifier_inventory_reviewed` and `legacy_receipts_reviewed` evidence.
- Apply D04 **only after** separate explicit user authorization and full post-D03 D04 preflight. D04 is not covered by the prior D03 approval.

This note supersedes earlier *current-status* statements within this draft PR that reported D03 uninstalled at phase 2. Those older reports remain historical snapshots.
