// Local artifact preparation only. No network, SQL, provisioning or deployment.
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [configFile, outputName]=process.argv.slice(2);
if(!configFile || !/^[a-zA-Z0-9_-]+$/.test(outputName || '')) throw new Error('Usage: node tools/prepare-staging-frontend.mjs <local-config.json> <fresh-output-name>');
const config=JSON.parse(await readFile(configFile,'utf8'));
if(!/^[a-z]{20}$/.test(config.projectRef || '') || config.projectRef==='giqtnbwyktbnbhdvjraa') throw new Error('An isolated staging project reference is required; production is excluded.');
if(config.url!==`https://${config.projectRef}.supabase.co`) throw new Error('Exact staging origin required.');
if(!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(config.publishableKey || '')) throw new Error('Use only a staging publishable key; secret/service-role keys and tokens are not accepted.');
const output=path.join(root,'work','staging',outputName);
try {await access(output);throw new Error('Output already exists; choose a fresh name to preserve existing work.');} catch(e) {if(e.code!=='ENOENT')throw e;}
const source=path.join(root,'igotu_v2');
let client=await readFile(path.join(source,'js','supabaseClient.js'),'utf8');
if(!client.includes('const SUPABASE_URL = "https://giqtnbwyktbnbhdvjraa.supabase.co";')) throw new Error('Source configuration changed; review the builder before continuing.');
client=client.replace(/const SUPABASE_URL = "[^"]+";/,`const SUPABASE_URL = ${JSON.stringify(config.url)};`).replace(/const SUPABASE_PUBLISHABLE_KEY =\s*"[^"]+";/,`const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(config.publishableKey)};`);
await mkdir(path.dirname(output),{recursive:true});
await cp(source,output,{recursive:true,errorOnExist:true,force:false,filter:p=>!path.relative(source,p).split(path.sep).includes('database')});
await writeFile(path.join(output,'js','supabaseClient.js'),client);
await writeFile(path.join(output,'STAGING-ARTIFACT.json'),JSON.stringify({projectRef:config.projectRef,contract:'20261026.1',purpose:'Local staging artifact only; no backend installed or deployment performed'},null,2)+'\n');
console.log('Prepared local staging frontend artifact. No project connection or deployment was attempted.');
