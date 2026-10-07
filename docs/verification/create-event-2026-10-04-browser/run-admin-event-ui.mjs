// Existing accounts only. Creates and removes its own new proposal; no existing-event writes.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const {chromium}=createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output='docs/verification/create-event-2026-10-04-browser/evidence';
const report={title:'QA browser create '+randomUUID().slice(0,8),id:null,cleaned:false,posterObjectCleaned:false,checks:[],errors:[]};
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=','base64');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
let page,user,adminClient,adminPage;
function assert(ok,message){if(!ok)throw new Error(message);}
function pass(name){report.checks.push({name,status:'PASS'});console.log('PASS '+name);}
async function row(){const r=await client.from('map_elements').select('id,metadata,updated_at').eq('id',report.id).single();assert(!r.error,r.error?.message);return r.data;}
async function waitSaved(locationIndex,kind){for(let attempt=0;attempt<25;attempt++){const r=await row();if(r.metadata.locations[locationIndex][kind].length)return;await page.waitForTimeout(400);}throw new Error('UI save did not persist '+kind);}
async function canvasClick(xFraction,yFraction){const canvas=page.getByLabel('Event layout canvas',{exact:true});const r=await canvas.boundingBox();await canvas.click({position:{x:r.width*xFraction,y:r.height*yFraction}});}
try{
  const login=await client.auth.signInWithPassword({email:env.VITE_DEMO_ORG_STUDENT_EMAIL,password:env.VITE_DEMO_ORG_STUDENT_PASSWORD});assert(!login.error,'Configured login failed');user=login.data.user;
  const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`,session:login.data.session});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/student/events');await page.getByRole('button',{name:'Create event',exact:true}).waitFor({timeout:60000});await page.getByRole('button',{name:'Create event',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();assert(await page.getByRole('alert').count()>0,'Missing title has no inline error');
  await page.getByLabel('Event title *',{exact:true}).fill(report.title);await page.locator('input[type=file]').setInputFiles({name:'qa-event-poster.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('checkbox',{name:/Campus Grounds/}).check();await page.getByRole('checkbox').nth(1).check();
  await page.screenshot({path:`${output}/create-two-locations.png`,fullPage:true});
  await page.getByRole('button',{name:'Create & design maps',exact:true}).click();await page.getByRole('button',{name:'Confirm & design',exact:true}).click();
  await page.waitForURL('**/student/events/*/edit',{timeout:60000});report.id=page.url().split('/').at(-2);
  let current=await row();assert(current.metadata.title===report.title&&current.metadata.createdByUserId===user.id&&current.metadata.locations.length===2&&current.metadata.posterUrl?.includes('/event_posters/'),'Wrong new proposal or poster missing');assert((await fetch(current.metadata.posterUrl)).ok,'Created poster is not publicly readable');pass('C01-C03 actual inline validation and two-location creation with uploaded poster');
  await page.getByRole('button',{name:'Skip tour',exact:true}).waitFor();await page.getByRole('button',{name:'Skip tour',exact:true}).click();
  // Use visible empty map space away from the palette and selection toolbar.
  await page.getByRole('button',{name:/Furniture$/}).click();await page.getByRole('button',{name:'Chair',exact:true}).click();await canvasClick(.04,.75);
  await page.getByRole('button',{name:'Save Draft',exact:true}).click();await waitSaved(0,'eventFurniture');
  await page.getByRole('button',{name:'Label',exact:true}).click();await canvasClick(.55,.8);await page.getByRole('button',{name:'Save Draft',exact:true}).click();await waitSaved(0,'eventLabels');
  report.afterGrounds=(await row()).metadata.locations.map(l=>({id:l.id,furniture:l.eventFurniture.length,labels:l.eventLabels.length}));
  assert(report.afterGrounds[0].furniture===1,'Grounds label/save erased its chair');
  const second=current.metadata.locations[1];await page.getByRole('button',{name:'Edit '+second.locationRef.label,exact:true}).click();
  await page.getByRole('button',{name:'Label',exact:true}).click();await canvasClick(.5,.5);await page.getByRole('button',{name:'Save Draft',exact:true}).click();await waitSaved(1,'eventLabels');
  report.afterFloor=(await row()).metadata.locations.map(l=>({id:l.id,furniture:l.eventFurniture.length,labels:l.eventLabels.length}));
  assert(report.afterFloor[0].furniture===1,'Floor save erased the other location chair');
  current=await row();const saved=JSON.stringify(current.metadata.locations);await page.reload();await page.getByRole('button',{name:'Review & submit',exact:true}).waitFor({timeout:60000});assert(JSON.stringify((await row()).metadata.locations)===saved,'Reload changed layouts');pass('E01-E02 actual chair/label placement, both locations saved and reloaded');
  await page.getByRole('button',{name:'Review & submit',exact:true}).click();await page.getByRole('button',{name:'Confirm submission',exact:true}).waitFor();assert(await page.getByRole('button',{name:'Confirm submission',exact:true}).isEnabled(),'Valid proposal unexpectedly blocked');await page.screenshot({path:`${output}/create-submission-review.png`,fullPage:true});await page.getByRole('button',{name:'Confirm submission',exact:true}).click();await page.waitForURL('**/student/events',{timeout:60000});current=await row();assert(current.metadata.status==='pending'&&JSON.stringify(current.metadata.locations)===saved,'Submission lost layouts');pass('J1 real UI creation/design/save/reload/submission segment');
  adminClient=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const adminLogin=await adminClient.auth.signInWithPassword({email:env.VITE_DEMO_ADMIN_EMAIL,password:env.VITE_DEMO_ADMIN_PASSWORD});assert(!adminLogin.error,'Admin login failed');
  const adminContext=await browser.newContext({viewport:{width:1440,height:900}});await adminContext.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`,session:adminLogin.data.session});adminPage=await adminContext.newPage();adminPage.on('pageerror',e=>report.errors.push(e.message));await adminPage.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts');await adminPage.getByText(report.title,{exact:true}).waitFor({timeout:60000});
  const adminCard=adminPage.getByText(report.title,{exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');await adminCard.getByRole('button',{name:'Open map preview',exact:true}).click();await adminPage.getByRole('button',{name:'Pan map',exact:true}).waitFor();await adminPage.getByRole('button',{name:'View '+second.locationRef.label,exact:true}).click();await adminPage.screenshot({path:`${output}/create-admin-second-map.png`,fullPage:true});assert((await adminPage.locator('body').innerText()).includes('1 labels'),'Second map label not shown to admin');pass('J1 admin previews the actual submitted second location');
  await adminPage.getByRole('button',{name:'Close map preview',exact:true}).click();
  // Closing this preview returns to the still-open Review Event Layout dialog.
  await adminPage.getByRole('button',{name:'Preview requested maps',exact:true}).click();
  await adminPage.getByRole('button',{name:'Pan map',exact:true}).waitFor();
  assert(await adminPage.getByText(report.title,{exact:true}).count()>0,'Nested review preview shows a different event');
  assert(await adminPage.getByRole('button',{name:'View '+second.locationRef.label,exact:true}).count()===1,'Nested preview is missing the submitted second location');
  await adminPage.screenshot({path:`${output}/same-event-review-preview.png`,fullPage:false});
  await adminPage.getByRole('button',{name:'Furniture summary',exact:true}).last().click();
  const summary=adminPage.getByRole('dialog',{name:'Event furniture summary',exact:true});
  const summaryText=await summary.innerText();
  assert(summaryText.includes('1 furniture · 2 labels · 2 locations')&&summaryText.includes('Chair'),'Furniture summary totals or named asset are incorrect: '+summaryText);
  await adminPage.screenshot({path:`${output}/furniture-summary-desktop.png`,fullPage:false});
  await adminPage.getByRole('button',{name:'Close furniture summary',exact:true}).click();
  await adminPage.getByRole('button',{name:'Close map preview',exact:true}).click();
  // Closing the nested requested-map preview returns to the still-open review dialog.
  const startsTime=adminPage.getByRole('button',{name:/Event starts time:/});
  await startsTime.scrollIntoViewIfNeeded();
  await startsTime.click();
  await adminPage.getByRole('button',{name:'Minute 00',exact:true}).click();
  await adminPage.getByRole('button',{name:'Hour 12',exact:true}).click();
  await adminPage.getByRole('button',{name:'AM',exact:true}).click();
  await adminPage.getByRole('button',{name:'Done',exact:true}).click();
  assert((await startsTime.innerText()).includes('12:00 AM'),'12 AM conversion failed');
  await startsTime.click();
  await adminPage.getByRole('button',{name:'Minute 59',exact:true}).click();
  await adminPage.getByRole('button',{name:'Hour 12',exact:true}).click();
  await adminPage.getByRole('button',{name:'PM',exact:true}).click();
  await adminPage.screenshot({path:`${output}/time-picker-desktop.png`,fullPage:false});
  await adminPage.getByRole('button',{name:'Done',exact:true}).click();
  assert((await startsTime.innerText()).includes('12:59 PM'),'12:59 PM conversion failed');
  await adminPage.setViewportSize({width:390,height:844});
  await startsTime.scrollIntoViewIfNeeded();
  await startsTime.click();
  await adminPage.getByRole('button',{name:'Minute 59',exact:true}).click();
  await adminPage.getByRole('button',{name:'Hour 11',exact:true}).click();
  await adminPage.getByRole('button',{name:'PM',exact:true}).click();
  await adminPage.screenshot({path:`${output}/time-picker-mobile.png`,fullPage:false});
  await adminPage.getByRole('button',{name:'Done',exact:true}).click();
  assert((await startsTime.innerText()).includes('11:59 PM'),'11:59 PM conversion failed');
  await adminPage.getByRole('button',{name:'Cancel',exact:true}).click();
  if(await adminPage.getByRole('alertdialog').count()) await adminPage.getByRole('button',{name:'Discard review',exact:true}).click();
  current=await row();assert(current.metadata.status==='pending','Admin preview/schedule inspection persisted a review decision');
  pass('A02 same-event preview parity, A06 event-only named furniture summary, T01 midnight/noon/minute59 desktop/mobile, review discarded');
  const ownerCard=page.locator('article').filter({has:page.getByText(report.title,{exact:true})});await ownerCard.getByRole('button',{name:'Withdraw submission',exact:true}).click();await page.getByRole('button',{name:'Keep submitted',exact:true}).click();assert((await row()).metadata.status==='pending','Canceled withdrawal changed event');await ownerCard.getByRole('button',{name:'Withdraw submission',exact:true}).click();await page.getByRole('button',{name:'Withdraw to draft',exact:true}).click();await page.getByRole('alertdialog',{name:'Withdraw submission?',exact:true}).waitFor({state:'hidden'});current=await row();assert(current.metadata.status==='draft'&&JSON.stringify(current.metadata.locations)===saved,'Withdrawal lost saved maps');pass('L03 browser cancel/confirm withdrawal preserves both layouts');
}catch(e){report.failure=e.message;if(page){report.screen=await page.locator('body').innerText();await page.screenshot({path:`${output}/create-browser-failure.png`,fullPage:true});}if(adminPage){report.adminScreen=await adminPage.locator('body').innerText();await adminPage.screenshot({path:`${output}/create-admin-failure.png`,fullPage:true});}console.log('FAIL '+e.message);process.exitCode=1;}
finally{
  // If navigation failed after creation, find only this run's exact unique title + owner.
  if(!report.id&&user){const found=await client.from('map_elements').select('id').eq('name',report.title).eq('metadata->>createdByUserId',user.id);if(found.data?.length===1)report.id=found.data[0].id;}
  let posterPath=null;
  if(report.id&&user){try{let current=await row();if(current.metadata.title===report.title&&current.metadata.createdByUserId===user.id){if(current.metadata.posterUrl){const marker='/object/public/event_posters/';const pathname=new URL(current.metadata.posterUrl).pathname;posterPath=decodeURIComponent(pathname.slice(pathname.indexOf(marker)+marker.length));}if(current.metadata.status==='pending'){await client.rpc('withdraw_event_submission',{p_overlay_id:report.id,p_expected_updated_at:current.updated_at});current=await row();}if(['draft','disapproved'].includes(current.metadata.status)){const d=await client.from('map_elements').delete().eq('id',report.id).select('id');report.cleaned=!d.error&&d.data?.some(r=>r.id===report.id);}}}catch(e){report.cleanupError=e.message;}}
  if(report.cleaned&&posterPath){try{const removed=await client.storage.from('event_posters').remove([posterPath]);if(removed.error)throw removed.error;const files=await client.storage.from('event_posters').list(user.id,{search:posterPath.split('/').at(-1)});if(files.error)throw files.error;report.posterObjectCleaned=!files.data?.some(file=>file.name===posterPath.split('/').at(-1));}catch(e){report.posterCleanupError=e.message;}}
  await browser.close();await client.auth.signOut({scope:'local'});if(adminClient)await adminClient.auth.signOut({scope:'local'});fs.writeFileSync(`${output}/create-browser.json`,JSON.stringify(report,null,2));console.log('Fixture cleaned='+report.cleaned);
}
