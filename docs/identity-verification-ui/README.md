# Client and Provider identity verification UI

Branch: `feat/identity-verification-ui-redesign`. Based on approved Draft PR #22 head `4a3630d8dedb6b93dc9e322fc0a71a3fe0cd36c4`, targeting `feat/client-edit-profile-customisation`. Existing PRs remain unchanged, open and unmerged. This work ends at the Client/Provider verification interface.

## Design and behaviour

The supplied reference is implemented as a separate, distraction-free onboarding page: compact white official-brand header, account-verification label, Log out, soft mint background, original shield SVG, “Let’s verify it’s you.” heading and role-specific introduction. No workspace sidebar, notification menu or account dropdown is introduced.

A horizontal desktop stepper becomes compact on phones. Its completed ticks, current step and accessible status text come from the existing verified state, never the illustration. Not submitted and rejected requests have Submit Identity current; pending has submission completed and Admin Review current; approved/incomplete has the first two completed and Complete Profile current; approved/completed has all three complete and no falsely active step.

The full-width status card shows an honest badge, explanation, actual submission/review dates, optional administrator note and the allowed next action. Valid dates use MYT (Asia/Kuala_Lumpur); missing/invalid dates show Unavailable. A missing review timestamp can invalidate approval through the unchanged identity predicate, so the page does not manufacture an approved state merely to display a date. Notes use textContent, preserve line breaks and wrap long text.

Approved/incomplete accounts continue to their own role's complete-profile.html; completed accounts continue to dashboard.html. Pending accounts cannot submit again. Rejected accounts can focus the existing resubmission form from a clear action. The separate read-only account card contains actual email, phone (or Not provided) and role; the existing account label shows the user code. It does not contain identification numbers or document paths.

The existing form fields, consent requirements, English/Malay privacy information, MyKad/passport validation, JPEG/PNG/PDF formats and 5 MiB limit remain. Provider business/trading name, SSM, professional licence and supporting document remain optional. The upload area has a chooser, image/PDF preview, filename/size, Change/Remove and a visible keyboard focus state; Remove returns focus to the file chooser. Previews stay local until submission.

## State gallery — actual Chromium, synthetic/offline

Every screenshot carries an **OFFLINE / SYNTHETIC ACCOUNT / DOCUMENT / NO LIVE SUPABASE** label. The label is inserted in normal flow for capture so it does not cover phone controls; measurements are taken without it. Identification input is redacted in captures. Preview images are generated synthetic “NOT AN ID DOCUMENT” samples, never real identity documents.

| View                         | Client                                                                                                          | Provider                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Approved desktop             | [1536px](screenshots/client-approved-1536.png), [1366px](screenshots/client-approved-1366.png)                  | [1536px](screenshots/provider-approved-1536.png), [1366px](screenshots/provider-approved-1366.png)                               |
| Approved tablet              | [768px](screenshots/client-approved-768.png)                                                                    | [768px](screenshots/provider-approved-768.png)                                                                                   |
| Approved phone               | [390px](screenshots/client-approved-390.png), [320px](screenshots/client-approved-320.png)                      | [390px](screenshots/provider-approved-390.png), [320px](screenshots/provider-approved-320.png)                                   |
| Before redesign              | [1536px](before/client-approved-1536.png), [390px](before/client-approved-390.png)                              | [1536px](before/provider-approved-1536.png), [390px](before/provider-approved-390.png)                                           |
| Not submitted / form         | [Desktop](screenshots/client-not_submitted-1536.png), [phone](screenshots/client-not_submitted-390.png)         | [Desktop](screenshots/provider-not_submitted-1536.png), [phone](screenshots/provider-not_submitted-390.png)                      |
| Pending                      | [Desktop](screenshots/client-pending-1536.png), [phone](screenshots/client-pending-390.png)                     | [Desktop](screenshots/provider-pending-1536.png), [phone](screenshots/provider-pending-390.png)                                  |
| Rejected / resubmission      | [Desktop](screenshots/client-rejected-1536.png), [phone](screenshots/client-rejected-390.png)                   | [Desktop](screenshots/provider-rejected-1536.png), [phone](screenshots/provider-rejected-390.png)                                |
| Approved + completed profile | [Desktop](screenshots/client-approved-complete-1536.png), [phone](screenshots/client-approved-complete-390.png) | [Desktop](screenshots/provider-approved-complete-1536.png), [phone](screenshots/provider-approved-complete-390.png)              |
| Local upload preview         | [Client image](screenshots/client-upload-preview.png)                                                           | [Provider image](screenshots/provider-upload-preview.png), [optional information](screenshots/provider-optional-information.png) |
| Acknowledged submission      | [Pending after confirmation](screenshots/client-confirmed-pending.png)                                          | [Pending after confirmation](screenshots/provider-confirmed-pending.png)                                                         |

