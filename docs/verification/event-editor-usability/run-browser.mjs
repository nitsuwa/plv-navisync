import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(process.env.PLAYWRIGHT_MODULE || `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`)); }
const out = 'docs/verification/event-editor-usability/evidence';
fs.mkdirSync(out, {recursive:true});
const report = {status:'RUNNING', checks:[], pageErrors:[], externalRequests:[], mode:'Published-map fixture; actual local WebGL/editor; external requests blocked, no live event writes'};
const browser = await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context = await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true});
context.setDefaultTimeout(15000);
await context.route('**/*',route=>{const url=new URL(route.request().url()); if(['localhost','127.0.0.1'].includes(url.hostname))return route.continue(); report.externalRequests.push(url.origin+url.pathname); return route.abort();});
const page = await context.newPage();
page.on('pageerror',e=>report.pageErrors.push(e.message));
const fixture = 'http://127.0.0.1:5173/docs/verification/event-editor-usability/fixture/index.html';
const button = name => page.getByRole('button',{name,exact:true});
const check = text => {report.checks.push(text); console.log(text);};
const canvas = () => page.getByRole('region',{name:'Event 3D editor'}).locator('canvas');
async function enter3D(){await button('3D layout').click();await canvas().waitFor({state:'visible'}); await page.waitForTimeout(500);}
async function choose(name){await button('Add item in 3D').click();await page.getByRole('dialog',{name:'Choose event asset'}).waitFor();if(name==='Chair')await page.screenshot({path:`${out}/asset-catalog.png`});await button(`Choose ${name}`).click();}
async function countItems(count){await page.waitForFunction(n=>document.querySelectorAll('[aria-label="Event items in 3D preview"] li').length===n,count);}
try {
  await page.goto(`${fixture}?case=models`);
  await page.waitForFunction(()=>window.assetBounds?.().length===14);
  report.models = await page.evaluate(()=>window.assetBounds());
  for(const model of report.models){assert.ok(Math.abs(model.rendered[1]-model.expected)<.01,`${model.type} rendered height`); assert.ok(model.rendered[0]<=10.01&&model.rendered[2]<=7.51,`${model.type} footprint`);}
  check('All 14 actual mesh models retain type-specific height after a 400×300 footprint resize');
  await page.goto(fixture);
  await page.getByTestId('event-base-map').waitFor();
  await page.waitForTimeout(300);
  const view = await page.getByLabel('Event layout canvas',{exact:true}).boundingBox();
  for(const room of ['ASSEMBLY HALL','COMFORT ROOM','ELECTRICAL ROOM 1']){
    const box=await page.getByTestId('event-base-map').getByText(room,{exact:true}).boundingBox();
    assert.ok(box&&box.x>=view.x&&box.x+box.width<=view.x+view.width&&box.y>=view.y&&box.y+box.height<=view.y+view.height,`${room} completely visible`);
  }
  assert.equal(await page.getByTestId('event-base-map').evaluate(node=>getComputedStyle(node).overflow),'visible');
  await page.screenshot({path:`${out}/coed-full-2d.png`});
  check('COED annex rooms beyond the 651px canvas render completely in the 2D event view');
  await enter3D(); await choose('Chair');
  assert.equal(await canvas().evaluate(node=>getComputedStyle(node).cursor),'crosshair');
  const box=await canvas().boundingBox();
  await page.mouse.move(box.x+box.width*.48,box.y+box.height*.55);
  await countItems(0);
  await page.mouse.click(box.x+box.width*.48,box.y+box.height*.55);
  await countItems(1);
  assert.equal(await button('Move items in 3D').getAttribute('aria-pressed'),'true');
  check('Placement uses a crosshair; hover does not add data; one actual map click commits one Chair');
  await button('Save Draft').click();
  await page.waitForFunction(()=>window.usabilitySavedLayouts?.indoor.items.length===1);
  const saved=await page.evaluate(()=>window.usabilitySavedLayouts.indoor.items[0]);
  await button('2D layout').click();
  const item=page.getByTestId(`event-furniture-${saved.id}`);
  assert.equal(await item.count(),1); assert.ok((await item.getAttribute('style')).includes(`left: ${saved.x}px`));
  await button('Reopen saved layout').click(); await page.getByTestId(`event-furniture-${saved.id}`).waitFor();
  check('Immediate Save in 3D persists the same item and coordinates in 2D and after reopening');
  await enter3D(); await choose('Table'); await page.keyboard.press('Escape');
  assert.equal(await button('Move items in 3D').getAttribute('aria-pressed'),'true'); await countItems(1);
  check('Escape cancels placement without adding an item');
  await choose('Table');
  const touchMap = await canvas().boundingBox();
  await page.touchscreen.tap(touchMap.x+touchMap.width*.45,touchMap.y+touchMap.height*.6);
  await countItems(2);
  check('Actual Chromium single-touch input places one Table without a confirmation click');
  await button('Add label in 3D').click();
  assert.equal(await button('Place here in 3D').isEnabled(),true);
  await button('Place here in 3D').focus(); await button('Place here in 3D').press('Enter');
  await countItems(3); await button('Save Draft').click();
  await page.waitForFunction(()=>window.usabilitySavedLayouts.indoor.items.length===2&&window.usabilitySavedLayouts.indoor.labels.length===1);
  check('Keyboard Place here works without a map click and saves the added label');
  await button('Campus grounds').click(); await enter3D();
  assert.equal(await page.getByRole('button',{name:/^Enter .* building$/}).count(),0);
  await choose('Table');
  const outdoor=await canvas().boundingBox();
  let groundPoint;
  for (const [x,y] of [[.5,.5],[.4,.5],[.6,.5],[.45,.6],[.6,.6],[.5,.75]]) {
    await page.mouse.move(outdoor.x+outdoor.width*x,outdoor.y+outdoor.height*y); await page.waitForTimeout(180);
    if(await button('Place here in 3D').isEnabled()){groundPoint={x:outdoor.x+outdoor.width*x,y:outdoor.y+outdoor.height*y};break;}
  }
  assert.ok(groundPoint,'an open campus-ground position is available');
  await page.mouse.click(groundPoint.x,groundPoint.y);
  await countItems(1); await button('Save Draft').click();
  await page.waitForFunction(()=>window.usabilitySavedLayouts?.outdoor.items.length===1);
  const outdoorSaved=await page.evaluate(()=>window.usabilitySavedLayouts.outdoor.items[0]);
  await button('2D layout').click(); await page.getByTestId(`event-furniture-${outdoorSaved.id}`).waitFor();
  await button('COED floor').click(); await page.getByTestId(`event-furniture-${saved.id}`).waitFor();
  check('Outdoor placement survives view/location switching; preview omits inoperative entrance buttons');
  await enter3D(); await button('Toggle theme').click(); await page.screenshot({path:`${out}/coed-dark-3d.png`});
  await page.setViewportSize({width:390,height:844});
  await button('Add item in 3D').click();
  const search=page.getByRole('searchbox',{name:'Search event assets'}); await search.fill('chair');
  assert.equal(await button('Choose Tent').count(),0); await button('Choose Chair').click();
  await button('Choose 3D event asset').focus(); await button('Choose 3D event asset').press('Enter');
  await search.fill('zzzz'); await page.getByText('No assets found. Try another name.').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await button('Choose 3D event asset').evaluate(node=>node===document.activeElement),true);
  assert.equal(await button('Add item in 3D').getAttribute('aria-pressed'),'true');
  await button('Cancel placement in 3D').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  await page.screenshot({path:`${out}/mobile-3d.png`});
  check('Mobile catalog search, empty results, keyboard focus return and Escape preserve the intended mode');
  await button('Toggle admin review').click(); await button('3D preview').click();
  await page.getByRole('region',{name:'Event 3D preview'}).locator('canvas').waitFor();
  assert.equal(await button('Add item in 3D').count(),0); assert.equal(await button('Save Draft').count(),0);
  check('Admin review remains read-only');
  assert.deepEqual(report.pageErrors,[]); report.status='PASS';
} catch(error){report.status='FAIL';report.error=error.stack||String(error);process.exitCode=1;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally {fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify(report,null,2)); console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,pageErrors:report.pageErrors}));await browser.close();}
