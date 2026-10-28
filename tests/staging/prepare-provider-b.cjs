/* Windows-local private context preparation. No network unless --finish is explicit.
   Never print credentials, parsed private objects, or raw filesystem/parse errors. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { check, validate } = require('./runtime.cjs');
const REF = 'oqalpauljjhytnrpzcqp';
const PROVIDER_B = 'a488bd46-8610-449b-b601-406314453672';
const ACTORS = ['clientA','clientB','providerA','providerB'];
function outside(file, directory) {
  const relative = path.relative(directory,file);
  return relative.startsWith('..'+path.sep) || path.isAbsolute(relative);
}
function privatePath(file, frontend) {
  const resolved = fs.realpathSync(file), repo = fs.realpathSync(path.resolve(__dirname,'../..'));
  check(outside(resolved,repo),'PRIVATE_FILES_MUST_BE_OUTSIDE_REPOSITORY');
  if (frontend) {
    const root = fs.existsSync(frontend) ? fs.realpathSync(frontend) : path.resolve(frontend);
    check(outside(resolved,root),'PRIVATE_FILES_MUST_BE_OUTSIDE_FRONTEND');
  }
  return resolved;
}
function readJson(file, frontend) {
  privatePath(file,frontend);
  check(fs.statSync(file).isFile(),'LOCAL_PRIVATE_FILE_REQUIRED');
  check(process.platform === 'win32' || (fs.statSync(file).mode & 0o077) === 0,'SECRET_FILE_PERMISSIONS_REQUIRED');
  try {
    const bytes=fs.readFileSync(file);
    const text=bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8').replace(/^\uFEFF/,'');
    return JSON.parse(text);
  }
  catch { check(false,'LOCAL_PRIVATE_JSON_INVALID'); }
}
function buildContext(config, approval, bootstrap, date) {
  check(bootstrap.projectRef === REF && config.projectRef === REF && config.url === `https://${REF}.supabase.co`,'EXACT_STAGING_BINDING_REQUIRED');
  const isolated = structuredClone(config);
  isolated.accounts = Object.fromEntries(ACTORS.map(name => {
    const account = name === 'providerB' ? { synthetic:true,id:PROVIDER_B,role:'provider' } : config.accounts?.[name];
    check(account?.synthetic === true && account.role === (name.startsWith('provider')?'provider':'client'),'SYNTHETIC_ACTOR_CONFIGURATION_REQUIRED');
    return [name,account];
  }));
  isolated.date = date;
  isolated.remaining = { decline:{ synthetic:true,create:true },concurrency:true };
  for (const key of ['priority','matchingCases','matchingControlRequestId','receiptRequestId']) delete isolated[key];
  const secrets = Object.fromEntries(ACTORS.map(name => {
    const a = bootstrap.accounts?.[name];
    check(a && typeof a.email === 'string' && typeof a.password === 'string','BOOTSTRAP_ACTOR_CREDENTIALS_REQUIRED');
    if (a.id) check(a.id === isolated.accounts[name].id,'BOOTSTRAP_ACTOR_ID_MISMATCH');
    if (a.role) check(a.role === isolated.accounts[name].role,'BOOTSTRAP_ACTOR_ROLE_MISMATCH');
    return [name,{ email:a.email,password:a.password }];
  }));
  // Existing authorization is copied, never expanded or extended by this helper.
  validate(isolated,approval,secrets,{ remaining:true,actors:ACTORS });
  return { config:isolated,approval:structuredClone(approval),secrets };
}
function defaultDate(sourceDate) {
  const d = new Date(sourceDate+'T12:00:00Z');
  check(Number.isFinite(d.getTime()),'VALID_SERVICE_DATE_REQUIRED');
  d.setUTCDate(d.getUTCDate()+35); // Same weekday, separate from the old +1..+20 range.
  return d.toISOString().slice(0,10);
}
function secureDirectory(directory) {
  if (process.platform !== 'win32') { fs.chmodSync(directory,0o700);return; }
  // Set only this new context's ACL. Existing private files/ACLs are untouched.
  const command = "$ErrorActionPreference='Stop'; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false); $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule); Set-Acl -LiteralPath $env:IGOTU_PROVIDER_B_CONTEXT -AclObject $acl";
  const r = spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{
    env:{ ...process.env,IGOTU_PROVIDER_B_CONTEXT:directory },encoding:'utf8',windowsHide:true,
  });
  check(!r.error && r.status === 0,'PRIVATE_CONTEXT_ACL_SETUP_FAILED');
}
function writePrivate(file, data, replace = false) {
  if (fs.existsSync(file)) check(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(),'PRIVATE_OUTPUT_LINK_REJECTED');
  const temporary = file+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(data,null,2)+'\n',{ flag:'wx',mode:0o600 });
  if (!replace) check(!fs.existsSync(file),'PRIVATE_OUTPUT_ALREADY_EXISTS');
  fs.renameSync(temporary,file);
}
function prepare(source, explicitDate) {
  source = fs.realpathSync(source);privatePath(source);
  const config = readJson(path.join(source,'config.json'));
  const approval = readJson(path.join(source,'approval.json'),config.frontendDirectory);
  const bootstrap = readJson(path.join(source,'synthetic-bootstrap.json'),config.frontendDirectory);
  const output = path.join(source,'provider-b-st12-st19');
  let manifest;
  if (fs.existsSync(output)) {
    check(fs.lstatSync(output).isDirectory() && !fs.lstatSync(output).isSymbolicLink(),'PRIVATE_CONTEXT_LINK_REJECTED');
    privatePath(output,config.frontendDirectory);
    check(fs.existsSync(path.join(output,'context.json')),'INCOMPLETE_CONTEXT_REQUIRES_LOCAL_REVIEW');
    manifest = readJson(path.join(output,'context.json'),config.frontendDirectory);
    check(manifest.version === 1 && manifest.projectRef === REF && manifest.providerB === PROVIDER_B,'PRIVATE_CONTEXT_SCOPE_MISMATCH');
  }
  const date = explicitDate || manifest?.date || defaultDate(config.date);
  const bundle = buildContext(config,approval,bootstrap,date);
  const configDigest = crypto.createHash('sha256').update(JSON.stringify(bundle.config)).digest('hex');
  if (manifest) check(manifest.configDigest === configDigest,'ISOLATED_CONFIG_BINDING_CHANGED_PRESERVE_JOURNAL');
  else check(date >= new Date().toISOString().slice(0,10),'FUTURE_FIXTURE_DATE_REQUIRED');
  if (!manifest) fs.mkdirSync(output,{ mode:0o700 });
  privatePath(output,config.frontendDirectory);secureDirectory(output);
  const lock = path.join(output,'prepare.lock');
  let locked = false;
  try {
    fs.closeSync(fs.openSync(lock,'wx',0o600));locked=true;
    if (manifest) {
      const previous = readJson(path.join(output,'config.json'),config.frontendDirectory);
      check(crypto.createHash('sha256').update(JSON.stringify(previous)).digest('hex') === configDigest,'ISOLATED_CONFIG_CHANGED_PRESERVE_JOURNAL');
    } else writePrivate(path.join(output,'config.json'),bundle.config);
    // Refresh only the isolated copies, allowing normal credential/approval renewal.
    writePrivate(path.join(output,'approval.json'),bundle.approval,Boolean(manifest));
    writePrivate(path.join(output,'secrets.json'),bundle.secrets,Boolean(manifest));
    if (!manifest) writePrivate(path.join(output,'context.json'),{ version:1,projectRef:REF,providerB:PROVIDER_B,date,configDigest });
  } finally { if (locked) fs.unlinkSync(lock); }
  return { output,journal:path.join(output,'st12-st19-state.json') };
}
async function finish(context, priority = require('./priority.cjs').main) {
  for (const [operation,id] of [['--prepare','ST-12'],['--run','ST-12'],['--prepare','ST-19'],['--run','ST-19']]) {
    await priority([operation,'--only',id,'--private-dir',context.output,'--state',context.journal]);
    if (operation === '--prepare' ? process.exitCode !== 0 : process.exitCode !== 3) return;
    if (id === 'ST-12' && operation === '--run') {
      const journal = JSON.parse(fs.readFileSync(context.journal,'utf8'));
      check(journal.checks?.['priority.pass.ST-12'] === true,'ST12_FOCUSED_PASS_REQUIRED_BEFORE_ST19');
    }
  }
}
async function main(args) {
  const i = args.indexOf('--private-dir');
  check(i >= 0 && args[i+1],'EXISTING_PRIVATE_DIRECTORY_REQUIRED');
  const dateIndex = args.indexOf('--date');
  if (dateIndex >= 0) check(args[dateIndex+1],'VALID_SERVICE_DATE_REQUIRED');
  const context = prepare(args[i+1],dateIndex >= 0 ? args[dateIndex+1] : undefined);
  console.log('READY isolated Provider B context. Existing configuration, journals and reports preserved.');
  if (args.includes('--finish')) await finish(context);
}
if (require.main === module) main(process.argv.slice(2)).catch(e => {
  console.error('BLOCKED '+(e.code === 'EEXIST' ? 'PRIVATE_CONTEXT_LOCK_OR_TEMP_EXISTS' : e.safeCode || 'LOCAL_PROVIDER_B_PREPARATION_FAILED'));
  process.exitCode=2;
});
module.exports = { main,prepare,finish,buildContext,defaultDate,REF,PROVIDER_B };
