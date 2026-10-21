import {createRequire} from 'node:module';import fs from 'node:fs';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`));}
const out='docs/verification/event-mobile-picker-snap/mobile-evidence';fs.mkdirSync(out,{recursive:true});
const report={status:'RUNNING',checks:[],pageErrors:[],liveDataWrites:false};const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:440,height:956},hasTouch:true});context.setDefaultTimeout(15000);await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
const button=name=>page.getByRole('button',{name,exact:true});const canvas=()=>page.getByRole('region',{name:'Event 3D editor'}).locator('canvas');const check=name=>{report.checks.push(name);console.log(name);};
async function save(){await button('Save Draft').click();await page.waitForTimeout(100);return page.evaluate(()=>window.usabilitySavedLayouts);}
try{
 await page.goto('http://127.0.0.1:5173/docs/verification/event-editor-consistent-tools/fixture/index.html',{waitUntil:'domcontentloaded',timeout:60000});
 // Keep only the fixture navigation strip compact; production editor styles are unchanged.
 await page.addStyleTag({content:'#root > div > div:first-child {height:44px;overflow:hidden;flex-wrap:nowrap}'});
 await button('3D layout').click();await canvas().waitFor({state:'visible'});await button('Add item in 3D').click();await button('Choose Chair').click();await page.getByRole('checkbox',{name:'Keep placing'}).check();
 for(let n=0;n<12;n++)await button('Place here in 3D').click();await button('Cancel placement in 3D').click();
 await button('Selected 3D item').click();const dialog=page.getByRole('dialog',{name:'Choose event item'});let bounds=await dialog.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=956&&bounds.x>=0&&bounds.x+bounds.width<=440);assert.equal(await dialog.locator('select').count(),0);await page.screenshot({path:`${out}/440-picker.png`});
 const search=page.getByRole('searchbox',{name:'Search event items'});await search.fill('Chair 11');await button('Select Chair 11').click();assert.equal(await dialog.count(),0);assert.equal(await button('Selected 3D item').evaluate(node=>node===document.activeElement),true);await button('Item details in 3D').click();await page.getByRole('dialog',{name:'Item details'}).waitFor();await button('Close item details').click();
 check('440px: searchable 12-item dialog is viewport-contained; selection closes it, returns focus and explicit Details opens the mobile sheet');
 await button('Selected 3D item').click();await search.fill('zzzz');await page.getByText('No matching items. Try another name.').waitFor();await page.keyboard.press('Escape');assert.equal(await button('Selected 3D item').evaluate(node=>node===document.activeElement),true);check('Picker empty search and Escape restore keyboard focus');
 await button('Add label in 3D').click();if(await button('Snap in 3D').getAttribute('aria-pressed')==='true')await button('Snap in 3D').click();const box=await canvas().boundingBox();await page.mouse.click(box.x+box.width*.57,box.y+box.height*.58);let layouts=await save();const free=layouts.indoor.labels.at(-1);assert.ok(free,'free label placed');
 await button('Add label in 3D').click();await button('Snap in 3D').click();assert.equal(await button('Snap in 3D').getAttribute('aria-pressed'),'true');const next=await canvas().boundingBox();await page.mouse.click(next.x+next.width*.57,next.y+next.height*.58);layouts=await save();const snapped=layouts.indoor.labels.at(-1);assert.ok(snapped&&snapped.id!==free.id);assert.ok(Math.abs(snapped.x/20-Math.round(snapped.x/20))<.00001&&Math.abs(snapped.y/20-Math.round(snapped.y/20))<.00001);assert.ok(Math.abs(free.x/20-Math.round(free.x/20))>.001||Math.abs(free.y/20-Math.round(free.y/20))>.001);report.labels={free,snapped};
 await button('2D layout').click();await page.getByTestId(`event-label-${snapped.id}`).waitFor();assert.ok((await page.getByTestId(`event-label-${snapped.id}`).getAttribute('style')).includes(`left: ${snapped.x}px`));check('Actual 3D label placement: Snap off retains free coordinates; on aligns anchors to grid and preserves them in 2D/save');
 await button('3D layout').click();await canvas().waitFor({state:'visible'});
 if(await button('Cancel placement in 3D').count())await button('Cancel placement in 3D').click();
 for(const width of [360,390,440,1440]){
  await page.setViewportSize({width,height:width===440?956:width<500?844:1000});await page.waitForTimeout(150);
  for(const name of ['Move items in 3D','Rotate items in 3D','Resize items in 3D','Pan map in 3D','Add item in 3D','Add label in 3D','Snap in 3D']){const control=await button(name).boundingBox();assert.ok(control&&control.x>=0&&control.x+control.width<=width&&control.height>=44,`${name} visible/tappable at ${width}`);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);assert.ok((await canvas().boundingBox()).height>=230);
  await button('Selected 3D item').click();bounds=await dialog.boundingBox();assert.ok(bounds.width<=width&&bounds.x>=0&&bounds.y>=0);await page.screenshot({path:`${out}/${width}-picker.png`});await button('Close item picker').click();await page.screenshot({path:`${out}/${width}-toolbar.png`});
 }
 check('360/390/440/1440: all tools and Snap are visible with 44px targets, no page overflow and useful canvas height');
 assert.deepEqual(report.pageErrors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack||String(error);process.exitCode=1;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,pageErrors:report.pageErrors}));await browser.close();}
