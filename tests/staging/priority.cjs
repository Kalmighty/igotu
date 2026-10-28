/* Consolidated continuation. Default plan is offline; never performs Admin writes. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { check, makeRuntime, validate } = require('./runtime.cjs');
const { active, getOne, protectedSnapshot, createFixture, block, checks, stateFile, supported, gaps } = require('./remaining.cjs');
const acceptance = require('./acceptance-plan.json');
const PRIORITIES = ['ST-05','ST-08','ST-10','ST-12','ST-19'];
const COMPLETED = ['ST-06','ST-07','ST-13','ST-17'];
const SCENARIOS = ['exact','near','far','start','wrongCategory','wrongSpecialization','beforeHours','endExclusive'];
function selected(args) {
  const i = args.indexOf('--only');
  const ids = i < 0 ? PRIORITIES : (args[i+1] || '').split(',');
  check(ids.length && ids.every(id => PRIORITIES.includes(id)) && new Set(ids).size === ids.length, 'PRIORITY_CASE_SELECTION_INVALID');
  return ids;
}
function mode(args) {
  const modes = ['--plan','--inspect','--prepare','--run'].filter(m => args.includes(m));
  check(modes.length <= 1, 'ONE_PRIORITY_MODE_REQUIRED');
  return modes[0] || '--plan';
}
function guardRuntime(x) {
  const rpc = x.rpc, table = x.table, request = x.request;
  const readers = ['igotu_backend_contract','provider_service_requests','recommended_provider_candidates','payment_proof_reference'];
  const writers = ['create_service_request','client_select_provider','provider_confirm_request','provider_start_request','client_complete_request','client_cancel_request'];
  x.rpc = (a, name, args = {}) => {
    check(readers.includes(name) || writers.includes(name) || (name === 'save_provider_profile' && a.name === 'providerB'), 'PRIORITY_RPC_OUTSIDE_SCOPE');
    if (writers.includes(name)) check(args.p_request_id !== 'SR0001', 'PROTECTED_SR0001_WRITE_REJECTED');
    return rpc(a,name,args);
  };
  x.table = (a,name,query = {}, method = 'GET',body) => {
    if (method !== 'GET') check(name === 'payment_records' && method === 'POST' && body?.request_id && body.request_id !== 'SR0001', 'PRIORITY_TABLE_WRITE_OUTSIDE_SCOPE');
    return table(a,name,query,method,body);
  };
  x.request = (a,resource,options = {}) => {
    const method = options.method || 'GET';
    check(resource.startsWith('/storage/v1/'), 'PRIORITY_RAW_REQUEST_OUTSIDE_SCOPE');
    if (method !== 'GET') check(method === 'POST' && (resource.startsWith('/storage/v1/object/sign/payment-proofs/') || resource.startsWith('/storage/v1/object/payment-proofs/') || resource === '/storage/v1/object/list/payment-proofs'), 'PRIORITY_STORAGE_WRITE_OUTSIDE_SCOPE');
    return request(a,resource,options);
  };
  x.upload = () => block('USE_JOURNALED_PROOF_UPLOAD');
  return x;
}
async function protectedEvidence(x) {
  const c = await active(x,'clientA','client');
  const core = await protectedSnapshot(x,c);
  const messages = await x.success(x.table(c,'internal_messages',{ request_id:'eq.SR0001',order:'id' }));
  check(messages.length === 2 && messages.every(m => m.request_id === 'SR0001' &&
    [c.id,x.config.accounts.providerA.id].includes(m.sender_id) && [c.id,x.config.accounts.providerA.id].includes(m.receiver_id) && m.sender_id !== m.receiver_id), 'PROTECTED_MESSAGE_STATE_CHANGED');
  return crypto.createHash('sha256').update(JSON.stringify({ core,messages })).digest('hex');
}
async function verification(x,name,requireComplete = true) {
  const a = await x.actor(name);
  const own = await getOne(x,a,'users',{ id:'eq.'+a.id });
  const history = await x.success(x.table(a,'verification_requests',{ user_id:'eq.'+a.id,order:'submitted_at.desc,id.desc',limit:1 }));
  if (!(own.role === 'provider' && own.status === 'active' && own.identity_verified === true && history[0]?.status === 'approved' && history[0].age_confirmed === true && history[0].privacy_consent === true)) block('PROVIDER_B_REQUIRES_ORDINARY_IDENTITY_APPROVAL');
  if (requireComplete && own.profile_completed !== true) block('PROVIDER_B_PROFILE_INCOMPLETE_RUN_PREPARE_AFTER_APPROVAL');
  return { a,own };
}
async function providerB(x,j,prepare) {
  const { a,own } = await verification(x,'providerB',false);
  if (own.profile_completed) return;
  if (!prepare) block('PROVIDER_B_PROFILE_INCOMPLETE_RUN_PREPARE_AFTER_APPROVAL');
  const expected = x.profile(a);
  const matches = async () => {
    const current = await getOne(x,a,'users',{ id:'eq.'+a.id });
    const profile = await x.success(x.table(a,'provider_profiles',{ provider_id:'eq.'+a.id }));
    const skills = await x.success(x.table(a,'provider_skills',{ provider_id:'eq.'+a.id }));
    const specs = await x.success(x.table(a,'provider_specializations',{ provider_id:'eq.'+a.id }));
    const hours = await x.success(x.table(a,'provider_weekly_availability',{ provider_id:'eq.'+a.id }));
    return current.profile_completed && current.full_name === expected.p_full_name && current.phone === expected.p_phone && profile.length === 1 &&
      Object.entries(expected.p_profile).every(([k,v]) => typeof v === 'number' ? Number(profile[0][k]) === v : profile[0][k] === v) &&
      skills.length === 1 && skills[0].category === 'Cleaning' && specs.length === 1 && specs[0].category === 'Cleaning' && specs[0].specialization === 'Home Cleaning' &&
      hours.length === 7 && expected.p_weekly_hours.every(h => hours.some(r => Number(r.day_of_week) === h.day_of_week && r.start_time.slice(0,5) === h.start_time && r.end_time.slice(0,5) === h.end_time));
  };
  if (j.data.actions['providerB.profile']) {
    if (await matches()) return;
    block('UNCERTAIN_PROVIDER_PROFILE_WRITE_REQUIRES_RECONCILIATION');
  }
  // Preserve any existing partial profile rather than replacing it with test data.
  for (const table of ['provider_profiles','provider_skills','provider_specializations','provider_weekly_availability']) {
    const rows = await x.success(x.table(a,table,{ provider_id:'eq.'+a.id }));
    if (rows.length) block('PROVIDER_B_PARTIAL_PROFILE_REQUIRES_ORDINARY_UI_COMPLETION');
  }
  j.data.actions['providerB.profile'] = 'attempted'; j.save();
  await x.success(x.rpc(a,'save_provider_profile',expected));
  check(await matches(),'PROVIDER_PROFILE_PREPARATION_READBACK_FAILED');
  j.data.actions['providerB.profile'] = 'verified'; j.save();
}
async function prerequisite(x,id) {
  await active(x,'clientA','client'); await active(x,'providerA','provider');
  if (['ST-08','ST-19'].includes(id)) await active(x,'clientB','client');
  if (id === 'ST-05') {
    for (const name of ['pending','rejected','suspended']) {
      const a = await x.actor(name), own = await getOne(x,a,'users',{ id:'eq.'+a.id });
      if (name === 'suspended') { if (own.status !== 'suspended') block('SUSPENDED_FIXTURE_REQUIRES_SEPARATE_ADMIN_AUTHORIZATION'); }
      else {
        const history = await x.success(x.table(a,'verification_requests',{ user_id:'eq.'+a.id,order:'submitted_at.desc,id.desc',limit:1 }));
        if (own.identity_verified || history[0]?.status !== name) block(name.toUpperCase()+'_IDENTITY_FIXTURE_REQUIRED_NO_ADMIN_WRITE_PERFORMED');
      }
    }
  }
  if (['ST-12','ST-19'].includes(id)) await verification(x,'providerB');
  if (id === 'ST-10' && !(x.config.matchingControlRequestId && x.config.matchingCases?.length >= 8)) await matchingPlan(x);
}
async function transition(x,j,a,requestId,key,from,to,rpc,args = {}) {
  check(requestId !== 'SR0001','PROTECTED_SR0001_WRITE_REJECTED');
  const c = await x.actor('clientA');
  let r = await getOne(x,c,'service_requests',{ request_id:'eq.'+requestId });
  if (r.status === to) return;
  if (r.status !== from) block('FIXTURE_LIFECYCLE_DRIFT');
  if (j.data.actions[key]) block('UNCERTAIN_FIXTURE_TRANSITION_REQUIRES_RECONCILIATION');
  j.data.actions[key] = 'attempted'; j.save();
  await x.success(x.rpc(a,rpc,{ p_request_id:requestId,...args }));
  r = await getOne(x,c,'service_requests',{ request_id:'eq.'+requestId });
  check(r.status === to,'FIXTURE_TRANSITION_NOT_PERSISTED');
  j.data.actions[key] = 'verified'; j.save();
}
async function proofObject(x,c,file) {
  const [prefix,name] = file.split('/');
  check(prefix === c.id && name && file.split('/').length === 2,'PROOF_OWNER_PATH_INVALID');
  const rows = await x.success(x.request(c,'/storage/v1/object/list/payment-proofs',{ method:'POST',body:{ prefix,search:name,limit:100,offset:0 } }));
  check(Array.isArray(rows),'PROOF_LIST_RESPONSE_INVALID');
  const matches = rows.filter(r => r.name === name);
  check(matches.length <= 1,'PROOF_OBJECT_AMBIGUOUS');
  return matches.length === 1;
}
async function transfer(x,j,prepare) {
  // Existing declared transfer fixtures remain read-only.
  const existing = x.config.receiptRequestId;
  if (existing && /^SR\d+$/.test(existing) && existing !== 'SR0001' && !j.data.ids['transfer.create']) {
    const c=await active(x,'clientA','client'),p=await active(x,'providerA','provider');
    const rows=await x.success(x.table(c,'service_requests',{ request_id:'eq.'+existing }));
    if (rows.length !== 1 || rows[0].client_id !== c.id || rows[0].selected_provider_id !== p.id || rows[0].status !== 'completed') block('DECLARED_TRANSFER_FIXTURE_INVALID');
    const payments=await x.success(x.table(c,'payment_records',{ request_id:'eq.'+existing }));
    if (payments.length !== 1 || payments[0].client_id !== c.id || payments[0].provider_id !== p.id || !['Bank Transfer','QR Transfer'].includes(payments[0].payment_method) || !payments[0].proof_path?.startsWith(c.id+'/')) block('DECLARED_TRANSFER_PROOF_INVALID');
    const ref=await x.success(x.rpc(p,'payment_proof_reference',{ p_request_id:existing }));
    if (ref.length !== 1 || ref[0].proof_path !== payments[0].proof_path) block('DECLARED_TRANSFER_PROOF_OWNERSHIP_INVALID');
    return existing;
  }
  if (!prepare && !j.data.ids['transfer.create']) block('TRANSFER_FIXTURE_REQUIRES_PREPARE');
  const c = await active(x,'clientA','client'), p = await active(x,'providerA','provider');
  const details = x.details('SYNTHETIC ST-08 '+j.data.runId,x.config.date,'09:00:00');
  details.budget = 1;
  let r = prepare ? await createFixture(x,j,c,'transfer.create',details) : await getOne(x,c,'service_requests',{ client_id:'eq.'+c.id,creation_key:'eq.'+j.data.ids['transfer.create'] });
  check(r.title === details.title && r.request_id !== 'SR0001','TRANSFER_FIXTURE_DRIFT');
  const requestId = r.request_id;
  if (!prepare) {
    if (r.status !== 'completed') block('TRANSFER_FIXTURE_REQUIRES_PREPARE');
    const payments=await x.success(x.table(c,'payment_records',{ request_id:'eq.'+requestId }));
    if (payments.length !== 1) block('TRANSFER_PAYMENT_REQUIRES_PREPARE_OR_RECONCILIATION');
    return requestId;
  }
  if (r.status === 'pending') {
    const candidates = await x.success(x.rpc(c,'recommended_provider_candidates',{ p_request_id:requestId }));
    if (!candidates.some(row => row.id === p.id)) block('TRANSFER_PROVIDER_NOT_ELIGIBLE_FOR_0900_SLOT');
    await transition(x,j,c,requestId,'transfer.select','pending','provider_selected','client_select_provider',{ p_provider_id:p.id });
  }
  r = await getOne(x,c,'service_requests',{ request_id:'eq.'+requestId });
  check(r.selected_provider_id === p.id,'TRANSFER_PAIR_CHANGED');
  if (r.status === 'provider_selected') await transition(x,j,p,requestId,'transfer.confirm','provider_selected','confirmed','provider_confirm_request');
  r = await getOne(x,c,'service_requests',{ request_id:'eq.'+requestId });
  if (r.status === 'confirmed') await transition(x,j,p,requestId,'transfer.start','confirmed','in_progress','provider_start_request');
  r = await getOne(x,c,'service_requests',{ request_id:'eq.'+requestId });
  if (r.status === 'in_progress') await transition(x,j,c,requestId,'transfer.complete','in_progress','completed','client_complete_request');
  check((await getOne(x,c,'service_requests',{ request_id:'eq.'+requestId })).status === 'completed','TRANSFER_NOT_COMPLETED');
  const file = c.id+'/'+j.id('transfer.proof')+'.png';
  if (!await proofObject(x,c,file)) {
    if (j.data.actions['transfer.upload']) block('UNCERTAIN_PROOF_UPLOAD_REQUIRES_RECONCILIATION');
    j.data.actions['transfer.upload'] = 'attempted'; j.save();
    await x.success(x.request(c,'/storage/v1/object/payment-proofs/'+file,{ method:'POST',body:x.png,headers:{ 'Content-Type':'image/png','x-upsert':'false' } }));
    check(await proofObject(x,c,file),'PROOF_UPLOAD_NOT_PERSISTED');
    j.data.actions['transfer.upload'] = 'verified'; j.save();
  }
  let payments = await x.success(x.table(c,'payment_records',{ request_id:'eq.'+requestId }));
  if (!payments.length) {
    if (j.data.actions['transfer.payment']) block('UNCERTAIN_PAYMENT_WRITE_REQUIRES_RECONCILIATION');
    j.data.actions['transfer.payment'] = 'attempted'; j.save();
    await x.success(x.table(c,'payment_records',{},'POST',{ request_id:requestId,client_id:c.id,provider_id:p.id,amount:1,payment_method:'Bank Transfer',proof_path:file }));
    payments = await x.success(x.table(c,'payment_records',{ request_id:'eq.'+requestId }));
  }
  check(payments.length === 1 && payments[0].client_id === c.id && payments[0].provider_id === p.id && Number(payments[0].amount) === 1 && payments[0].payment_method === 'Bank Transfer' && payments[0].proof_path === file,'TRANSFER_PAYMENT_READBACK_FAILED');
  const ref = await x.success(x.rpc(p,'payment_proof_reference',{ p_request_id:requestId }));
  check(ref.length === 1 && ref[0].proof_path === file,'TRANSFER_PROOF_OWNERSHIP_READBACK_FAILED');
  j.data.actions['transfer.payment'] = 'verified'; j.save();
  return requestId;
}
function clock(seconds) { return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n => String(n).padStart(2,'0')).join(':'); }
function seconds(value) { return value.split(':').reduce((n,part,i) => n+Number(part)*[3600,60,1][i],0); }
async function matchingPlan(x) {
  const config = x.config.priority;
  if (config?.matchingReviewed !== true || !config.expectedProviderNames) block('REVIEW_PRIORITY_MATCHING_EXPECTATIONS_TEMPLATE');
  for (const name of SCENARIOS) if (!Array.isArray(config.expectedProviderNames[name])) block('MATCHING_EXPECTED_SET_REQUIRED');
  const p = await active(x,'providerA','provider');
  const profile = await getOne(x,p,'provider_profiles',{ provider_id:'eq.'+p.id });
  const skills = await x.success(x.table(p,'provider_skills',{ provider_id:'eq.'+p.id }));
  const specs = await x.success(x.table(p,'provider_specializations',{ provider_id:'eq.'+p.id }));
  const hours = await x.success(x.table(p,'provider_weekly_availability',{ provider_id:'eq.'+p.id }));
  const dow = new Date(x.config.date+'T12:00:00Z').getUTCDay(), hour = hours.find(h => Number(h.day_of_week) === dow);
  if (!profile.is_available || !hour || !specs.some(s => s.category === 'Cleaning' && s.specialization === 'Home Cleaning') || specs.some(s => s.category === 'Cleaning' && s.specialization === 'Office Cleaning') || skills.some(s => s.category === 'Delivery')) block('MATCHING_PROVIDER_A_BASELINE_DIFFERS_FROM_TEMPLATE');
  const start = seconds(hour.start_time), end = seconds(hour.end_time);
  if (!(start >= 60 && end > start+120 && end < 86400)) block('MATCHING_HOURS_REQUIRE_REVIEWED_BOUNDARIES');
  const lat = Number(profile.provider_lat), lng = Number(profile.provider_lng);
  check(profile.provider_lat != null && profile.provider_lng != null && Math.abs(lat) < 88 && Math.abs(lng) < 178,'MATCHING_COORDINATES_REQUIRED');
  const base = x.details('SYNTHETIC',x.config.date,clock(start+60)); base.client_lat=lat; base.client_lng=lng;
  const overrides = { exact:{},near:{ client_lat:lat+0.01 },far:{ client_lat:lat+1 },start:{ preferred_time:clock(start) },wrongCategory:{ category:'Delivery',service_type:'Parcel Delivery' },wrongSpecialization:{ service_type:'Office Cleaning' },beforeHours:{ preferred_time:clock(start-60) },endExclusive:{ preferred_time:clock(end) } };
  return SCENARIOS.map(name => {
    const expected = config.expectedProviderNames[name];
    check(expected.every(n => x.config.accounts[n]?.synthetic === true && x.config.accounts[n].role === 'provider'),'EXPECTED_PROVIDER_ALIAS_INVALID');
    return { name,details:{ ...base,...overrides[name] },expectedProviderIds:expected.map(n => x.config.accounts[n].id),distanceKm:{ exact:0,near:1.1119492664,far:111.19492664 }[name] };
  });
}
async function matching(x,j,prepare) {
  if (x.config.matchingControlRequestId && x.config.matchingCases?.length >= 8) {
    check(x.config.matchingCases.every(c => c.synthetic === true && c.requestId !== 'SR0001' && Array.isArray(c.expectedProviderIds)), 'EXISTING_MATCHING_FIXTURE_INVALID');
    return x.config.matchingCases;
  }
  const scenarios = await matchingPlan(x), c = await active(x,'clientA','client');
  const digest=crypto.createHash('sha256').update(JSON.stringify(scenarios)).digest('hex');
  if (j.data.matchingDigest) check(j.data.matchingDigest === digest,'MATCHING_EXPECTATIONS_OR_PROFILE_CHANGED');
  else if (prepare) {j.data.matchingDigest=digest;j.save();}
  if (!prepare && scenarios.some(s => !j.data.ids['matching.'+s.name])) block('MATCHING_FIXTURES_REQUIRE_PREPARE');
  const cases = [];
  for (const scenario of scenarios) {
    const details = { ...scenario.details,title:'SYNTHETIC ST-10 '+scenario.name+' '+j.data.runId };
    if (!prepare && !j.data.ids['matching.'+scenario.name]) block('MATCHING_FIXTURES_REQUIRE_PREPARE');
    // createFixture is used in prepare only; run performs strict read-only lookup.
    const key = 'matching.'+scenario.name;
    const r = prepare ? await createFixture(x,j,c,key,details) : await getOne(x,c,'service_requests',{ client_id:'eq.'+c.id,creation_key:'eq.'+j.data.ids[key] });
    check(r.status === 'pending' && r.selected_provider_id === null && r.title === details.title && r.preferred_date === details.preferred_date,'MATCHING_FIXTURE_DRIFT');
    for (const [field,value] of Object.entries(details)) check(typeof value === 'number' ? Number(r[field]) === value : String(r[field]).slice(0,field==='preferred_time'?8:undefined) === String(value), 'MATCHING_FIXTURE_DETAILS_CHANGED');
    cases.push({ synthetic:true,requestId:r.request_id,expectedProviderIds:scenario.expectedProviderIds,nearestFirst:true,name:scenario.name,distanceKm:scenario.distanceKm });
  }
  x.config.matchingControlRequestId = cases[0].requestId;
  x.config.matchingCases = cases;
  return cases;
}
async function executeCase(x,j,id,operation) {
  if (operation === '--prepare' && ['ST-12','ST-19'].includes(id)) await providerB(x,j,true);
  await prerequisite(x,id);
  if (id === 'ST-08') {
    // Run is read-only for proof/lifecycle preparation; a missing fixture blocks.
    x.config.receiptRequestId = await transfer(x,j,operation === '--prepare');
    if (operation === '--run') return checks[id](x,j);
  } else if (id === 'ST-10') {
    const cases = await matching(x,j,operation === '--prepare');
    if (operation === '--run') {
      const result = await checks[id](x,j);
      for (const scenario of cases.filter(s => s.distanceKm !== undefined && s.expectedProviderIds.includes(x.config.accounts.providerA.id))) {
        const rows = await x.success(x.rpc(await x.actor('clientA'),'recommended_provider_candidates',{ p_request_id:scenario.requestId }));
        const a = rows.find(r => r.id === x.config.accounts.providerA.id);
        check(a && a.distance_km !== null && Math.abs(Number(a.distance_km)-scenario.distanceKm) < 0.01,'MATCHING_DISTANCE_VALUE_DIFFERENT');
      }
      return result;
    }
  } else if (operation === '--prepare' && id === 'ST-12') {
    const c = await x.actor('clientA');
    const r = await createFixture(x,j,c,'decline.create',x.details('SYNTHETIC ST-12 '+j.data.runId,x.config.date,'12:00:00'));
    check(r.status === 'pending' && r.selected_provider_id === null,'DECLINE_PREPARATION_NOT_PRISTINE');
    const rows = await x.success(x.rpc(c,'recommended_provider_candidates',{ p_request_id:r.request_id }));
    if (!['providerA','providerB'].every(n => rows.some(row => row.id === x.config.accounts[n].id))) block('TWO_ELIGIBLE_APPROVED_PROVIDERS_REQUIRED');
  } else if (operation === '--prepare' && id === 'ST-19') {
    for (let i=0;i<20;i++) {
      const when=new Date(x.config.date+'T12:00:00Z');when.setUTCDate(when.getUTCDate()+i+1);
      for (const [name,suffix,label] of [['clientA','a','A'],['clientB','b','B']]) {
        const a=await x.actor(name),r=await createFixture(x,j,a,'race.'+i+'.'+suffix,x.details('SYNTHETIC ST-19 '+label+' '+j.data.runId+' '+i,when.toISOString().slice(0,10)));
        check(r.status === 'pending' && r.selected_provider_id === null,'RACE_PREPARATION_NOT_PRISTINE');
        const rows=await x.success(x.rpc(a,'recommended_provider_candidates',{ p_request_id:r.request_id }));
        if (!rows.some(row=>row.id===x.config.accounts.providerB.id)) block('RACE_PROVIDER_NOT_ELIGIBLE');
      }
    }
  } else if (operation === '--run') {
    x.config.remaining = { ...x.config.remaining,decline:{ synthetic:true,create:true },concurrency:true };
    return checks[id](x,j);
  }
  return [];
}
function reportRows(results,ids = PRIORITIES) {
  return acceptance.cases.map(c => ({ id:c.id,name:c.name,fullAcceptance:'UNVERIFIED',remainingAssertions:gaps[c.id] || [c.procedure_and_assertions],
    priorFocusedLive:COMPLETED.includes(c.id) ? { status:'PASS',provenance:'OWNER_REPORTED',reexecuted:false } : undefined,
    ...(results.find(r => r.id === c.id) || { status:ids.includes(c.id)?'BLOCKED':'SKIPPED',code:COMPLETED.includes(c.id) ? 'PRIOR_LIVE_PASS_NOT_REPEATED' : ids.includes(c.id)?'STOPPED_BEFORE_CASE_EXECUTION':'NOT_SELECTED' }) }));
}
async function inspectCase(x,j,id) {
  await prerequisite(x,id);
  if (id === "ST-08") {
    const declared = x.config.receiptRequestId, c=await x.actor('clientA');
    const query = declared && /^SR\d+$/.test(declared) && declared !== 'SR0001' ? { request_id:'eq.'+declared } : j.data.ids['transfer.create'] ? { creation_key:'eq.'+j.data.ids['transfer.create'] } : null;
    if (!query) block('TRANSFER_FIXTURE_REQUIRES_PREPARE');
    const rows=await x.success(x.table(c,'service_requests',query));
    if (rows.length !== 1 || rows[0].request_id === 'SR0001' || rows[0].client_id !== c.id || rows[0].selected_provider_id !== x.config.accounts.providerA.id || rows[0].status !== 'completed') block('TRANSFER_FIXTURE_REQUIRES_PREPARE');
    const payment=await x.success(x.table(c,'payment_records',{ request_id:'eq.'+rows[0].request_id }));
    if (payment.length !== 1 || !['Bank Transfer','QR Transfer'].includes(payment[0].payment_method) || !payment[0].proof_path?.startsWith(c.id+'/')) block('TRANSFER_PROOF_FIXTURE_REQUIRES_PREPARE');
  }
  if (id === "ST-10" && !(x.config.matchingControlRequestId && x.config.matchingCases?.length >= 8) && SCENARIOS.some(name => !j.data.ids["matching."+name])) block("MATCHING_FIXTURES_REQUIRE_PREPARE");
  if (id === "ST-12" && !j.data.ids["decline.create"]) block("DECLINE_FIXTURE_REQUIRES_PREPARE");
  if (id === "ST-19" && !j.data.ids["race.0.a"]) block("RACE_FIXTURES_REQUIRE_PREPARE");
}
async function main(args, transport = fetch) {
  const operation=mode(args), ids=selected(args);
  if (operation === '--plan') {
    console.log('OFFLINE PLAN: '+ids.join(', ')+'. Prior live ST-06/07/13/17 excluded. Inspect -> Prepare -> Run. No credentials read or network used.'); return;
  }
  const arg = (name,fallback) => { const i=args.indexOf(name);return i<0?fallback:args[i+1]; };
  const privateDir = arg('--private-dir');check(privateDir,'PRIVATE_DIRECTORY_REQUIRED');
  const journalPath=path.resolve(arg('--state',path.join(privateDir,'priority-state.json')));
  const output=path.resolve(privateDir,'priority-reports');fs.mkdirSync(output,{ recursive:true });
  const startedAt=new Date().toISOString(), results=[];let locked=false,j;
  try {
    const files=['--config',path.join(privateDir,'config.json'),'--approval',path.join(privateDir,'approval.json'),'--secrets',path.join(privateDir,'secrets.json')];
    const bundle=require('./config.cjs').load(files,{ remaining:true,actors:['clientA','providerA'] });
    const settings=path.join(privateDir,'priority.json');
    if (fs.existsSync(settings)) {
      let parsed;try {parsed=JSON.parse(fs.readFileSync(settings,'utf8'));} catch {block('LOCAL_PRIORITY_SETTINGS_INVALID');}
      bundle.config.priority=parsed;
    }
    fs.closeSync(fs.openSync(journalPath+'.lock','wx',0o600));locked=true;
    const binding=crypto.createHash('sha256').update(JSON.stringify({ projectRef:bundle.config.projectRef,accounts:bundle.config.accounts,date:bundle.config.date,receiptRequestId:bundle.config.receiptRequestId })).digest('hex');
    j=stateFile(journalPath,binding);
    const make = actors => { const options={ remaining:true,actors };try {validate(bundle.config,bundle.approval,bundle.secrets,options);} catch(e) {e.blocked=true;throw e;}return guardRuntime(makeRuntime(structuredClone(bundle.config),bundle.approval,bundle.secrets,transport,options)); };
    const baseline=make(['clientA','providerA']);
    const contract=await baseline.success(baseline.rpc(await baseline.actor('clientA'),'igotu_backend_contract'));
    check(contract?.version==='20261026.1' && contract.notifications==='database','PHASE4_BACKEND_CONTRACT_REQUIRED');
    const before=await protectedEvidence(baseline);
    if (j.data.priorityProtectedDigest) check(j.data.priorityProtectedDigest===before,'PROTECTED_EVIDENCE_CHANGED_SINCE_PRIORITY_RUN');
    else {j.data.priorityProtectedDigest=before;j.save();}
    for (const id of ids) {
      try {
        // A blocked independent case does not prevent other ready cases.
        const x=make([...new Set(['clientA','providerA',...supported[id]])]);
        if (id === 'ST-10' && j.data.matchingDigest) check(crypto.createHash('sha256').update(JSON.stringify(await matchingPlan(x))).digest('hex') === j.data.matchingDigest,'MATCHING_EXPECTATIONS_OR_PROFILE_CHANGED');
        if (operation === '--inspect') await inspectCase(x,j,id);
        else if (j.data.checks['priority.pass.'+id]) { results.push({ id,status:'SKIPPED',code:'VERIFIED_PRIORITY_PASS_NOT_REPEATED' });console.log(id+' SKIPPED VERIFIED_PRIORITY_PASS_NOT_REPEATED');continue; }
        else {
          const assertions=await executeCase(x,j,id,operation);
          results.push({ id,status:operation==='--run'?'PASS':'SKIPPED',fixtureStatus:operation==='--prepare'?'PREPARED':'READY',assertions,code:operation==='--prepare'?'FIXTURES_PREPARED_TEST_NOT_EXECUTED':undefined });
        }
        if (operation==='--inspect') results.push({ id,status:'SKIPPED',fixtureStatus:'READY',code:'PREREQUISITES_ONLY_NOT_TEST_EXECUTION' });
      } catch (e) {
        const blocked=e.blocked || ['SYNTHETIC_ACCOUNT_REQUIRED','TEST_CREDENTIALS_REQUIRED','TRANSPORT_FAILED','STAGING_JWT_BINDING_REQUIRED','LOGIN_CONTROL_FAILED'].includes(e.safeCode);
        results.push({ id,status:blocked?'BLOCKED':'FAIL',code:e.safeCode || 'PRIORITY_CHECK_FAILED' });
      }
      const last=results.at(-1);console.log(last.id+' '+last.status+(last.fixtureStatus?' '+last.fixtureStatus:'')+(last.code?' '+last.code:''));
      check(await protectedEvidence(baseline)===before,'PROTECTED_SR0001_CHANGED');
      if (last.status==='PASS') {j.data.checks['priority.pass.'+id]=true;j.save();}
      if (last.status==='FAIL') break;
    }
    check(await protectedEvidence(baseline)===before,'PROTECTED_SR0001_CHANGED');
  } catch (e) { results.push({ id:'CONTROL',status:e.safeCode?.startsWith('PROTECTED_')?'FAIL':'BLOCKED',code:e.code==='EEXIST'?'RUN_LOCK_EXISTS':e.safeCode || 'LOCAL_PRIORITY_CONFIGURATION_INVALID' });console.log('CONTROL '+results.at(-1).status+' '+results.at(-1).code); }
  finally {
    if(locked)fs.unlinkSync(journalPath+'.lock');
    const report={ operation,evidenceMode:transport===fetch?'STAGING_HTTP':'OFFLINE_MOCK',newFocusedLivePasses:transport===fetch?results.filter(r=>r.status==='PASS').length:0,projectRef:'oqalpauljjhytnrpzcqp',startedAt,finishedAt:new Date().toISOString(),runId:j?.data.runId,scope:'Only STAGING_HTTP + --run + PASS is focused live evidence. OFFLINE_MOCK is offline only. Prepare/Inspect are not test passes.',results:reportRows(results,ids),fixtures:Object.values(j?.data.fixtures || {}),controls:results.filter(r=>r.id==='CONTROL'),acceptanceGroups:[...new Set(acceptance.cases.flatMap(c=>c.groups))].sort().map(id=>({ id,status:'UNVERIFIED' })) };
    const file=path.join(output,startedAt.replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{ mode:0o600 });
    fs.writeFileSync(file.replace(/\.json$/,'.md'),['# IGotU priority execution','',report.scope,'','| Case | Current result | Previous focused live | Full acceptance |','|---|---|---|---|',...report.results.map(r=>`| ${r.id} | ${r.status}${r.code?' '+r.code:''} | ${r.priorFocusedLive?'PASS (owner reported, not repeated)':''} | UNVERIFIED |`),'',...report.controls.map(r=>r.status+' '+r.code)].join('\n')+'\n',{ mode:0o600 });
    console.log('Report: '+file);
  }
  process.exitCode=results.some(r=>r.status==='FAIL')?1:results.some(r=>r.status==='BLOCKED')?2:operation==='--run'?3:0;
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error('BLOCKED '+(e.safeCode || 'LOCAL_PRIORITY_CONFIGURATION_INVALID'));process.exitCode=2;});
module.exports={ inspectCase,main,selected,mode,guardRuntime,protectedEvidence,providerB,prerequisite,transfer,matchingPlan,matching,executeCase,reportRows,SCENARIOS,PRIORITIES };
