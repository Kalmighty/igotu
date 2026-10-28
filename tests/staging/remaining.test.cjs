/* In-memory transport and temporary local journal only. No staging connection. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeRuntime, validate } = require('./runtime.cjs');
const { run, stateFile, selection, reportResults } = require('./remaining.cjs');
const ref = 'oqalpauljjhytnrpzcqp';
const names = ['clientA','providerA','clientB'];
const config = { syntheticOnly: true, projectRef: ref, url: `https://${ref}.supabase.co`, publishableKey: 'sb_publishable_synthetic_public_fixture', mailDomain: 'igotu.test', date: '2030-01-07', accounts: Object.fromEntries(names.map((name,i) => [name, { synthetic: true, role: name === 'providerA' ? 'provider' : 'client', id: `00000000-0000-4000-8000-${String(i).padStart(12,'0')}` }])) };
const approval = { syntheticOnly: true, projectRef: ref, expiresAt: new Date(Date.now()+3600000).toISOString(), network: true, syntheticWrites: true, migrationsReviewed: true, migrationsInstalled: true, privateSchemaReviewed: true, testAccountsReviewed: true, remainingTests: true };
const secrets = Object.fromEntries(names.map(n => [n,{ email: n+'@igotu.test', password: 'SYNTHETICpassword123!' }]));
const options = { remaining: true, actors: names };
const id = n => config.accounts[n].id;
function fixture({ lost = false, brokenDenial = false, wrongRead = false, missingWrite = false } = {}) {
  const users = names.map(n => ({ ...config.accounts[n], status: 'active', profile_completed: true, identity_verified: true }));
  const service = { id: 'synthetic-row', request_id: 'SR0001', client_id: id('clientA'), selected_provider_id: id('providerA'), status: 'completed' };
  const payment = [{ id: 'synthetic-payment', request_id: 'SR0001', amount: 100, payment_method: 'Cash' }];
  const reviews = [id('clientA'),id('providerA')].map((reviewer_id,i) => ({ id: 'review-'+i, request_id: 'SR0001', reviewer_id, rating: 5 }));
  const messages = [], notifications = []; let calls=0, inserts=0, lostOnce=false;
  const response = (status,data) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) });
  const denied = () => response(brokenDenial ? 500 : 403, { code: brokenDenial ? 'XX000' : '42501' });
  const transport = async (raw, opts) => {
    calls++;
    const u = new URL(raw), method = opts.method, body = opts.body ? JSON.parse(opts.body) : {};
    assert.equal(u.origin, config.url); assert.equal(opts.redirect, 'error');
    if (u.pathname === '/auth/v1/token') {
      const name = body.email.split('@')[0];
      return response(200,{ access_token: name, user: { id: id(name) } });
    }
    const name = opts.headers.Authorization?.replace('Bearer ','');
    const actorId = config.accounts[name]?.id;
    if (opts.headers['Accept-Profile'] || opts.headers['Content-Profile']) return response(406,{ code: 'PGRST106' });
    if (u.pathname.endsWith('/rpc/igotu_backend_contract')) return response(200,{ version: '20261026.1', notifications: 'database' });
    if (u.pathname.endsWith('/rpc/provider_service_requests')) return name === 'providerA' ? response(200,[service]) : denied();
    const table = u.pathname.split('/').at(-1);
    const filter = rows => rows.filter(r => [...u.searchParams].every(([k,v]) => !v.startsWith('eq.') || String(r[k]) === v.slice(3)));
    if (table === 'users') return actorId ? response(200,filter(users.filter(r => r.id === actorId))) : denied();
    if (table === 'service_requests') return response(200, name === 'clientA' ? filter([service]) : []);
    if (table === 'payment_records') return response(200,payment);
    if (table === 'service_reviews') return response(200,reviews);
    if (table === 'notifications') return method === 'GET' ? response(200,filter(notifications.filter(n => n.user_id === actorId))) : denied();
    if (table === 'internal_messages') {
      if (method === 'GET') return response(200,filter(messages.filter(r => [r.sender_id,r.receiver_id].includes(actorId))));
      if (method === 'POST') {
        inserts++;
        if (body.sender_id !== actorId || !((actorId === id('clientA') && body.receiver_id === id('providerA')) || (actorId === id('providerA') && body.receiver_id === id('clientA')))) return denied();
        const saved = { ...body, is_read: wrongRead ? true : false };
        if (!missingWrite) { messages.push(saved); notifications.push({ id: body.id, user_id: body.receiver_id, event_key: 'internal_messages:'+body.id }); }
        if (lost && !lostOnce) { lostOnce=true; throw Error('SYNTHETIC LOST RESPONSE'); }
        return response(201,[saved]);
      }
      if (method === 'PATCH') {
        if (Object.keys(body).some(k => k !== 'is_read')) return denied();
        const rows = filter(messages).filter(r => r.receiver_id === actorId);
        rows.forEach(r => Object.assign(r,body)); return response(200,rows);
      }
    }
    return response(404,{ code: 'PGRST202' });
  };
  return { x: makeRuntime(config, approval, secrets, transport, options), messages, notifications, counts: () => ({ calls,inserts }) };
}
(async () => {
  assert.deepEqual(selection([]),['ST-13']);
  assert.throws(() => selection(['--only','ST-99']), /UNKNOWN_CASE/);
  assert.equal(validate(config,approval,secrets,options), true, 'Remaining scope needs neither signups nor all eleven passwords');
  assert.throws(() => validate({ ...config, projectRef: 'abcdefghijklmnopqrst', url: 'https://abcdefghijklmnopqrst.supabase.co' },{ ...approval, projectRef: 'abcdefghijklmnopqrst' },secrets,options));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'igotu-remaining-'));
  try {
    const f = fixture(), j = stateFile(path.join(dir,'state.json'),'binding');
    assert.equal(f.counts().calls,0);
    let result = await run(f.x,j,['ST-13']);
    assert.equal(result[0].status,'PASS', JSON.stringify(result));
    assert.equal(f.messages.length,2); assert.equal(f.notifications.length,2);
    const before = f.counts().inserts;
    result = await run(f.x,stateFile(path.join(dir,'state.json'),'binding'),['ST-13']);
    assert.equal(result[0].status,'PASS',JSON.stringify(result));
    assert.equal(f.counts().inserts,before,'Resuming verified messages/probes must not repeat inserts');
    assert.throws(() => stateFile(path.join(dir,'state.json'),'different'),/JOURNAL_FIXTURE_MISMATCH/);
    const rows=reportResults(['ST-13'],result);
    assert.equal(rows.length,20); assert.equal(rows.filter(r=>r.status==='SKIPPED').length,19);
    assert(rows.every(r=>r.acceptanceStatus==='UNVERIFIED'));
    const lost = fixture({ lost:true }), lj = stateFile(path.join(dir,'lost.json'),'lost');
    result = await run(lost.x,lj,['ST-13']); assert.equal(result[0].status,'BLOCKED');
    assert.equal(lost.messages.length,1);
    result = await run(lost.x,lj,['ST-13']); assert.equal(result[0].status,'PASS',JSON.stringify(result));
    assert.equal(lost.messages.length,2,'Lost committed response is reconciled by stable ID');
    const missing = fixture({ lost:true, missingWrite:true }), mj=stateFile(path.join(dir,'missing.json'),'missing');
    await run(missing.x,mj,['ST-13']); const count=missing.counts().inserts;
    result=await run(missing.x,mj,['ST-13']); assert.equal(result[0].status,'BLOCKED');
    assert.equal(missing.counts().inserts,count,'Ambiguous absent mutation is never blindly retried');
    for (const settings of [{ brokenDenial:true },{ wrongRead:true },{ missingWrite:true }]) {
      const bad=fixture(settings), bj=stateFile(path.join(dir,cryptoId()+'.json'),'bad');
      result=await run(bad.x,bj,['ST-13']); assert.equal(result[0].status,'FAIL',JSON.stringify(result));
    }
    const gate=fixture();
    await assert.rejects(gate.x.request(null,'https://giqtnbwyktbnbhdvjraa.supabase.co/rest/v1/users'));
    assert.equal(gate.counts().calls,0);
    const mutableConfig=structuredClone(config), expiring=structuredClone(approval); let attempts=0;
    const guarded=makeRuntime(mutableConfig,expiring,secrets,async()=>{attempts++;throw Error();},options);
    mutableConfig.projectRef='abcdefghijklmnopqrst';
    await assert.rejects(guarded.request(null,'/rest/v1/users')); assert.equal(attempts,0);
    const expired=makeRuntime(config,expiring,secrets,async()=>{attempts++;throw Error();},options);
    expiring.expiresAt='2000-01-01'; await assert.rejects(expired.request(null,'/rest/v1/users')); assert.equal(attempts,0);
    const foreignToken = ['header',Buffer.from(JSON.stringify({ iss:'https://example.invalid/auth/v1',sub:id('clientA'),role:'authenticated',exp:Date.now()/1000+600 })).toString('base64url'),'signature'].join('.');
    const jwtRuntime=makeRuntime(config,approval,{ ...secrets, clientA:{ accessToken:foreignToken } },async()=>{attempts++;throw Error();},options);
    await assert.rejects(jwtRuntime.actor('clientA'),/STAGING_JWT_BINDING_REQUIRED/); assert.equal(attempts,0);
    console.log('PASS OFFLINE: two-way ST-13, read/notification/authorization assertions, stable resume, lost-response reconciliation, absent-write stop, false-denial rejection, exact-project/expiry/JWT guards, 20-case reporting. No staging tests executed.');
  } finally { fs.rmSync(dir,{ recursive:true, force:true }); }
})().catch(e => { console.error(e); process.exitCode=1; });
function cryptoId() { return require('node:crypto').randomUUID(); }
