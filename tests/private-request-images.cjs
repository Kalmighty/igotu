/* Component + real-page synthetic checks. No PostgreSQL/Storage execution or live data. */
const {chromium}=require('playwright');
const {install,seed,ids}=require('./system-fixture.cjs');
const {prefix}=require('./request-image-model.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/private-request-images');
fs.mkdirSync(out,{recursive:true});
const tests=[],test=(name,run)=>tests.push({name,run});
async function direct(page,id='SYN-IMAGE') {return page.evaluate(async id=>{
 const {supabase}=await import('/js/supabaseClient.js');
 const r=await supabase.rpc('request_image_reference',{p_request_id:id});
 const d=await supabase.storage.from('request-images').download(window.testPath);
 return {references:r.data.length,downloadDenied:Boolean(d.error)};
},id);}
async function open(page){await page.getByRole('button',{name:'View request image'}).click();await page.waitForFunction(()=>!document.querySelector('.request-image-view').disabled);}
for(const role of ['client','provider','admin'])test(`${role}: authorized private preview, expiry and logout`,async({page,state})=>{
 state.role=role;
 await open(page);
 assert.equal(await page.locator('.private-request-image img').count(),1);
 assert.match(await page.locator('.private-request-image img').getAttribute('src'),/^blob:/);
 await page.clock.fastForward(120001);
 assert.equal(await page.locator('.private-request-image img').count(),0);
 assert.equal(await page.locator('.request-image-open').count(),0);
 await open(page);
 await page.evaluate(async()=>{const {supabase}=await import('/js/supabaseClient.js');await supabase.auth.signOut();});
 assert.equal(await page.locator('.private-request-image img').count(),0);
});
test('Provider: before confirmation, after confirmation, decline/reassignment and status transitions',async({page,state,r})=>{
 state.role='provider';r.status='provider_selected';
 assert.deepEqual(await direct(page),{references:0,downloadDenied:true});
 await open(page);assert.equal(await page.locator('img').count(),0);
 for(const status of ['confirmed','in_progress','completed']){r.status=status;await open(page);assert.equal(await page.locator('img').count(),1);}
 r.status='pending';r.selected_provider_id=null;await open(page);assert.equal(await page.locator('img').count(),0);
 assert.deepEqual(await direct(page),{references:0,downloadDenied:true});
 r.status='confirmed';r.selected_provider_id='other-provider';assert.deepEqual(await direct(page),{references:0,downloadDenied:true});
});
for(const kind of ['anonymous','unrelated-client','nonselected-provider','inactive','unverified'])test(`${kind}: reference and direct download denied`,async({page,state,r})=>{
 if(kind==='anonymous')state.session=false;
 if(kind==='unrelated-client'){state.role='client';r.client_id='other-client';}
 if(kind==='nonselected-provider'){state.role='provider';r.selected_provider_id='other-provider';}
 if(kind==='inactive')state.tables.users.find(u=>u.id===ids.client).status='suspended';
 if(kind==='unverified')state.tables.users.find(u=>u.id===ids.client).identity_verified=false;
 assert.deepEqual(await direct(page),{references:0,downloadDenied:true});
 await open(page);assert.equal(await page.locator('img').count(),0);
});
test('Legacy canonical URL-only image preserved; mismatched/foreign/signed URLs fail closed',async({page,state,r})=>{
 r.request_image_url=prefix+r.request_image_path;r.request_image_path=null;
 await open(page);assert.equal(await page.locator('img').count(),1);
 for(const url of ['https://foreign.invalid/image.png',prefix+'../other.png',prefix+'other/fixture.png?token=not-accepted']){
  r.request_image_url=url;await open(page);assert.equal(await page.locator('img').count(),0);
 }
 r.request_image_path=`${ids.client}/SYN-IMAGE.png`;r.request_image_url=prefix+`${ids.client}/different.png`;
 await open(page);assert.equal(await page.locator('img').count(),0);
});
test('Missing private capability or Storage failure never uses public URL fallback',async({page,state,r})=>{
 state.imageBackend=false;await open(page);assert.equal(await page.locator('img').count(),0);
 assert.equal(state.calls.some(o=>o.action==='download'),false);
 state.imageBackend=true;state.fail=o=>o.action==='download';r.request_image_url=prefix+r.request_image_path;
 await open(page);assert.equal(await page.locator('img').count(),0);
});
test('Unsupported MIME and corrupt image bytes fail closed',async({page,state})=>{
 state.imageMime='text/html';await open(page);assert.equal(await page.locator('img').count(),0);
 state.imageMime='image/png';state.imageBase64=Buffer.from('not an image').toString('base64');await open(page);
 await page.getByText('Image could not be displayed. Try again later.').waitFor();
 assert.equal(await page.locator('img').count(),0);
});
test('Removed card cannot repopulate a preview after a delayed download',async({page,state})=>{
 let release;const gate=new Promise(r=>{release=r;});state.delay=op=>op.action==='download'?gate:undefined;
 await page.locator('.request-image-view').click();
 const deadline=Date.now()+5000;
 while(!state.calls.some(op=>op.action==='download')){assert.ok(Date.now()<deadline,'download must start');await new Promise(r=>setTimeout(r,10));}
 await page.evaluate(()=>document.querySelector('.private-request-image').remove());release();
 await page.waitForTimeout(100);assert.equal(await page.locator('img').count(),0);
});
test('Even authorized readers cannot mint signed URLs or list request-image objects',async({page,state})=>{
 for(const role of ['client','provider','admin']){
  state.role=role;
  const denied=await page.evaluate(async()=>{
   const {supabase}=await import('/js/supabaseClient.js');
   const signed=await supabase.storage.from('request-images').createSignedUrl(window.testPath,86400);
   const listed=await window.__systemApi({kind:'storage',action:'list',bucket:'request-images'});
   return Boolean(signed.error)&&Boolean(listed.error);
  });
  assert.equal(denied,true);
 }
});
test('Real Provider confirmation unlocks the image only on the authorized assignment page',async({page,state,r,base})=>{
 state.role='provider';r.status='provider_selected';
 await page.goto(base+'/provider/incoming-requests.html');await page.locator('.confirm-btn').waitFor();
 assert.equal(await page.locator('.request-image-view, .request-submitted-image').count(),0);
 assert.equal(state.calls.some(o=>o.name==='request_image_reference'||o.action==='download'),false);
 await page.locator('.confirm-btn').click();
 await page.getByText('Request confirmed successfully.').waitFor();
 assert.equal(r.status,'confirmed');
 await page.goto(base+'/provider/assignment-details.html');await page.locator('.request-image-view').waitFor();
 await open(page);assert.equal(await page.locator('.private-request-image img').count(),1);
});
for(const width of [390,768,1024,1440])test(`Real Provider assignment image responsive/accessibility at ${width}px`,async({page,state,base})=>{
 state.role='provider';await page.setViewportSize({width,height:1000});
 await page.goto(base+'/provider/assignment-details.html');await page.locator('.request-image-view').waitFor();
 await open(page);
 const image=page.locator('.private-request-image img');await image.waitFor();
 assert.equal(await image.evaluate(el=>el.complete&&el.naturalWidth===1600&&el.clientWidth<=460&&el.clientHeight<=220),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'View request image'}).focus();
 assert.equal(await page.locator('.request-image-view').evaluate(el=>el===document.activeElement),true);
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 assert.deepEqual(await page.evaluate(async()=> (await axe.run('.private-request-image')).violations.map(v=>v.id)),[]);
 await page.screenshot({path:path.join(out,`provider-private-image-${width}.png`),fullPage:true,style:'.skip-link:not(:focus){visibility:hidden}'});
 await page.locator('.private-request-image').screenshot({path:path.join(out,`private-image-panel-${width}.png`)});
});
test('Real Client edit and Admin monitor expose only private controls',async({page,state,r,base})=>{
 r.status='pending';state.role='client';await page.goto(base+'/client/create-request.html?request_id=SYN-IMAGE');
 await page.locator('.request-image-view').waitFor();await open(page);assert.equal(await page.locator('.private-request-image img').count(),1);
 state.role='admin';await page.goto(base+'/admin/monitor-requests.html');await page.locator('.request-image-view').waitFor();
 await open(page);assert.equal(await page.locator('.private-request-image img').count(),1);
});
test('Upload compatibility gate blocks before any request or Storage write',async({page,state,base})=>{
 state.imageBackend=false;state.role='client';await page.goto(base+'/client/create-request.html');
 await page.locator('#title').fill('Synthetic private image gate');
 await page.locator('#category').selectOption('Cleaning');await page.locator('#serviceType').selectOption('Home Cleaning');
 await page.locator('#description').fill('Synthetic fixture only');await page.locator('#preferredDate').fill('2026-11-02');
 await page.locator('#preferredTime').fill('10:00');await page.locator('#location').fill('Synthetic Likas');
 await page.evaluate(()=>{document.querySelector('#clientLat').value='6.04';document.querySelector('#clientLng').value='116.12';});
 await page.locator('#requestImage').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1sAAAAASUVORK5CYII=','base64')});
 await page.locator('#createRequestBtn').click();await page.getByText('Private image uploads are temporarily unavailable.',{exact:false}).waitFor();
 assert.equal(state.calls.some(o=>o.name==='create_service_request'||o.name==='client_update_request'||o.action==='upload'),false);
 assert.equal(await page.locator('#createRequestBtn').isEnabled(),true);
});
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/image-test.html')return res.writeHead(200,{'content-type':'text/html'}).end('<!doctype html><html lang="en"><title>Private image synthetic component</title><body><main><h1>Image fixture</h1></main></body></html>');
  const file=path.resolve(root,'igotu_v2','.'+pathname);
  if(!file.startsWith(path.join(root,'igotu_v2')+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'content-type':{'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'}).end(data));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=process.env.UI_BASE_URL=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const results=[];
 try{for(const t of tests){
  const context=await browser.newContext({serviceWorkers:'block'});const tables=seed();
  tables.service_requests=[{...tables.service_requests[1],request_id:'SYN-IMAGE',request_image_path:`${ids.client}/SYN-IMAGE.png`,request_image_url:null}];
  const state=await install(context,{role:'client',tables});const page=await context.newPage();const errors=[],publicRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(req.url().includes('/object/public/'))publicRequests.push(req.url());});
  try{
   await page.clock.install({time:new Date('2026-10-29T04:00:00Z')});
   await page.goto(base+'/image-test.html');
   await page.evaluate(async path=>{window.testPath=path;const m=await import('/js/request-images.js');document.querySelector('main').insertAdjacentHTML('beforeend',m.requestImageHtml({request_id:'SYN-IMAGE'}));m.bindRequestImages();},tables.service_requests[0].request_image_path);
   state.imageBase64=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;const ctx=canvas.getContext('2d');ctx.fillStyle='#dceee3';ctx.fillRect(0,0,1600,900);ctx.fillStyle='#14532d';ctx.font='70px sans-serif';ctx.fillText('SYNTHETIC PRIVATE IMAGE',80,450);return canvas.toDataURL('image/png').split(',')[1];});
   await t.run({page,state,r:tables.service_requests[0],base});
   assert.deepEqual(publicRequests,[]);assert.deepEqual(errors,[]);assert.deepEqual(state.unknown,[]);
   assert.equal(state.calls.some(o=>o.kind==='query'&&o.calls?.some(c=>['insert','update','delete','upsert'].includes(c[0]))),false);
   assert.equal(state.calls.some(o=>o.kind==='storage'&&['upload','remove'].includes(o.action)),false,'viewing must not mutate files');
   results.push({name:t.name,status:'PASS'});console.log('PASS',t.name);
  }catch(e){results.push({name:t.name,status:'FAIL',error:e.stack});console.error('FAIL',t.name,e.message);}finally{await context.close();}
 }}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'Synthetic model and browser only; not live RLS verification',results},null,2));}
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
