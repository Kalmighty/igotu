/* Local files only. Synthetic public configuration, no Supabase connection. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const folder=fs.mkdtempSync(path.join(root,'work','staging-config-'));
const configFile=path.join(folder,'config.json');
const name='fixture-'+Date.now();
const client=path.join(root,'igotu_v2/js/supabaseClient.js');
const before=fs.readFileSync(client,'utf8');
const config={projectRef:'abcdefghijklmnopqrst',url:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_synthetic_fixture_only'};
function run(value,out=name){fs.writeFileSync(configFile,JSON.stringify(value));return spawnSync('node',['tools/prepare-staging-frontend.mjs',configFile,out],{cwd:root,encoding:'utf8'});}
assert.notEqual(run({...config,projectRef:'giqtnbwyktbnbhdvjraa'}).status,0);
assert.notEqual(run({...config,url:'https://example.invalid'}).status,0);
assert.notEqual(run({...config,publishableKey:'sb_secret_not_allowed'}).status,0);
assert.equal(run(config).status,0);
const output=path.join(root,'work/staging',name);
assert.ok(fs.readFileSync(path.join(output,'js/supabaseClient.js'),'utf8').includes(config.url));
assert.equal(fs.existsSync(path.join(output,'database')),false);
assert.equal(fs.readFileSync(client,'utf8'),before);
assert.notEqual(run(config).status,0,'Must preserve an existing artifact');
console.log('PASS local staging artifact: production/foreign origin/secret key rejected, existing work preserved, no source edits, database drafts excluded. No network calls.');
