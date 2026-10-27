# Phase 8 safe local validation

**Final outcomes: all 15 existing local groups PASS after environment retries; 94 functional fixture scenarios PASS, zero fixture failures.** These are not real staging tests. [Final per-group results](evidence/results.json), [initial runner summary](evidence/initial-summary.json), [fixture evidence](evidence/functional-fixtures.json) and [real staging accounting](evidence/staging-status.json) are separate.

The initial full runner completed all browser groups but five Python parser groups failed because the already installed `pglast` package under `work/sql-parser` was not on `PYTHONPATH`. Initial result: 10 passing / 5 failing groups. All five were then rerun successfully with the correct path. The expanded staging-preparation regression group was also rerun after the last harness changes. No browser application source changed, so those successful browser results were retained rather than described as a new clean full run. No staging connection was used to resolve this local environment problem.

| Check | Final local evidence | Limit |
| --- | --- | --- |
| Syntax/references | 30 HTML, 38 JS, 7 CSS, zero source errors | Application sources only; prepared CJS modules are also imported/plan-tested locally |
| SQL parsing | 24 SQL sources, 840 outer statements | Offline parser, no PostgreSQL execution/planning |
| Four coordinated drafts | 190 statements, 63 routines, 79 PL/pgSQL units; 13 compatible replacements | No actual result-type, privilege or transactional proof |
| Saved baseline/dependencies | 132 column contracts, 64 constraints, six enums, 11 triggers, 24 legacy routine hashes | Saved catalog only; actual staging drift unknown |
| Empty baseline | 191 statements, 14 empty tables, 24 identical quarantined routines; deterministic builder | Not installed; legacy bugs remain quarantined until D03/D04 |
| Identity/security drafts | Historical parser/body checks and unchanged-file checks pass | No authorization or production-data checks performed |
| Bundle integrity | [Five SHA-256 matches and explicit order](evidence/preflight.json), plus tamper/order/path regression denials | Does not authorize or install SQL |
| Test preparation guards | Mock controls; approval expiry before transport; exact race rejection; private credential placement/permissions/symlink checks; 20-case result accounting; default/missing-config plans | No live transport or real JWT/database test |
| Local browser/SDK | Homepage, all nine Login role pairs, scoped cleanup/cross-tab/invalidation, mandatory identity routes, 84 workspace layout checks | Responses intercepted or local synthetic HTTP only |
| Functional UI fixtures | 94 pass / 0 fail | Not backend integration evidence |
| Future procedure plans | Integration, real browser, matching truth table, signed expiry remain PREPARED_NOT_EXECUTED | No configured `--execute` used |

Local tools observed: Node `v24.19.0`, Supabase CLI `2.81.0` (version read only), pglast `8.7`; SDK and browser dependencies remain pinned as in Phase 7. No server PostgreSQL/Supabase version was observed in this phase. Supabase SMTP documentation was read via the documentation connector. Direct changelog access was blocked by the proxy with CONNECT 403; no bypass attempted. Platform changes remain an actual-project precondition.

Safe reproduction from the repository, with existing test dependencies, Chromium/loopback and subprocess permission:

```sh
PYTHONPATH=work/sql-parser AUDIT_OUTPUT=/workspace/igotu/work/phase8/recheck npm --prefix tests test
node tests/staging/preflight.cjs
node tests/staging/preparation.test.cjs
node tests/staging/integration.cjs --plan
node tests/staging/browser-login.cjs --plan
node tests/staging/storage-expiry.cjs --plan
node tests/staging/matching-matrix.cjs --plan
```

If pglast is installed normally, the explicit local PYTHONPATH is unnecessary. No SQL command is part of this reproduction. `--plan` does not load actual credentials or connect; mock subprocess tests invoke `--execute` **without any configuration** solely to prove it stops before network access.

## Real acceptance accounting

- Prepared workflows: **20**; executed **0**, passed **0**, failed **0**, **BLOCKED 20**.
- Backend/external groups: **0 PASS / 0 FAIL / 14 BLOCKED**.
- Installation baseline/D01/D02/D03/D04: all **BLOCKED**.
- All real Auth, database RLS/RPC, identity/Admin, matching, workflow, Storage expiry, race/rollback, notifications and external-service assertions remain unexecuted.

The future runner writes timestamps and all case outcomes to ignored `work/staging/api-results.json`, including NOT_TESTED after a failure. A CORE_API_PASS or partial result never closes an entire acceptance group. The [authorization packet](authorization.md) identifies the exact approvals still needed. No approval JSON or successful offline test substitutes for permission or real execution evidence.
