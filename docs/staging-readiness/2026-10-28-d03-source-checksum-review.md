# IGotU staging D03 SQL artifact identity — 28 October 2026

**Decision:** Exact source checksum **MATCHES** reviewed manifest. **Execution remains BLOCKED** and has not been authorized. Read-only GitHub source and review-file inspection only; no SQL, migration execution, Auth activity, production access, deployment, config mutation, or merge.

## Exact checked identity

| Field | Value |
| --- | --- |
| Staging target | `oqalpauljjhytnrpzcqp` (`igotu-staging`) — source review is not a live action |
| Review base | `igotu-staging-validation` |
| SQL source | `igotu_v2/database/backend-integration/20261026153956_03_integrity_draft.sql` |
| SQL Git blob SHA-1 | `d7a4e7bf6394a9188868cabbf285585a361084c0` |
| SQL byte length | **41,037 bytes**, UTF-8/LF |
| SHA-256 recomputed from fetched source | `e1bfd24182dc7f4fe3faf405b102cf87030a3adc53edeb01260b99dc936c11e6` |
| SHA-256 pinned in `docs/staging-readiness/statement-review.json` | `e1bfd24182dc7f4fe3faf405b102cf87030a3adc53edeb01260b99dc936c11e6` |
| Comparison | **Exact match** |
| Inventoried SQL statements | **40** |
| Statement dispositions | All `OFFLINE_REVIEWED_EXECUTION_BLOCKED` |
| Statement categories | `TransactionStmt` ×2, `VariableSetStmt` ×3, `DoStmt` ×2, `CreateFunctionStmt` ×27, `GrantStmt` ×5, `UpdateStmt` ×1 |

The fetched SQL begins with explicit **review-only, staging-only draft** comments and ends by advancing `igotu_backend_private.installation.phase` to **3** within the reviewed transaction. The migration remains unapplied; the previously observed live phase was **2**.

### What this check proves

The exact bytes of the checked-in D03 SQL match the SHA-256 value already pinned by the offline statement review. Its statement inventory has not been silently replaced in the review record. The comparison was computed from the retrieved source bytes without modifying the file.

### What this does **not** prove

- This does not independently validate the safety or semantics of all 40 statements; the review manifest says **offline-reviewed, execution blocked**, not *approved to execute*.
- The staging session and function fingerprints are time-specific. Recheck actual phase 2 and the 24 legacy hashes at any separately authorized maintenance window.
- This is not a verified migration execution path. No evidence has established a complete external writer freeze, approved privileged operator environment, or bounded D03 write authorization.
- The `supabase_admin` future default-grant policy, public request-image Storage privacy, and D04 notification/receipt/ACL requirements are separate review items.

## Operational next action

The operator must finalize the staging writer inventory and a controlled maintenance pause, resolve only the **supported** operator migration mechanism (never bypass managed environment restrictions), and obtain explicit **separate** approval naming this exact D03 checksum, project reference, scope, validation plan and stop conditions. If those remain unresolved, retain **D03 NO-GO**.

References: `docs/staging-readiness/statement-review.json`, `docs/staging-readiness/guide.md`, and other 2026-10-28 readiness reports in Draft PR #11.
