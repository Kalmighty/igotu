# D04 staging installation and independent confirmation — 28 October 2026

**Staging target:** `igotu-staging` / `oqalpauljjhytnrpzcqp`. **Production target `giqtnbwyktbnbhdvjraa` was not accessed.**

## Evidence of successful operator execution

The project owner separately authorized the exact reviewed D04-only staging migration with verified safeguards, then verified their local downloaded SQL checksum. The owner executed that SQL through the working direct PostgreSQL 17 `psql` connection. Their PowerShell screenshot displayed `UPDATE 1`, `NOTIFY`, `COMMIT` and installation record **version `20261026.1`, project_ref `oqalpauljjhytnrpzcqp`, phase `4`**. The PowerShell command reported success. That is **operator evidence**, not a new SQL invocation by the assistant.

## Independent SELECT-only staging readback

| Post-D04 check | Observed |
| --- | --- |
| Supabase project | `igotu-staging`, `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.003` |
| Private installation row | version `20261026.1`; project_ref `oqalpauljjhytnrpzcqp`; **phase 4** |
| `public` security policies with `v6_%` names | **45** |
| `storage.objects` security policies with `v6_%` names | **7** |
| Enabled `v6_%` triggers on `public` tables | **21** |
| Nine expected D04 private routine names | **9 found** |
| `public.igotu_backend_contract()` | **Present** |
| `anon` EXECUTE on public contract | **false** |
| `authenticated` EXECUTE on public contract | **true** |
| `anon` or `authenticated` EXECUTE on `igotu_backend_private.emit(text,uuid,text,text)` | **false for each** |
| `authenticated` EXECUTE on `igotu_backend_private.transition(text,text,uuid,text)` | **false** |
| Existing `auth.users` / `public.users` | **0 / 0** |
| `payment-proofs`, `report-evidence`, `verification-documents` buckets | **Private** |
| `request-images` bucket | **Public** (known, unresolved privacy-design decision) |

The verified installation record and function/policy/trigger evidence corroborate the operator's successful transaction. These catalog checks **do not** constitute JWT/RLS/Storage authorization tests or end-to-end Client/Provider/Admin behaviour validation.

## Important migration-ledger distinction

D03 and D04 were applied manually via `psql`, not via the Supabase migration-application tool. The Supabase migration ledger still lists only the staging privilege quarantine, D01 and D02 entries, whereas **IGotU's private installation record is at Phase 4**. Do **not** reapply D03 or D04 to fill in ledger entries. A separately reviewed reconciliation plan is required before `supabase db push` or automated deploy migrations.

## Follow-up and boundaries

1. Keep public signup disabled, and do not connect the production-hardcoded frontend to the staging database.
2. Recheck Data API exposed schemas (private `igotu_backend_private` must remain excluded) and ensure no unintended public application table or function exposure.
3. Only after separate authorization: configure a **staging-only** frontend, scoped synthetic Client/Provider/Admin Auth accounts, captured test email and inert identity documents; run authorized JWT-driven RLS/Storage and 20-case contract tests, plus role and denial controls.
4. Resolve the still-public `request-images` bucket privacy model before any real personal content.
5. Record migration-ledger strategy separately; preserve committed Phase 4 state. Production is not a validation target, nor a rollback option.
6. Draft PRs remain unmerged unless separately approved.

**Conclusion:** **D04 COMMITTED, independently confirmed. D01–D04 staging installation complete. Integration testing and privacy/security validation still pending.**
