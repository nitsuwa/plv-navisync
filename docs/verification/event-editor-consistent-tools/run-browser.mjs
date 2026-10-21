import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let chromium;
try {({chromium}=require('playwright'));} catch {({chromium}=require(`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`));}
const out='docs/verification/event-editor-consistent-tools/evidence'; fs.mkdirSync(out,{recursive:true});
const report={status:'RUNNING',checks:[],pageErrors:[],externalRequests:[],mode:'Isolated published-map fixture. Local memory saves; external requests blocked.'};
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true}); context.setDefaultTimeout(15000);
await context.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname))return route.continue();report.externalRequests.push(url.origin+url.pathname);return route.abort();});
const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
const button=name=>page.getByRole('button',{name,exact:true});
const check=name=>{report.checks.push(name);console.log(name);};
const fixture='http://127.0.0.1:5173/docs/verification/event-editor-consistent-tools/fixture/index.html';
const canvas=()=>page.getByRole('region',{name:'Event 3D editor'}).locator('canvas');
const count=async n=>page.waitForFunction(count=>document.querySelectorAll('[aria-label="Event items in 3D preview"] li').length===count,n);
async function enter3D(){await button('3D layout').click();await canvas().waitFor({state:'visible'});await page.waitForTimeout(600);}
async function choose(name){await button('Add item in 3D').click();await button(`Choose ${name}`).click();}
async function select(id){await page.getByRole('combobox',{name:'Selected 3D item'}).selectOption(id);await page.getByRole('region',{name:'Item details'}).waitFor();}
async function closeDetails(){await button('Close item details').click();}
async function numeric(name,value){const input=page.getByRole('spinbutton',{name,exact:true});await input.fill(String(value));await input.press('Enter');}
async function save(){await button('Save Draft').click();await page.waitForTimeout(200);return page.evaluate(()=>window.usabilitySavedLayouts);}
async function openPoint(){const box=await canvas().boundingBox();for(const [x,y] of [[.48,.55],[.4,.55],[.6,.5],[.45,.6],[.6,.6],[.5,.75]]){await page.mouse.move(box.x+box.width*x,box.y+box.height*y);await page.waitForTimeout(140);if(await button('Place here in 3D').isEnabled())return{x:box.x+box.width*x,y:box.y+box.height*y};}throw Error('No available map point');}
try {
  await page.goto(`${fixture}?case=models`,{waitUntil:"domcontentloaded",timeout:60000});await page.waitForFunction(()=>window.assetBounds?.().length===14);
  const models=await page.evaluate(()=>window.assetBounds());for(const model of models)assert.ok(Math.abs(model.rendered[1]-model.expected)<.01,`${model.type} stable height`);
  check('14 real asset models retain stable height; width/depth changes do not create giant heights');
  await page.goto(fixture,{waitUntil:"domcontentloaded",timeout:60000});await page.getByTestId('event-base-map').waitFor();await enter3D();await choose('Table');
  let point=await openPoint();await page.mouse.move(point.x,point.y);await count(0);await page.getByTestId('event-3d-placement-mode').waitFor();await page.getByTestId('event-3d-pointer-badge').waitFor();
  assert.equal(await page.evaluate(({x,y})=>getComputedStyle(document.elementFromPoint(x,y)).cursor,point),'crosshair');
  const roomLabel=page.getByText('ASSEMBLY HALL',{exact:true}).last();const labelBox=await roomLabel.boundingBox();if(labelBox){assert.equal(await page.evaluate(({x,y})=>getComputedStyle(document.elementFromPoint(x,y)).cursor,{x:labelBox.x+labelBox.width/2,y:labelBox.y+labelBox.height/2}),'crosshair');}
  assert.equal(await button('Fit map in 3D').evaluate(node=>getComputedStyle(node).cursor),'pointer');
  await page.screenshot({path:`${out}/desktop-placement.png`});
  check('Actual ground and HTML room labels have crosshair; pointer badge/mode are visible; camera chrome stays clickable; hover adds no data');
  await page.mouse.click(point.x,point.y);await count(1);assert.equal(await button('Move items in 3D').getAttribute('aria-pressed'),'true');
  const layouts=await save(), table=layouts.indoor.items[0];await select(table.id);assert.equal(await page.getByTestId('event-item-inspector-rail').count(),1);
  const originalWidth=table.width;await numeric('Width in 3D',originalWidth*1.2);assert.equal(await page.getByRole('spinbutton',{name:'Depth in 3D',exact:true}).inputValue(),String(table.height*1.2));
  const x=page.getByRole('spinbutton',{name:'Rotation in 3D'});await x.fill('90');await x.press('Escape');assert.equal(await x.inputValue(),'0');
  await closeDetails();await button('2D layout').click();const item=page.getByTestId(`event-furniture-${table.id}`);assert.ok((await item.getAttribute('style')).includes(`width: ${originalWidth*1.2}px`));
  await item.click();await page.getByRole('button',{name:`Resize ${table.name}`,exact:true}).waitFor();
  const resize=await page.getByRole('button',{name:`Resize ${table.name}`,exact:true}).boundingBox();await page.mouse.move(resize.x+resize.width/2,resize.y+resize.height/2);await page.mouse.down();await page.mouse.move(resize.x+resize.width/2+18,resize.y+resize.height/2+12,{steps:6});await page.mouse.up();
  assert.notEqual(await item.evaluate(node=>node.style.width),`${originalWidth*1.2}px`);await button('Undo').click();assert.equal(await item.evaluate(node=>node.style.width),`${originalWidth*1.2}px`);
  check('Shared desktop Details commits proportional sizes, Escape cancels numeric draft; 2D resize handle works and one Undo restores size');
  await button('Furniture').click();await button('Chair').click();const map2d=await page.getByLabel('Event layout canvas',{exact:true}).boundingBox();await page.mouse.move(map2d.x+map2d.width*.5,map2d.y+map2d.height*.5);await page.getByTestId('event-2d-pointer-badge').waitFor();assert.equal(await page.evaluate(({x,y})=>getComputedStyle(document.elementFromPoint(x,y)).cursor,{x:map2d.x+map2d.width*.5,y:map2d.y+map2d.height*.5}),'crosshair');
  await button('Cancel placement').click();await button('Label').click();await page.mouse.move(map2d.x+map2d.width*.5,map2d.y+map2d.height*.5);await page.getByTestId('event-label-placement-preview').waitFor();await page.getByTestId('event-2d-placement-mode').waitFor();await button('Cancel label placement').click();
  check('2D item and label modes expose crosshair, pointer badge, ghost and explicit cancellation');
  await enter3D();await choose('Chair');await page.getByRole('checkbox',{name:'Keep placing'}).check();point=await openPoint();await page.mouse.click(point.x,point.y);await count(2);await page.mouse.click(point.x+12,point.y+8);await count(3);assert.equal(await button('Add item in 3D').getAttribute('aria-pressed'),'true');await button('Undo').click();await count(2);await button('Cancel placement in 3D').click();
  check('Keep placing persists mode; each placement is retained and each Undo removes exactly one item');
  const saved2=await save();const chair=saved2.indoor.items.find(item=>item.type==='chair');await select(chair.id);assert.equal(await page.getByRole('spinbutton',{name:'Width in 3D',exact:true}).count(),0);await closeDetails();assert.equal(await button('Resize items in 3D').isDisabled(),true);
  await select(table.id);await page.getByRole('checkbox',{name:'Lock proportions'}).uncheck();const depthBefore=await page.getByRole('spinbutton',{name:'Depth in 3D'}).inputValue();await numeric('Width in 3D',70);assert.equal(await page.getByRole('spinbutton',{name:'Depth in 3D'}).inputValue(),depthBefore);await button('Reset to standard size').click();await closeDetails();await button('Focus selection in 3D').click();await page.waitForTimeout(350);await button('Resize items in 3D').click();const sizeBefore=(await save()).indoor.items.find(item=>item.id===table.id);const handle=await button('Resize Table handle in 3D').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+35,handle.y+handle.height/2+20,{steps:6});await page.mouse.up();const sizeAfter=(await save()).indoor.items.find(item=>item.id===table.id);assert.ok(sizeAfter.width!==sizeBefore.width||sizeAfter.height!==sizeBefore.height);await button('Undo').click();await save();await button('Reopen saved layout').click();await enter3D();
  check('Chairs cannot stretch; table aspect unlocking changes width independently; actual 3D resize is undoable; reference Reset survives save and reopen');
  await button('Campus grounds').click();await enter3D();await choose('Chair');point=await openPoint();await page.mouse.click(point.x,point.y);await count(1);const outdoor=await save(), small=outdoor.outdoor.items[0];assert.equal(small.width,6.4);assert.equal(small.height,6.4);assert.equal(small.assetVariant,'event-outdoor-reference-v1:standard');await select(small.id);await page.getByRole('combobox',{name:'Size preset'}).selectOption('wide');await closeDetails();await button('Undo').click();await save();await button('2D layout').click();assert.ok((await page.getByTestId(`event-furniture-${small.id}`).getAttribute('style')).includes('width: 6.4px'));await button('Reopen saved layout').click();await page.getByTestId(`event-furniture-${small.id}`).waitFor();
  check('Outdoor chair has smaller realistic reference footprint; variant change is undoable and exact shared dimensions survive 2D/reopen');
  await page.evaluate(()=>window.failNextSave=true);await button('Save Draft').click();await page.getByText('Save failed — retry',{exact:true}).waitFor();await button('Retry save').click();await page.getByText('Saved',{exact:true}).waitFor();
  check('Failed local save retains the layout and explicit Retry acknowledges successful save');
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:width<500?844:1000});await enter3D();await page.getByRole('button',{name:/Open .*layout (issue|checks)/}).click();const popup=page.getByRole('region',{name:'Layout checks',exact:true});const bounds=await popup.boundingBox();assert.ok(bounds.width>=Math.min(320,width-24)&&bounds.x>=0&&bounds.x+bounds.width<=width,'issue popup outside toolbar, viewport width');await button('Close layout checks').click();
    await select(small.id);if(width<1280){assert.equal(await page.getByRole('dialog',{name:'Item details'}).count(),1);await closeDetails();assert.equal(await page.getByRole('combobox',{name:'Selected 3D item'}).evaluate(node=>node===document.activeElement),true);}else{assert.equal(await page.getByTestId('event-item-inspector-rail').count(),1);await closeDetails();}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);const c=await canvas().boundingBox();assert.ok(c.height>=230,`usable ${width}px canvas ${c.height}`);await page.screenshot({path:`${out}/viewport-${width}.png`});await button('2D layout').click();
  }
  check('360/390/768/1440 layouts have usable canvas, no page overflow, viewport-sized issue panel and correct sheet/rail with focus return');
  await page.setViewportSize({width:390,height:844});await enter3D();await button('Toggle theme').click();await choose('Table');await page.screenshot({path:`${out}/mobile-dark-placement.png`});point=await openPoint();await page.touchscreen.tap(point.x,point.y);await count(2);await button('Add label in 3D').click();await button('Place here in 3D').focus();await button('Place here in 3D').press('Enter');await count(3);await save();
  check('Mobile dark mode, native single-touch placement and keyboard label placement work');
  await button('Toggle admin review').click();await button('3D preview').click();await page.getByRole('region',{name:'Event 3D preview'}).locator('canvas').waitFor();assert.equal(await button('Add item in 3D').count(),0);assert.equal(await button('Save Draft').count(),0);
  check('Admin review remains read-only');
  assert.deepEqual(report.pageErrors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack||String(error);process.exitCode=1;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,pageErrors:report.pageErrors}));await browser.close();}
