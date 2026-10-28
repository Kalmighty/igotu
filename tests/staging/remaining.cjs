/* Focused continuation of the existing suite. No provisioning, SQL or Admin writes.
   --plan reads no private configuration and performs no authentication or network calls. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { check, makeRuntime, CheckError } = require('./runtime.cjs');
const plan = require('./acceptance-plan.json');
const supported = {
  'ST-05': ['clientA', 'providerA', 'pending', 'rejected', 'suspended'],
  'ST-06': ['clientA', 'providerA'],
  'ST-07': ['clientA', 'providerA', 'clientB'],
  'ST-08': ['clientA', 'providerA', 'clientB'],
  'ST-10': ['clientA', 'providerA'],
  'ST-12': ['clientA', 'providerA', 'providerB'],
  'ST-13': ['clientA', 'providerA', 'clientB'],
  'ST-17': ['admin', 'clientA'],
  'ST-19': ['clientA', 'clientB', 'providerB'],
};
const gaps = {
  'ST-05': ['Full workspace endpoint/state matrix and UI route guards'],
  'ST-06': ['Operator ACL/default grants/views/GraphQL review; authority PATCH probe'],
  'ST-07': ['Every RPC and caller-state combination; private helper routing'],
  'ST-08': ['Identity/report files, overwrite/delete races, signed URL expiry, payment proof ownership writes'],
  'ST-10': ['Independent fixture completeness and UI recommendation rendering'],
  'ST-12': ['Confirm conflict/replay and concurrent stale transitions'],
  'ST-13': ['Former Provider, suspended/revoked JWT and browser draft/thread navigation'],
  'ST-17': ['Report review writes, inactive Admin and 101-row queue pagination'],
  'ST-19': ['Operator barriers and profile/confirm/decline/suspension interleavings'],
};
const block = code => { const e = new CheckError(code); e.blocked = true; throw e; };
function selection(args) {
  const i = args.indexOf('--only');
  const ids = i < 0 ? ['ST-13'] : (args[i + 1] || '').split(',');
  check(ids.length && ids.every(id => plan.cases.some(c => c.id === id)), 'UNKNOWN_CASE');
  check(new Set(ids).size === ids.length, 'DUPLICATE_CASE_SELECTION');
  return ids;
}
function stateFile(file, binding) {
  let data;
  if (fs.existsSync(file)) {
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { block('JOURNAL_INVALID'); }
    check(data.binding === binding && data.version === 1, 'JOURNAL_FIXTURE_MISMATCH');
  } else data = { version: 1, binding, runId: crypto.randomUUID(), ids: {}, actions: {}, checks: {} };
  function save() {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  save();
  return { data, save, id(key) { if (!data.ids[key]) { data.ids[key] = crypto.randomUUID(); save(); } return data.ids[key]; } };
}
async function getOne(x, a, table, query) {
  const rows = await x.success(x.table(a, table, query));
  check(Array.isArray(rows) && rows.length === 1, 'FIXTURE_ROW_MISSING_OR_AMBIGUOUS');
  return rows[0];
}
async function active(x, name, role) {
  const a = await x.actor(name);
  const own = await getOne(x, a, 'users', { id: 'eq.' + a.id, select: 'id,role,status,profile_completed,identity_verified' });
  if (!(own.role === role && own.status === 'active' && (role === 'admin' || (own.profile_completed && own.identity_verified)))) block('APPROVED_ACTIVE_FIXTURE_REQUIRED');
  return a;
}
async function protectedSnapshot(x, c) {
  const r = await getOne(x, c, 'service_requests', { request_id: 'eq.SR0001' });
  const payments = await x.success(x.table(c, 'payment_records', { request_id: 'eq.SR0001', order: 'id' }));
  const reviews = await x.success(x.table(c, 'service_reviews', { request_id: 'eq.SR0001', order: 'id' }));
  check(r.client_id === c.id && r.selected_provider_id === x.config.accounts.providerA.id && r.status === 'completed', 'PROTECTED_SERVICE_STATE_CHANGED');
  check(payments.length === 1 && Number(payments[0].amount) === 100 && payments[0].payment_method === 'Cash', 'PROTECTED_PAYMENT_STATE_CHANGED');
  check(reviews.length === 2 && new Set(reviews.map(r => r.reviewer_id)).size === 2 &&
    reviews.every(r => Number(r.rating) === 5 && [c.id, x.config.accounts.providerA.id].includes(r.reviewer_id)), 'PROTECTED_REVIEW_STATE_CHANGED');
  return JSON.stringify({ r, payments, reviews });
}
async function pair(x, requestId) {
  const c = await active(x, 'clientA', 'client'), p = await active(x, 'providerA', 'provider');
  const r = await getOne(x, c, 'service_requests', { request_id: 'eq.' + requestId });
  if (!(r.client_id === c.id && r.selected_provider_id === p.id && ['provider_selected','confirmed','in_progress','completed'].includes(r.status))) block('CURRENT_SERVICE_PAIR_REQUIRED');
  const projection = await x.success(x.rpc(p, 'provider_service_requests', { p_request_id: requestId, p_statuses: null }));
  check(projection.length === 1 && projection[0].request_id === requestId, 'PROVIDER_ASSIGNMENT_CONTROL_FAILED');
  return { c, p, r };
}
async function message(x, j, requestId, sender, receiver, outsider, key) {
  const id = j.id(key), text = 'SYNTHETIC IGotU ST-13 ' + j.data.runId + ' ' + key;
  const query = { id: 'eq.' + id };
  let rows = await x.success(x.table(sender, 'internal_messages', query));
  if (!rows.length) {
    if (j.data.actions[key]) block('UNCERTAIN_MESSAGE_WRITE_REQUIRES_RECONCILIATION');
    j.data.actions[key] = 'attempted'; j.save();
    await x.success(x.table(sender, 'internal_messages', {}, 'POST', { id, request_id: requestId, sender_id: sender.id, receiver_id: receiver.id, message_text: text, is_read: true }));
    rows = await x.success(x.table(sender, 'internal_messages', query));
  }
  check(rows.length === 1 && rows[0].request_id === requestId && rows[0].sender_id === sender.id && rows[0].receiver_id === receiver.id && rows[0].message_text === text, 'MESSAGE_CONTENT_OR_PAIR_CHANGED');
  let received = await getOne(x, receiver, 'internal_messages', query);
  if (!j.data.checks[key + '.unread']) {
    check(received.is_read === false, 'SENDER_SET_RECEIVER_READ_FLAG');
    j.data.checks[key + '.unread'] = true; j.save();
  }
  await x.denied(outsider, () => x.table(outsider, 'internal_messages', query));
  // Only is_read has UPDATE privilege. A successful zero-row sender PATCH is
  // insufficient evidence on its own: verify the receiver's row afterward.
  if (!j.data.checks[key + '.senderReadDenied']) {
    if (received.is_read !== false) block('UNREAD_CONTROL_ALREADY_CHANGED');
    await x.denied(sender, () => x.table(sender, 'internal_messages', query, 'PATCH', { is_read: true }));
    received = await getOne(x, receiver, 'internal_messages', query);
    check(received.is_read === false, 'SENDER_CHANGED_READ_FLAG');
    j.data.checks[key + '.senderReadDenied'] = true; j.save();
  }
  await x.denied(outsider, () => x.table(outsider, 'internal_messages', query, 'PATCH', { is_read: true }));
  for (const field of ['message_text', 'sender_id', 'receiver_id', 'request_id']) {
    const values = { message_text: 'SYNTHETIC FORBIDDEN EDIT', sender_id: outsider.id, receiver_id: outsider.id, request_id: 'SYNTHETIC-FORBIDDEN' };
    await x.denied(receiver, () => x.table(receiver, 'internal_messages', query, 'PATCH', { [field]: values[field] }), { empty: false });
  }
  received = await getOne(x, receiver, 'internal_messages', query);
  check(received.message_text === text && received.sender_id === sender.id && received.receiver_id === receiver.id && received.request_id === requestId, 'DENIED_PATCH_CHANGED_MESSAGE');
  if (!received.is_read) {
    if (j.data.actions[key + '.read']) block('UNCERTAIN_READ_UPDATE_REQUIRES_RECONCILIATION');
    j.data.actions[key + '.read'] = 'attempted'; j.save();
    await x.success(x.table(receiver, 'internal_messages', query, 'PATCH', { is_read: true }));
  }
  check((await getOne(x, sender, 'internal_messages', query)).is_read === true, 'READ_FLAG_NOT_PERSISTED');
  const event = 'eq.internal_messages:' + id;
  const notices = await x.success(x.table(receiver, 'notifications', { event_key: event }));
  check(notices.length === 1 && notices[0].user_id === receiver.id, 'MESSAGE_NOTIFICATION_NOT_UNIQUE');
  await x.denied(outsider, () => x.table(outsider, 'notifications', { event_key: event }));
  const senderNotices = await x.success(x.table(sender, 'notifications', { event_key: event }));
  check(senderNotices.length === 0, 'WRONG_MESSAGE_NOTIFICATION_RECIPIENT');
  j.data.actions[key] = 'verified'; j.data.actions[key + '.read'] = 'verified'; j.save();
}
async function negativeInsert(x, j, a, c, p, requestId, key, changes) {
  const id = j.id(key);
  const exists = await x.success(x.table(c, 'internal_messages', { id: 'eq.' + id }));
  check(exists.length === 0, 'FORBIDDEN_MESSAGE_PERSISTED');
  if (j.data.actions[key] === 'verified') return;
  if (j.data.actions[key]) block('UNCERTAIN_NEGATIVE_WRITE_REQUIRES_RECONCILIATION');
  j.data.actions[key] = 'attempted'; j.save();
  await x.denied(a, () => x.table(a, 'internal_messages', {}, 'POST', { id, request_id: requestId, sender_id: a.id, receiver_id: p.id, message_text: 'SYNTHETIC DENIED PROBE', ...changes }), { empty: false });
  const after = await x.success(x.table(c, 'internal_messages', { id: 'eq.' + id }));
  check(after.length === 0, 'DENIED_INSERT_CHANGED_MESSAGES');
  // Also inspect as the attempted sender; an incorrectly accepted outsider row
  // may not be visible to the valid service pair.
  check((await x.success(x.table(a, 'internal_messages', { id: 'eq.' + id }))).length === 0, 'DENIED_INSERT_VISIBLE_TO_ATTACKER');
  j.data.actions[key] = 'verified'; j.save();
}
const checks = {};
checks['ST-13'] = async (x, j) => {
  const id = x.config.remaining?.messageRequestId || 'SR0001';
  const { c, p } = await pair(x, id), b = await active(x, 'clientB', 'client');
  await message(x, j, id, c, p, b, 'client-to-provider');
  await message(x, j, id, p, c, b, 'provider-to-client');
  await negativeInsert(x, j, b, c, p, id, 'unrelated-send', {});
  await negativeInsert(x, j, c, c, p, id, 'forged-sender', { sender_id: p.id, receiver_id: c.id });
  await negativeInsert(x, j, c, c, p, id, 'foreign-receiver', { receiver_id: b.id });
  await x.denied(c, () => x.table(c, 'notifications', {}, 'POST', { user_id: p.id, title: 'SYNTHETIC DENIED', message: 'SYNTHETIC DENIED', is_read: false }), { empty: false });
  return ['Two-way messages and independent readback', 'Sender unread normalization and receiver-only read updates', 'Cross-account SELECT/INSERT/PATCH and authority-column denial', 'One server notification per message; unrelated notification reads denied'];
};
checks['ST-05'] = async x => {
  const c = await active(x, 'clientA', 'client'), p = await active(x, 'providerA', 'provider');
  await x.success(x.table(c, 'service_requests', { client_id: 'eq.' + c.id, limit: 1 }));
  await x.success(x.rpc(p, 'provider_service_requests', { p_request_id: null, p_statuses: null }));
  for (const name of ['pending','rejected','suspended']) {
    const a = await x.actor(name);
    const own = await getOne(x, a, 'users', { id: 'eq.' + a.id });
    if (name === 'suspended' ? own.status !== 'suspended' : own.identity_verified) block('RESTRICTED_ACCOUNT_FIXTURE_DRIFT');
    if (name !== 'suspended') {
      const history = await x.success(x.table(a, 'verification_requests', { user_id: 'eq.' + a.id, order: 'submitted_at.desc,id.desc', limit: 1 }));
      if (history[0]?.status !== name) block('VERIFICATION_HISTORY_FIXTURE_DRIFT');
    }
    await x.denied(a, () => x.table(a, 'service_requests', { request_id: 'eq.SR0001' }));
    await x.denied(a, () => x.table(a, 'internal_messages', { request_id: 'eq.SR0001' }));
    await x.denied(a, () => x.table(a, 'payment_records', { request_id: 'eq.SR0001' }));
    await x.denied(a, () => x.rpc(a, 'provider_service_requests', { p_request_id: null, p_statuses: null }), { empty: false });
  }
  return ['Pending/rejected/suspended own-account controls and workspace read/RPC denial'];
};
checks['ST-06'] = async x => {
  const c = await active(x, 'clientA', 'client'), p = await active(x, 'providerA', 'provider');
  const anon = await x.table(null, 'users', { select: 'id', limit: 1 });
  check([401,403].includes(anon.status) && anon.data?.code === '42501', 'ANONYMOUS_TABLE_ACCESS_NOT_DENIED');
  for (const a of [null,c,p]) for (const [header,method,resource] of [['Accept-Profile','GET','/rest/v1/installation?select=version'],['Content-Profile','POST','/rest/v1/rpc/contract']]) {
    if (a) await x.sessionControl(a);
    const r = await x.request(a, resource, { method, headers: { [header]: 'igotu_backend_private' }, ...(method === 'POST' ? { body: {} } : {}) });
    check(r.status === 406 && r.data?.code === 'PGRST106', 'PRIVATE_SCHEMA_EXPOSURE_NOT_DENIED');
  }
  await x.denied(p, () => x.table(p, 'service_requests', { request_id: 'eq.SR0001' }));
  return ['Anonymous table and explicit private-schema REST routing denial', 'Provider raw Client request access denied'];
};
checks['ST-07'] = async x => {
  const { c, p } = await pair(x, 'SR0001'), b = await active(x, 'clientB', 'client');
  await x.success(x.rpc(p, 'provider_service_requests', { p_request_id: 'SR0001', p_statuses: null }));
  await x.denied(c, () => x.rpc(c, 'provider_service_requests', { p_request_id: 'SR0001', p_statuses: null }), { empty: false });
  await x.denied(b, () => x.rpc(b, 'service_participants', { p_request_ids: ['SR0001'] }));
  return ['Scoped reader positive controls, wrong-role and unrelated participant RPC denials'];
};
checks['ST-08'] = async x => {
  const requestId = x.config.receiptRequestId;
  if (!requestId || requestId === 'SR0001') block('SEPARATE_COMPLETED_TRANSFER_FIXTURE_REQUIRED');
  const { c, p, r } = await pair(x, requestId), b = await active(x, 'clientB', 'client');
  if (r.status !== 'completed') block('COMPLETED_TRANSFER_REQUIRED');
  const payment = await getOne(x, c, 'payment_records', { request_id: 'eq.' + requestId });
  check(payment.client_id === c.id && payment.provider_id === p.id && ['Bank Transfer','QR Transfer'].includes(payment.payment_method) && payment.proof_path?.startsWith(c.id + '/'), 'OWNED_TRANSFER_PROOF_REQUIRED');
  const ref = await x.success(x.rpc(p, 'payment_proof_reference', { p_request_id: requestId }));
  check(ref.length === 1 && ref[0].proof_path === payment.proof_path && !ref[0].proof_url, 'PRIVATE_PROOF_REFERENCE_FAILED');
  const resource = '/storage/v1/object/sign/payment-proofs/' + payment.proof_path.split('/').map(encodeURIComponent).join('/');
  const signed = await x.request(p, resource, { method: 'POST', body: { expiresIn: 60 } });
  check(signed.ok && typeof signed.data?.signedURL === 'string', 'SIGNED_PROOF_POSITIVE_CONTROL_FAILED');
  await x.sessionControl(b);
  const foreign = await x.request(b, resource, { method: 'POST', body: { expiresIn: 60 } });
  check([400,403,404].includes(foreign.status) && ['400','403','404'].includes(String(foreign.data?.statusCode)), 'FOREIGN_PROOF_SIGNING_NOT_DENIED');
  const pub = await x.request(null, resource.replace('/object/sign/', '/object/public/'));
  check([400,403,404].includes(pub.status) && ['400','403','404'].includes(String(pub.data?.statusCode)), 'PUBLIC_PROOF_ACCESS_NOT_DENIED');
  return ['Owned private transfer proof reference and participant signing', 'Unrelated signing and anonymous public proof access denied'];
};
checks['ST-10'] = async x => {
  if (!x.config.matchingControlRequestId || !Array.isArray(x.config.matchingCases) || x.config.matchingCases.length < 8) block('INDEPENDENT_MATCHING_TRUTH_TABLE_REQUIRED');
  const c = await active(x, 'clientA', 'client'), p = await active(x, 'providerA', 'provider');
  const control = await x.success(x.rpc(c, 'recommended_provider_candidates', { p_request_id: x.config.matchingControlRequestId }));
  check(control.some(r => r.id === p.id), 'MATCHING_POSITIVE_CONTROL_FAILED');
  await require('./matching-matrix.cjs').runMatrix(x, c);
  return ['Exact supplied candidate sets, statistics and distance order for eight or more independent fixtures'];
};
async function createFixture(x, j, c, key, details) {
  const creationKey = j.id(key), query = { client_id: 'eq.' + c.id, creation_key: 'eq.' + creationKey };
  let rows = await x.success(x.table(c, 'service_requests', query));
  if (!rows.length) {
    if (j.data.actions[key]) block('UNCERTAIN_FIXTURE_CREATION_REQUIRES_RECONCILIATION');
    j.data.actions[key] = 'attempted'; j.save();
    await x.success(x.rpc(c, 'create_service_request', { p_idempotency_key: creationKey, p_details: details }));
    rows = await x.success(x.table(c, 'service_requests', query));
  }
  check(rows.length === 1 && rows[0].request_id !== 'SR0001' && rows[0].client_id === c.id && rows[0].title === details.title && rows[0].preferred_date === details.preferred_date, 'SYNTHETIC_FIXTURE_READBACK_FAILED');
  check(Number(rows[0].budget) === Number(details.budget) && rows[0].category === details.category && rows[0].service_type === details.service_type && String(rows[0].preferred_time).slice(0,5) === details.preferred_time.slice(0,5), 'SYNTHETIC_FIXTURE_DETAILS_CHANGED');
  j.data.actions[key] = 'verified'; j.save();
  return rows[0];
}
checks['ST-12'] = async (x, j) => {
  const setup = x.config.remaining?.decline;
  if (!setup || setup.synthetic !== true) block('DEDICATED_DECLINE_FIXTURE_REQUIRED');
  const c = await active(x, 'clientA', 'client'), p = await active(x, 'providerA', 'provider'), q = await active(x, 'providerB', 'provider');
  let f = setup;
  if (setup.create === true) {
    const title = 'SYNTHETIC ST-12 ' + j.data.runId;
    const created = await createFixture(x, j, c, 'decline.create', x.details(title, x.config.date, '12:00:00'));
    f = { synthetic: true, requestId: created.request_id, title };
  }
  if (!f.requestId || f.requestId === 'SR0001') block('DEDICATED_DECLINE_FIXTURE_REQUIRED');
  const get = () => getOne(x, c, 'service_requests', { request_id: 'eq.' + f.requestId });
  let r = await get();
  check(r.client_id === c.id && r.title === f.title && /^SYNTHETIC/.test(r.title), 'DECLINE_FIXTURE_OWNERSHIP_REQUIRED');
  const history = () => x.success(x.table(c, 'service_request_declines', { request_id: 'eq.' + f.requestId, provider_id: 'eq.' + p.id }));
  let declines = await history();
  const step = async (key, a, rpc, args) => {
    if (j.data.actions[key]) block('UNCERTAIN_DECLINE_TRANSITION_REQUIRES_RECONCILIATION');
    j.data.actions[key] = 'attempted'; j.save();
    await x.success(x.rpc(a, rpc, args));
    j.data.actions[key] = 'responded'; j.save();
  };
  if (r.status === 'pending' && declines.length === 0) {
    const candidates = await x.success(x.rpc(c, 'recommended_provider_candidates', { p_request_id: f.requestId }));
    if (![p.id,q.id].every(id => candidates.some(r => r.id === id))) block('TWO_ELIGIBLE_APPROVED_PROVIDERS_REQUIRED');
    await step('decline.select', c, 'client_select_provider', { p_request_id: f.requestId, p_provider_id: p.id });
    r = await get();
  }
  if (r.status === 'provider_selected' && r.selected_provider_id === p.id && declines.length === 0) {
    await step('decline.perform', p, 'provider_decline_request', { p_request_id: f.requestId, p_reason: 'SYNTHETIC ST-12 ' + j.data.runId });
    r = await get(); declines = await history();
  }
  check(declines.length === 1 && declines[0].reason === 'SYNTHETIC ST-12 ' + j.data.runId, 'DECLINE_HISTORY_NOT_PROVEN');
  if (r.status === 'pending' && r.selected_provider_id === null) {
    const candidates = await x.success(x.rpc(c, 'recommended_provider_candidates', { p_request_id: f.requestId }));
    check(!candidates.some(r => r.id === p.id), 'DECLINED_PROVIDER_STILL_RECOMMENDED');
    if (!candidates.some(r => r.id === q.id)) block('RECOVERY_PROVIDER_NO_LONGER_ELIGIBLE');
    j.data.checks['decline.excluded'] = true; j.save();
    await step('decline.recover', c, 'client_select_provider', { p_request_id: f.requestId, p_provider_id: q.id });
    r = await get();
  }
  check(j.data.checks['decline.excluded'] && r.status === 'provider_selected' && r.selected_provider_id === q.id, 'DECLINE_RECOVERY_STATE_NOT_PROVEN');
  const assigned = await x.success(x.rpc(q, 'provider_service_requests', { p_request_id: f.requestId, p_statuses: null }));
  check(assigned.length === 1 && assigned[0].request_id === f.requestId, 'RECOVERED_ASSIGNMENT_NOT_RECEIVED');
  const notices = await x.success(x.table(c, 'notifications', { event_key: 'eq.service_requests:' + r.id + ':pending:' + p.id }));
  check(notices.length === 1, 'DECLINE_NOTIFICATION_NOT_UNIQUE');
  return ['Separate fixture decline history, candidate exclusion and assignment recovery readback'];
};
checks['ST-17'] = async x => {
  const admin = await active(x, 'admin', 'admin'), c = await active(x, 'clientA', 'client');
  const payments = await x.success(x.table(admin, 'payment_records', { request_id: 'eq.SR0001' }));
  check(payments.length === 1 && Number(payments[0].amount) === 100, 'ADMIN_MONITOR_PAYMENT_FAILED');
  const queue = await x.success(x.rpc(admin, 'verification_reconciliation_queue', { p_after: null }));
  check(Array.isArray(queue), 'ADMIN_QUEUE_CONTROL_FAILED');
  await x.denied(c, () => x.rpc(c, 'verification_reconciliation_queue', { p_after: null }), { empty: false });
  return ['Existing active Admin payment monitor and reconciliation reader; Client denial'];
};
checks['ST-19'] = async (x, j) => {
  if (x.config.remaining?.concurrency !== true) block('DEDICATED_CONCURRENCY_FIXTURES_REQUIRED');
  const c = await active(x, 'clientA', 'client'), b = await active(x, 'clientB', 'client'), p = await active(x, 'providerB', 'provider');
  const { selectionRaceResult } = require('./integration.cjs');
  for (let i = 0; i < 20; i++) {
    if (j.data.checks['race.' + i]) continue;
    const when = new Date(x.config.date + 'T12:00:00Z'); when.setUTCDate(when.getUTCDate() + i + 1);
    const date = when.toISOString().slice(0,10), key = 'race.' + i;
    const one = await createFixture(x, j, c, key + '.a', x.details('SYNTHETIC ST-19 A ' + j.data.runId + ' ' + i, date));
    const two = await createFixture(x, j, b, key + '.b', x.details('SYNTHETIC ST-19 B ' + j.data.runId + ' ' + i, date));
    const jobs = [[c,one],[b,two]]; if (i % 2) jobs.reverse();
    if (!j.data.actions[key]) {
      check([one,two].every(r => r.status === 'pending' && r.selected_provider_id === null), 'RACE_FIXTURE_NOT_PRISTINE');
      for (const [a,r] of jobs) {
        const candidates = await x.success(x.rpc(a, 'recommended_provider_candidates', { p_request_id: r.request_id }));
        if (!candidates.some(candidate => candidate.id === p.id)) block('RACE_PROVIDER_NOT_ELIGIBLE');
      }
      j.data.actions[key] = 'attempted'; j.save();
      const rs = await Promise.all(jobs.map(([a,r]) => x.rpc(a, 'client_select_provider', { p_request_id: r.request_id, p_provider_id: p.id })));
      selectionRaceResult(rs);
      j.data.actions[key] = 'validatedResponses'; j.save();
    }
    if (j.data.actions[key] !== 'validatedResponses') block('UNCERTAIN_RACE_RESPONSES_REQUIRE_RECONCILIATION');
    if (!j.data.checks[key + '.exclusive']) {
      const final = [];
      for (const [a,r] of jobs) final.push(await getOne(x, a, 'service_requests', { request_id: 'eq.' + r.request_id }));
      check(final.filter(r => r.status === 'provider_selected' && r.selected_provider_id === p.id).length === 1 && final.filter(r => r.status === 'pending' && r.selected_provider_id === null).length === 1, 'RACE_FINAL_STATE_NOT_EXCLUSIVE');
      const projection = await x.success(x.rpc(p, 'provider_service_requests', { p_request_id: null, p_statuses: ['provider_selected'] }));
      check(projection.filter(r => [one.request_id,two.request_id].includes(r.request_id)).length === 1, 'RACE_PROVIDER_PROJECTION_NOT_EXCLUSIVE');
      j.data.checks[key + '.exclusive'] = true; j.save();
    }
    // Preserve all request/history rows; release only this run's synthetic slots.
    for (const [a,r] of jobs) {
      const current = await getOne(x, a, 'service_requests', { request_id: 'eq.' + r.request_id });
      if (current.status !== 'cancelled') {
        const cleanup = key + '.cancel.' + a.id;
        if (j.data.actions[cleanup]) block('UNCERTAIN_RACE_CLEANUP_REQUIRES_RECONCILIATION');
        j.data.actions[cleanup] = 'attempted'; j.save();
        await x.success(x.rpc(a, 'client_cancel_request', { p_request_id: r.request_id, p_reason: 'SYNTHETIC ST-19 cleanup ' + j.data.runId }));
      }
      check((await getOne(x, a, 'service_requests', { request_id: 'eq.' + r.request_id })).status === 'cancelled', 'RACE_CLEANUP_NOT_PERSISTED');
    }
    j.data.checks[key] = true; j.save();
  }
  return ['20 actual-JWT same-slot races in alternating launch order; exact winner/conflict responses', 'Independent Client and Provider final-state readback; synthetic requests cancelled and retained'];
};
function reportResults(selected, results) {
  return plan.cases.map(c => ({ id: c.id, name: c.name, groups: c.groups,
    ...(results.find(r => r.id === c.id) || { status: selected.includes(c.id) ? 'BLOCKED' : 'SKIPPED', code: selected.includes(c.id) ? 'STOPPED_AFTER_FAILURE_OR_BLOCK' : 'NOT_SELECTED' }),
    acceptanceStatus: 'UNVERIFIED', remaining: gaps[c.id] || [c.procedure_and_assertions] }));
}
async function run(x, j, selected, emit = () => {}) {
  const results = [];
  const c = await active(x, 'clientA', 'client');
  const contract = await x.success(x.rpc(c, 'igotu_backend_contract'));
  check(contract?.version === '20261026.1' && contract.notifications === 'database', 'PHASE4_BACKEND_CONTRACT_REQUIRED');
  const before = await protectedSnapshot(x, c);
  const digest = crypto.createHash('sha256').update(before).digest('hex');
  if (j.data.protectedDigest) check(j.data.protectedDigest === digest, 'PROTECTED_EVIDENCE_CHANGED_SINCE_RUN');
  else { j.data.protectedDigest = digest; j.save(); }
  for (const id of selected) {
    try {
      if (!checks[id]) block('REQUIRES_SEPARATE_BROWSER_OPERATOR_OR_PRIVILEGED_FIXTURES');
      const assertions = await checks[id](x, j);
      check(await protectedSnapshot(x, c) === before, 'PROTECTED_SR0001_CHANGED');
      results.push({ id, status: 'PASS', coverage: 'FOCUSED_API_CHECKS_ONLY', assertions });
    } catch (e) {
      results.push({ id, status: e.blocked || e.safeCode === 'TRANSPORT_FAILED' ? 'BLOCKED' : 'FAIL', code: e.safeCode || 'UNCLASSIFIED_CHECK_FAILURE' });
      emit(results.at(-1));
      break;
    }
    emit(results.at(-1));
  }
  // A failed probe may have changed data despite its error response.
  try { check(await protectedSnapshot(x, c) === before, 'PROTECTED_SR0001_CHANGED'); }
  catch (e) { results.push({ id: 'PROTECTED-SR0001', status: 'FAIL', code: e.safeCode || 'PROTECTED_EVIDENCE_READBACK_FAILED' }); }
  return results;
}
async function main(args) {
  const selected = selection(args);
  if (!args.includes('--execute')) {
    for (const id of selected) console.log(id + ' PREPARED_NOT_EXECUTED ' + (supported[id] ? 'focused existing-fixture checks' : 'BLOCKED separate operator/browser procedure'));
    return;
  }
  const actors = [...new Set(['clientA','providerA', ...selected.flatMap(id => supported[id] || [])])];
  const options = { remaining: true, actors };
  const startedAt = new Date().toISOString();
  const reportDir = path.resolve(__dirname, '../../work/staging/remaining-reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const getArg = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const journalPath = path.resolve(getArg('--state', path.join(reportDir, 'remaining-state.json')));
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  const reportPath = path.join(reportDir, startedAt.replace(/[:.]/g, '-') + '-' + crypto.randomUUID() + '.json');
  let release = false, results = [], journal, projectRef = 'oqalpauljjhytnrpzcqp';
  try {
    const { config, approval, secrets } = require('./config.cjs').load(args, options);
    fs.closeSync(fs.openSync(journalPath + '.lock', 'wx', 0o600)); release = true;
    const binding = crypto.createHash('sha256').update(JSON.stringify({ projectRef, accounts: config.accounts, date: config.date, remaining: config.remaining, receiptRequestId: config.receiptRequestId, matchingControlRequestId: config.matchingControlRequestId, matchingCases: config.matchingCases })).digest('hex');
    journal = stateFile(journalPath, binding);
    const x = makeRuntime(config, approval, secrets, fetch, options);
    results = await run(x, journal, selected, r => console.log(r.id + ' ' + r.status + (r.code ? ' ' + r.code : '')));
  } catch (e) {
    results.push({ id: 'PREFLIGHT', status: e.safeCode?.startsWith('PROTECTED_') ? 'FAIL' : 'BLOCKED', code: e.code === 'EEXIST' ? 'RUN_LOCK_EXISTS' : e.safeCode || 'LOCAL_CONFIGURATION_OR_JOURNAL_INVALID' });
    console.log('PREFLIGHT ' + results.at(-1).status + ' ' + results.at(-1).code);
  } finally {
    if (release) fs.unlinkSync(journalPath + '.lock');
    const rows = reportResults(selected, results);
    const report = { scope: 'Focused staging API evidence only. No full acceptance pass is inferred.', projectRef, startedAt, finishedAt: new Date().toISOString(), runId: journal?.data.runId, selected,
      results: rows, controls: results.filter(r => !plan.cases.some(c => c.id === r.id)),
      acceptanceGroups: [...new Set(plan.cases.flatMap(c => c.groups))].sort().map(id => ({ id, status: 'UNVERIFIED' })) };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    const md = ['# IGotU remaining staging checks', '', 'Scope: focused API checks; all full acceptance groups remain unverified.', '', '| Case | Result | Code / coverage |', '|---|---|---|', ...rows.map(r => `| ${r.id} | ${r.status} | ${r.code || r.coverage || ''} |`), ...report.controls.map(r => `| ${r.id} | ${r.status} | ${r.code} |`), '', 'See paired JSON for assertions and remaining browser/operator checks. No credentials or response bodies are included.', ''].join('\n');
    fs.writeFileSync(reportPath.replace(/\.json$/, '.md'), md, { mode: 0o600 });
    console.log('Report: ' + reportPath);
  }
  process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : results.some(r => r.status === 'BLOCKED') ? 2 : 3;
}
module.exports = { main, run, checks, selection, stateFile, reportResults, message, negativeInsert };
