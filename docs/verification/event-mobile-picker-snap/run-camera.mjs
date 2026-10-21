import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`));}
const out='docs/verification/event-mobile-picker-snap/camera-evidence';fs.mkdirSync(out,{recursive:true});
const report={status:'RUNNING',checks:[],poses:[],pageErrors:[],liveDataWrites:false};
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true});context.setDefaultTimeout(15000);
await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
const page=await context.newPage();let fiberUrl;
page.on('request',request=>{if(/\/@react-three_fiber\.js/.test(request.url()))fiberUrl=request.url();});page.on('pageerror',error=>report.pageErrors.push(error.message));
const button=name=>page.getByRole('button',{name,exact:true});const canvas=()=>page.getByRole('region',{name:'Event 3D editor'}).locator('canvas');
const check=name=>{report.checks.push(name);console.log(name);};
async function enter3D(){await button('3D layout').click();await canvas().waitFor({state:'visible'});await page.waitForTimeout(700);}
async function pose(){assert.ok(fiberUrl,'renderer module observed');return page.evaluate(async url=>{const fiber=await import(url);const element=document.querySelector('[aria-label="Event 3D editor"] canvas');const state=fiber._roots.get(element).store.getState();return{position:state.camera.position.toArray(),target:state.controls.target.toArray(),zoom:state.camera.zoom};},fiberUrl);}
function same(before,after){for(const key of ['position','target'])for(let i=0;i<3;i++)assert.ok(Math.abs(before[key][i]-after[key][i])<.005,`${key}[${i}]: ${before[key][i]} → ${after[key][i]}`);assert.equal(after.zoom,before.zoom);}
async function roundTrip(label){const before=await pose();await page.evaluate(async url=>{const fiber=await import(url);const element=document.querySelector('[aria-label="Event 3D editor"] canvas');const root=fiber._roots.get(element);const stack=[root.fiber.current];while(stack.length){const node=stack.pop();if(node?.type?.name==="EventPreviewCamera"){window.cameraRoundTripSession=node.memoizedProps.session;return;}if(node?.child)stack.push(node.child);if(node?.sibling)stack.push(node.sibling);}throw Error("Camera session missing");},fiberUrl);await page.screenshot({path:`${out}/${label}-before.png`});await button('2D layout').click();const captured=await page.evaluate(()=>window.cameraRoundTripSession.current);await enter3D();const after=await pose();same(captured,after);report.poses.push({label,before,capturedAtUnmount:captured,after});await page.screenshot({path:`${out}/${label}-after.png`});}
try{
 await page.goto('http://127.0.0.1:5173/docs/verification/event-editor-consistent-tools/fixture/index.html',{waitUntil:'domcontentloaded',timeout:60000});
 for(const map of ['Campus grounds','COED floor']){
  await button(map).click();await enter3D();const initial=await pose();await button('Zoom in in 3D').click();await button('Zoom in in 3D').click();
  const box=await canvas().boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.65;
  await page.mouse.move(x,y);await page.mouse.down({button:'right'});await page.mouse.move(x+90,y-25,{steps:8});await page.mouse.up({button:'right'});
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+45,y+20,{steps:8});await page.mouse.up();await page.waitForTimeout(1200);
  assert.notDeepEqual(await pose(),initial);await roundTrip(map==='Campus grounds'?'outdoor':'indoor');check(`${map}: actual zoom, native orbit and pan survive 3D → 2D → 3D`);
  await button('Fit map in 3D').click();await page.waitForTimeout(500);assert.notDeepEqual(await pose(),report.poses.at(-1).before);await roundTrip(map==='Campus grounds'?'outdoor-fit':'indoor-fit');check(`${map}: explicit Fit still works and its new view survives the next round trip`);
  if(map==='COED floor'){
   await button('Add item in 3D').click();await button('Choose Chair').click();await button('Place here in 3D').click();await button('Focus selection in 3D').click();await page.waitForTimeout(500);await roundTrip('indoor-focus');check('Explicit Focus remains functional and selection/view are retained');
  }
  await button('2D layout').click();
 }
 await page.setViewportSize({width:390,height:844});await enter3D();await button('Zoom in in 3D').click();await page.waitForTimeout(500);await roundTrip('mobile');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);check('390px phone viewport restores the same 3D camera without overflow');
 assert.deepEqual(report.pageErrors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack||String(error);process.exitCode=1;await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,pageErrors:report.pageErrors}));await browser.close();}
