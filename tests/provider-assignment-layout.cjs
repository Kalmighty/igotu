/* Synthetic local browser only; never contacts Supabase or submits actions. */
const { chromium } = require('playwright');
const { install, seed, ids } = require('./system-fixture.cjs');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const sourceRoot = path.resolve(process.env.ASSIGNMENT_SOURCE_ROOT || root);
const phase = process.env.ASSIGNMENT_PHASE || 'after';
const output = path.join(root, 'work/assignment-layout', phase);
fs.mkdirSync(output, { recursive: true });
const results = [];
(async () => {
  if (phase !== 'before') {
    const { formatApproximateGridLabel } = await import('../igotu_v2/js/assignment-presentation.js');
    assert.equal(formatApproximateGridLabel('Approximate grid: latitude 6.000000000000001 to 6.1, longitude 116.1 to 116.19999999999999'), 'Approximate grid: latitude 6.0 to 6.1, longitude 116.1 to 116.2');
    assert.equal(formatApproximateGridLabel('Approximate grid: latitude -0.19999999999999 to -0.1, longitude -179.9 to -179.8'), 'Approximate grid: latitude -0.2 to -0.1, longitude -179.9 to -179.8');
    for (const value of ['Synthetic Unit 123, Likas', 'Area available after confirmation', 'Approximate grid: latitude 6.04 to 6.14, longitude 116.12 to 116.22', 'Approximate grid: latitude 99 to 100, longitude 0 to 1']) assert.equal(formatApproximateGridLabel(value),value);
  }
  const server = http.createServer((req, res) => {
    const file = path.resolve(sourceRoot, 'igotu_v2', '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(path.join(sourceRoot, 'igotu_v2') + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, {'content-type':{'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}[path.extname(file)] || 'application/octet-stream'}).end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.UI_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium', args:['--no-sandbox']});
  try {
    for (const width of [390,768,1024,1440]) {
      const context = await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
      if(width===768) await context.addInitScript(()=>{window.ResizeObserver=undefined;});
      const tables = seed();
      const template = tables.service_requests[1];
      tables.service_requests = ['confirmed','in_progress','completed','completed'].map((status, i) => ({...template,
        request_id:`SYN-LAYOUT-${i}`, status,
        title:'Synthetic deep cleaning and maintenance — ' + 'VeryLongServiceTitle'.repeat(4),
        description:'Synthetic visual fixture only. ' + 'Detailed service requirements for a spacious family home. '.repeat(3),
        location:'Synthetic Unit 123, Jalan Example, ' + 'LongBuildingName'.repeat(8) + ', Kota Kinabalu, Sabah',
        request_image_url:process.env.UI_BASE_URL+'/layout-image.svg',
      }));
      tables.service_requests[3].location='Approximate grid: latitude 6.000000000000001 to 6.1, longitude 116.1 to 116.19999999999999';
      tables.service_reviews = [{request_id:'SYN-LAYOUT-2',reviewer_id:ids.provider,reviewee_id:ids.client,rating:5,feedback:'Synthetic feedback — '+ 'LongReviewWithoutSpaces'.repeat(14)}];
      tables.payment_records = tables.service_requests.map((r,i)=>({payment_id:`SYN-PAY-${i}`,request_id:r.request_id,client_id:ids.client,provider_id:ids.provider,amount:12345.67,payment_method:'bank_transfer',created_at:'2026-10-28T08:15:00Z',proof_path:i===0?`${ids.client}/synthetic-proof.png`:null}));
      const state = await install(context,{role:'provider',tables});
      await context.route(/\/(?:layout-image\.svg|fixture-asset\/payment-proofs\/.*synthetic-proof\.png)/, route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#dceee3"/><text x="100" y="450" font-size="80" fill="#14532d">SYNTHETIC SERVICE IMAGE</text></svg>'}));
      await context.route('**/leaflet@1.9.4/dist/leaflet.js', route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('leaflet/dist/leaflet.js'),'utf8')+'\n;window.__layoutMaps=[];L.Map.addInitHook(function(){window.__layoutMaps.push(this);});'}));
      await context.route('**/leaflet@1.9.4/dist/images/*', route=>route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(path.dirname(require.resolve('leaflet/dist/leaflet.js')),'images',path.basename(new URL(route.request().url()).pathname)))}));
      await context.route('https://*.tile.openstreetmap.org/**', route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf4ef"/><path d="M0 80H256M100 0V256" stroke="#c9ddcf" stroke-width="12"/><text x="15" y="180" font-size="15" fill="#355342">Synthetic map tile</text></svg>'}));
      const page = await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try {
        await page.goto(process.env.UI_BASE_URL+'/provider/assignment-details.html');
        await page.waitForFunction(()=>document.querySelectorAll('.assignment-card').length===4);
        await page.locator('.assignment-map.leaflet-container').last().waitFor();
        await page.waitForTimeout(700);
        const measure = () => page.locator('.assignment-card').evaluateAll(cards=>cards.map(card=>{
          const [details,actions]=card.children;
          const map=card.querySelector('.assignment-map');
          return {details:details.getBoundingClientRect().width,actions:actions.getBoundingClientRect().width,stacked:actions.getBoundingClientRect().top>=details.getBoundingClientRect().bottom-1,mapWidth:map.clientWidth,mapHeight:map.clientHeight};
        }));
        const metrics=await measure();
        await page.screenshot({path:path.join(output,`assignments-${width}.png`),fullPage:true,style:'.skip-link:not(:focus) { visibility: hidden; }'});
        await page.locator('.assignment-card').nth(2).screenshot({path:path.join(output,`completed-${width}.png`),style:'.skip-link:not(:focus) { visibility: hidden; }'});
        if(phase!=='before') {
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page overflow');
          assert.equal(await page.locator('.assignment-card').evaluateAll(cards=>cards.some(c=>c.scrollWidth>c.clientWidth)),false,'card overflow');
          for(const m of metrics){
            if(width>=1200){assert.ok(m.details>m.actions);assert.ok(m.actions>=300&&m.actions<=340);}
            else assert.ok(m.stacked,'single column');
            assert.ok(m.mapWidth>=220 && m.mapHeight>=240,'usable map');
          }
          assert.equal(await page.locator('.request-submitted-image').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0&&i.clientWidth<=460&&i.clientHeight<=280)),true);
          assert.equal(await page.locator('.payment-proof-image').count(),1);
          assert.equal(await page.locator('.payment-proof-image').evaluate(e=>e.complete&&e.naturalWidth>0&&e.clientWidth<=460&&e.clientHeight<=280),true);
          assert.match(await page.locator('.assignment-location').last().textContent(), /latitude 6\.0 to 6\.1, longitude 116\.1 to 116\.2/);
          assert.equal(await page.evaluate(()=>window.__layoutMaps.every(map=>{
            let point;
            map.eachLayer(layer=>{if(layer.getPopup?.())point=layer.getLatLng();});
            return point?.lat===6.04&&point?.lng===116.12;
          })),true,'underlying coordinates unchanged');
          assert.equal(await page.locator('.start-btn').count(),1);
          assert.equal(await page.locator('.provider-review-form').count(),1);
          assert.equal(await page.locator('.compact-success').count(),1);
          await page.locator('.start-btn').focus();
          assert.equal(await page.locator('.start-btn').evaluate(e=>e===document.activeElement),true);
          await page.locator('.leaflet-marker-icon').first().click();
          await page.waitForTimeout(400);
          assert.equal(await page.locator('.assignment-map').first().evaluate(el=>{
            const popup=el.querySelector('.leaflet-popup').getBoundingClientRect();
            const zoom=el.querySelector('.leaflet-control-zoom').getBoundingClientRect();
            return popup.right<=zoom.left || popup.left>=zoom.right || popup.bottom<=zoom.top || popup.top>=zoom.bottom;
          }),true,'popup must not overlap zoom controls');
          await page.locator('.leaflet-popup-close-button').click();
          await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
          const issues=await page.evaluate(async()=> (await axe.run('#assignmentsList',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
          assert.deepEqual(issues,[],'automated accessibility');
          // Same loaded maps must resize with a breakpoint change, not just first render.
          await page.setViewportSize({width:width===1440?390:1440,height:1000});
          await page.waitForTimeout(500);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'resize overflow');
          assert.equal(await page.evaluate(()=>window.__layoutMaps.every(map=>Math.abs(map.getSize().x-map.getContainer().clientWidth)<2)),true,'Leaflet invalidated after resize');
        }
        const providerReads=state.calls.filter(o=>o.kind==='rpc'&&o.name==='provider_service_requests');
        assert.equal(providerReads.length,1);
        assert.deepEqual(providerReads[0].args,{p_request_id:null,p_statuses:['confirmed','in_progress','completed']});
        assert.equal(state.calls.some(o=>o.kind==='query'&&o.table==='service_requests'),false);
        assert.deepEqual(errors,[]);
        assert.deepEqual(state.unknown,[]);
        assert.equal(state.calls.some(o=>o.kind==='query'&&o.calls?.some(c=>['insert','update','delete','upsert'].includes(c[0]))),false,'no fixture mutations');
        assert.equal(state.calls.some(o=>o.kind==='rpc'&&!['igotu_backend_contract','provider_service_requests','service_participants','payment_proof_reference'].includes(o.name)),false,'read-only RPCs');
        results.push({width,status:'PASS',metrics});console.log('PASS',phase,width);
      } catch(e){results.push({width,status:'FAIL',error:e.stack});console.error('FAIL',width,e.message);}
      finally{await context.close();}
    }
  } finally {await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));}
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
