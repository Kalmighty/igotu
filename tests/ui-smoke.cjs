/* Run against a local static server. Requires Playwright and Chromium.
   UI_BASE_URL=http://127.0.0.1:4173 UI_SCREENSHOTS=/path node tests/ui-smoke.cjs */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext();
 const external=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==new URL(process.env.UI_BASE_URL||'http://127.0.0.1:4173').origin) {external.push(url.hostname);return route.abort();}
  if(url.pathname==='/js/supabaseClient.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'ui-fixture.js'),'utf8')});
  // Test the real dashboard, recommendations and shared shell; other pages are layout checks.
  if(url.pathname.startsWith('/js/')&&!['service-calendar.js','backend-access.js','payment-receipts.js','profile-guard.js','identity-access.js','app-shell.js','client.js','provider.js','admin.js','client-recommended-providers.js','html-safety.js','notification-helper.js','supabaseClient.js'].includes(path.basename(url.pathname)))return route.fulfill({contentType:'text/javascript',body:''});
  return route.continue();
 });
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.UI_BASE_URL||'http://127.0.0.1:4173';
 const shots=process.env.UI_SCREENSHOTS;
 if(shots)fs.mkdirSync(shots,{recursive:true});
 let checks=0;
 for(const width of [1440,768,390,320]) {
  await page.setViewportSize({width,height:1000});
  for(const role of ['client','provider','admin']) {
   const pages=fs.readdirSync(path.join(__dirname,'../igotu_v2',role)).filter(f=>f.endsWith('.html')&&f!=='complete-profile.html'&&f!=='verification.html');
   for(const file of pages) {
    await page.goto(`${base}/${role}/${file}?request_id=REQ-101`);
    await page.waitForTimeout(80);
    if (await page.locator('body[data-access-state]').count()) {
      await page.waitForFunction(()=>document.body.dataset.accessState!=='checking');
      assert.equal(await page.locator('body').getAttribute('data-access-state'),'allowed',`${role}/${file}: ${await page.locator('#workspaceAccessMessage').textContent()}`);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow: ${role}/${file} at ${width}`);
    const toggle=page.locator('.navigation-toggle');
    if(width<=1000){
     await toggle.click();
     assert.equal(await toggle.getAttribute('aria-expanded'),'true');
     await page.locator('.side-menu a').first().focus();
     await page.keyboard.press('Escape');
     assert.equal(await toggle.getAttribute('aria-expanded'),'false');
     assert.equal(await toggle.evaluate(e=>e===document.activeElement),true);
    } else assert.equal(await page.locator('.side-menu').isVisible(),true);
    if(shots&&[1440,390].includes(width)&&(file==='dashboard.html'||file==='recommended-providers.html'||file==='incoming-requests.html'||file==='manage-users.html')) {
     await page.screenshot({path:path.join(shots,`${role}-${file.replace('.html','')}-${width}.png`),fullPage:true});
    }
    checks++;
   }
  }
 }
 await page.goto(`${base}/client/recommended-providers.html?request_id=REQ-101`);
 await page.locator('.select-provider-btn').first().waitFor();
 assert.equal(await page.locator('.smart-provider-card').count(),2);
 await page.getByLabel('Search providers by name, location or skill').fill('Sarah');
 assert.equal(await page.locator('.smart-provider-card').count(),1);
 await page.getByLabel('Search providers by name, location or skill').fill('no results');
 assert.equal(await page.getByText('No matching providers found').isVisible(),true);
 await page.locator('#resetFiltersBtn').click();
 assert.equal(await page.locator('.smart-provider-card').count(),2);
 await page.getByRole('button',{name:'Select Sarah Lim as provider'}).click();
 assert.equal((await page.evaluate(()=>window.fixtureRpc)).name,'client_select_provider');
 assert.equal(await page.getByRole('status').filter({hasText:'Fixture: selection stopped'}).isVisible(),true);
 for(const role of ['client','provider','admin'])for(const mode of ['empty','error']){
  await page.goto(`${base}/${role}/dashboard.html?fixture=${mode}`);
  await page.locator('.ui-state').waitFor();
  assert.equal(await page.locator('.ui-state .btn').isVisible(),true);
  if(mode==='error')assert.equal(await page.locator('.stat-card strong').first().textContent(),'—');
 }
 // Desktop-to-mobile resize must not strand keyboard focus in collapsed navigation.
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(`${base}/admin/dashboard.html`);
 await page.locator('.side-menu a').first().focus();
 await page.setViewportSize({width:390,height:1000});
 await page.waitForTimeout(100);
 assert.equal(await page.locator('.navigation-toggle').evaluate(e=>e===document.activeElement),true);
 assert.deepEqual(errors,[],'Unexpected browser errors');
 assert.equal(external.some(host=>host.includes('supabase')),false,'Supabase network request escaped fixture');
 if(shots) {
  await page.locator('.navigation-toggle').click();
  await page.screenshot({path:path.join(shots,'admin-navigation-390.png'),fullPage:true});
 }
 // Navigation remains available if the presentation script fails to load.
 await context.route('**/js/app-shell.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.goto(`${base}/client/dashboard.html`);
 assert.equal(await page.locator('.side-menu').isVisible(),true);
 console.log(`PASS: ${checks} page/viewport layouts; mobile navigation and keyboard focus; provider search/reset/selection; dashboard empty/error states. No live Supabase calls.`);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