More responsive captures: [Client 1920](screenshots/client-approved-1920.png), [1440](screenshots/client-approved-1440.png), [1024](screenshots/client-approved-1024.png); [Provider 1920](screenshots/provider-approved-1920.png), [1440](screenshots/provider-approved-1440.png), [1024](screenshots/provider-approved-1024.png).

Other states: [Missing details](screenshots/missing-details.png), [long note/email at 320px](screenshots/provider-long-note-320.png), [initial status error](screenshots/initial-status-error.png), [stale approved status after refresh failure](screenshots/approved-refresh-error.png), [refresh loading](screenshots/refresh-loading.png), [uploading](screenshots/uploading.png), [submitting](screenshots/submitting.png), [upload failure](screenshots/upload-failure.png), [definite submission failure](screenshots/submission-failure.png), [uncertain submission](screenshots/submission-uncertain.png).

## Safe state handling

Refresh has a single in-flight lock, concise loading/status announcements and aria-busy. It refreshes the authorized account summary without overwriting entered legal name, Provider fields, selected files or consent. A failed refresh retains the last visual status with a clear stale warning while hiding Continue and disabling submission until a successful check. Initial failures show Status Unavailable rather than an approval assumption.

Submission distinguishes ready, uploading, submitting, confirmed, failed and uncertain states. The existing global submission lock is retained and form controls/refresh are disabled during it. ID input and previews reset only after the insert is acknowledged. Provider optional values cannot change midway through uploading.

A verified recovery defect was corrected within verification.js: the previous catch could delete uploaded documents after a lost insert response while the request might already reference them. Returned coded API rejections continue through the existing cleanup/retry path. Thrown transport failures or uncoded insert failures are treated as uncertain: no automatic deletion of potentially referenced documents, no immediate resubmission, and an explicit status refresh. A fresh pending/approved state resolves the local uncertainty without reinserting. If a fresh read still cannot establish an outcome, the same-page lock remains and advises checking later. No new idempotency endpoint or backend change is introduced.

Cleanup after a definite failure remains best effort; returned and thrown cleanup failures are acknowledged without exposing paths. Uncertain uploads/inserts may leave private orphan files requiring operational retention review. There is no automatic retry of an insert or mutation of verification history/account status. Client memory is not an authorization boundary, and reload is not a proof of at-most-once submission.

## Changed files and preserved contracts

- `igotu_v2/client/verification.html`, `igotu_v2/provider/verification.html`: onboarding markup, stepper/status/account cards and existing forms.
- `igotu_v2/css/verification-access.css`: appended rules scoped to `.verification-onboarding`; its entire previous shared/Admin prefix is byte-identical.
- `igotu_v2/js/verification.js`: presentation/progress/timestamp updates, refresh/submission locks and conservative uncertain-response recovery.
- `igotu_v2/assets/identity-verification/identity-shield.svg`: original local decorative artwork.
- `tests/identity-verification-ui.cjs`, `tests/identity-verification-contract.cjs`: new synthetic browser and source checks.
- `docs/identity-verification-ui/`: screenshots, measurements and validation.

The original owned users/history reads, latest ordering/limit, insert payload (last four ID characters only), Provider-only optional payload, private bucket/path/upload options, file validation and preview render/reset functions remain normalized equal. Shared Auth/identity/backend modules, Admin approval logic, other Client/Provider workflows, existing test assertions and all SQL are unchanged. No migration or new API is included.

[Validation, reproduction and remaining live-staging limitations](VALIDATION.md).
