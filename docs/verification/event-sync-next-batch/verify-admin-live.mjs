// Real Org UI submission -> real Admin badges/read sync -> owned QA cleanup.
// Event writes are restricted to this run's single draft; approval/publication
// commands are blocked. Independent Admin contexts share only hosted receipts.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const out='docs/verification/event-sync-next-batch/admin-live-evidence';fs.mkdirSync(out,{recursive:true});
const resultPath=`${out}/results.json`;
const previous=fs.existsSync(resultPath)?JSON.parse(fs.readFileSync(resultPath,'utf8')):null;
const report={mode:'Actual live Org submission and Admin desktop/mobile receipt sync; no approval; QA deleted afterward',title:`QA Admin Badge Sync ${randomUUID().slice(0,8)}`,eventId:null,checks:[],pageErrors:[],endpointErrors:[],blockedWrites:[],ackCount:0,cleanup:false,status:'RUNNING'};
const save=()=>fs.writeFileSync(resultPath,JSON.stringify(report,null,2));
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);save();console.log(`PASS ${label}`);};
const makeClient=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const orgApi=makeClient(),adminApi=makeClient();
let orgIdentity,adminIdentity,browser,orgPage,adminA,adminB;
const readRpc=new Set(['get_admin_activity_clear_cutoff','get_event_notification_states','list_event_safe_published_campuses','list_coming_soon_campuses','list_published_event_previews','list_event_revisions']);
const signIn=async(client,prefix)=>{const {data,error}=await client.auth.signInWithPassword({email:env[`${prefix}_EMAIL`],password:env[`${prefix}_PASSWORD`]});assert.ok(!error&&data.session,'Configured demo sign-in unavailable');return data;};
async function readFixture(id=report.eventId){const {data,error}=await orgApi.from('map_elements').select('id,campus_id,name,metadata,updated_at').eq('id',id).maybeSingle();assert.ifError(error);return data;}
function owned(row,title){assert.ok(row&&row.metadata.title===title&&row.metadata.createdByUserId===orgIdentity.user.id,'QA cleanup ownership/title check failed');assert.ok(['draft','pending','disapproved'].includes(row.metadata.status),'QA cleanup cannot touch approved events');}
async function cleanupApi(id,title){
  let row=await readFixture(id);if(!row)return;
  owned(row,title);
  if(row.metadata.status==='pending'){
    const {error}=await orgApi.rpc('withdraw_event_submission',{p_overlay_id:id,p_expected_updated_at:row.updated_at});assert.ifError(error);
    row=await readFixture(id);owned(row,title);assert.equal(row.metadata.status,'draft');
  }
  const removed=await orgApi.from('map_elements').delete().eq('id',id).eq('element_type','event_overlay');assert.ifError(removed.error);assert.equal(await readFixture(id),null);
}
async function pageFor(identity,path,viewport){
  const context=await browser.newContext({viewport,hasTouch:viewport.width<768});
  const key=`sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key,session:identity.session});
  await context.route('**/rest/v1/**',route=>{
    const req=route.request(),url=new URL(req.url()),rpc=url.pathname.split('/rpc/')[1],isOrg=identity.user.id===orgIdentity.user.id;
    if(['GET','HEAD'].includes(req.method())||readRpc.has(rpc))return route.continue();
    const body=req.postDataJSON();
    if(rpc==='ack_event_notification'&&identity.user.id===adminIdentity.user.id&&body.p_expected_user_id===adminIdentity.user.id&&body.p_event_id===report.eventId&&body.p_stream==='admin_submission'){report.ackCount++;return route.continue();}
    if(isOrg&&rpc==='withdraw_event_submission'&&body.p_overlay_id===report.eventId)return route.continue();
    if(isOrg&&url.pathname.endsWith('/map_elements')){
      if(req.method()==='POST'&&body.metadata?.title===report.title&&body.metadata.createdByUserId===orgIdentity.user.id&&body.metadata.status==='draft'){
        assert.ok(!report.eventId||report.eventId===body.id,'Creation attempted a second fixture');report.eventId=body.id;save();return route.continue();
      }
      if(url.searchParams.get('id')===`eq.${report.eventId}`){
        if(req.method()==='DELETE')return route.continue();
        if(req.method()==='PATCH'&&body.metadata?.title===report.title&&body.metadata.createdByUserId===orgIdentity.user.id&&['draft','pending'].includes(body.metadata.status))return route.continue();
      }
    }
    if(isOrg&&url.pathname.endsWith('/activity_logs')&&body.entity_id===report.eventId&&body.entity_type==='event_overlay')return route.continue();
    report.blockedWrites.push({method:req.method(),path:url.pathname});save();return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('dialog',dialog=>{if(dialog.type()==='beforeunload')void dialog.accept();});
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(response.status()>=400&&/get_event_notification_states|ack_event_notification|get_admin_activity_clear_cutoff|admin_activity_preferences/.test(path))report.endpointErrors.push({status:response.status(),path});});
  await page.goto(`http://localhost:5173${path}`,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
  return page;
}
const focus=async page=>{await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));};
const notice=page=>page.getByRole('button',{name:`Review ${report.title}`,exact:true});
const badgeCount=async page=>Number((await page.getByTestId('admin-notification-unread').textContent().catch(()=> '0'))||0);
async function shot(page,name){await page.screenshot({path:`${out}/${name}.png`});}
async function cleanupUi(){
  if(!report.eventId)return;
  let row=await readFixture();if(!row){report.cleanup=true;return;}
  owned(row,report.title);
  await orgPage.goto('http://localhost:5173/student/events',{waitUntil:'networkidle'});
  const card=orgPage.getByTestId(`org-event-card-${report.eventId}`);await card.waitFor();
  if(row.metadata.status==='pending'){
    await card.getByRole('button',{name:'Withdraw submission',exact:true}).click();
    await orgPage.getByRole('alertdialog',{name:'Withdraw submission?',exact:true}).getByRole('button',{name:'Withdraw to draft',exact:true}).click();
    await card.getByRole('button',{name:'Delete',exact:true}).waitFor();row=await readFixture();owned(row,report.title);assert.equal(row.metadata.status,'draft');
  }
  await card.getByRole('button',{name:'Delete',exact:true}).click();
  await orgPage.getByRole('dialog').getByRole('button',{name:'Delete event',exact:true}).click();
  await card.waitFor({state:'detached'});assert.equal(await readFixture(),null);report.cleanup=true;save();
}
try{
  orgIdentity=await signIn(orgApi,'VITE_DEMO_ORG_STUDENT');adminIdentity=await signIn(adminApi,'VITE_DEMO_ADMIN');
  assert.notEqual(adminIdentity.user.user_metadata?.admin_notification_preferences?.events,false,'Admin event notification preference is disabled');
  if(previous?.eventId&&!previous.cleanup){await cleanupApi(previous.eventId,previous.title);console.log('Previous incomplete QA fixture cleaned before retry');}
  save();
  const prior=await adminApi.from('map_elements').select('id,metadata,updated_at').or('element_type.eq.event_overlay,metadata->>kind.eq.event_overlay').is('archived_at',null);assert.ifError(prior.error);
  const baseline=prior.data.filter(row=>row.metadata.status==='pending').length;
  report.baselinePending=baseline;save();
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const anchor=await browser.newContext();await anchor.newPage();
  adminA=await pageFor(adminIdentity,'/admin-dashboard/event-layouts',{width:1440,height:900});
  adminB=await pageFor(adminIdentity,'/admin-dashboard/event-layouts',{width:390,height:844});
  await adminA.getByRole('button',{name:'Notifications',exact:true}).click();await adminB.getByRole('button',{name:'Notifications',exact:true}).click();
  orgPage=await pageFor(orgIdentity,'/student/events',{width:1440,height:900});
  await orgPage.getByRole('button',{name:'Create event',exact:true}).click();
  const create=orgPage.getByRole('dialog',{name:'Create event proposal'});await create.waitFor();
  await create.getByLabel('Event title *',{exact:true}).fill(report.title);await create.getByLabel('Description',{exact:true}).fill('Temporary pending-only QA for Admin notification sync; withdrawn and deleted after verification.');
  const organizer=create.getByLabel(/Organization name/i);if(await organizer.count())await organizer.fill('QA Admin Sync Test');
  await create.getByRole('button',{name:'Continue',exact:true}).click();
  await orgPage.getByTestId('event-location-picker').getByRole('checkbox',{name:'Campus Grounds',exact:true}).check();
  await orgPage.getByRole('button',{name:'Create & design maps',exact:true}).click();
  await orgPage.getByRole('alertdialog',{name:'Review event proposal'}).getByRole('button',{name:'Confirm & design',exact:true}).click();
  await orgPage.waitForURL('**/student/events/*/edit');assert.equal(orgPage.url().split('/').at(-2),report.eventId);
  const draft=await readFixture();owned(draft,report.title);assert.equal(draft.metadata.status,'draft');check(true,'Student Org created one owned temporary draft through the UI');
  const skip=orgPage.getByRole('button',{name:'Skip tour',exact:true});await skip.first().waitFor({timeout:3000}).catch(()=>{});
  for(let i=0;i<10;i++){let clicked=false;for(let n=0;n<await skip.count();n++){if(await skip.nth(n).isVisible()){await skip.nth(n).click();clicked=true;break;}}if(!clicked)break;}
  await orgPage.getByRole('button',{name:'Furniture',exact:true}).click();await orgPage.getByRole('button',{name:'Chair',exact:true}).click();
  const canvas=orgPage.getByLabel('Event layout canvas',{exact:true});const box=await canvas.boundingBox();assert.ok(box);await canvas.click({position:{x:box.width*.52,y:box.height*.72}});
  await orgPage.getByRole('button',{name:'Save Draft',exact:true}).click();await orgPage.getByText('Draft saved',{exact:true}).waitFor();
  await orgPage.getByRole('button',{name:'Review & submit',exact:true}).click();
  const submission=orgPage.getByRole('dialog',{name:'Review before submitting'});await submission.waitFor();
  const confirm=submission.getByRole('button',{name:'Confirm submission',exact:true});assert.ok(await confirm.isEnabled(),await submission.innerText());
  await confirm.click();await orgPage.waitForURL('**/student/events');
  const pending=await readFixture();owned(pending,report.title);assert.equal(pending.metadata.status,'pending');check(true,'Saved layout submitted to the real GSO queue without approval');
  await focus(adminA);await notice(adminA).waitFor();await focus(adminB);await notice(adminB).waitFor();
  check(await notice(adminA).locator('span.bg-red-600').count()===1,'Desktop notification shows a new submission red mark');
  check(await notice(adminB).locator('span.bg-red-600').count()===1,'Mobile independent session shows the same unread red mark');
  const unreadBefore=await badgeCount(adminB);check(unreadBefore>0,'Admin bell number badge includes the new submission');
  await shot(adminA,'01-desktop-new-submission');await shot(adminB,'02-mobile-new-submission');
  await notice(adminA).click();const review=adminA.getByRole('dialog',{name:'Review Event Layout'});await review.getByText(report.title,{exact:true}).waitFor();
  const qaCard=adminA.locator('h3').filter({hasText:report.title}).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await qaCard.getByText('New submission',{exact:true}).waitFor({state:'hidden'});
  await review.getByRole('button',{name:'Cancel',exact:true}).click();
  await focus(adminB);await adminB.waitForFunction(title=>{const button=[...document.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===`Review ${title}`);return button&&!button.querySelector('span.bg-red-600');},report.title);
  check(await badgeCount(adminB)===unreadBefore-1,'Read acknowledgement clears exactly one bell badge count on the other session');
  check(report.ackCount===1,'One acknowledgement reached the real hosted Admin RPC');
  check(await adminB.evaluate(id=>localStorage.getItem(`plv-admin-event-submissions:${id}`)===null,adminIdentity.user.id),'Second session has no browser-local Admin receipt');
  const receipts=await adminApi.from('event_notification_receipts').select('event_id,stream').eq('event_id',report.eventId);assert.ifError(receipts.error);assert.deepEqual(receipts.data.map(row=>row.stream),['admin_submission']);check(true,'Read status is stored in the hosted private receipt table');
  assert.deepEqual(await readFixture(),pending);check(true,'Reading the notification leaves proposal metadata and revision unchanged');
  await adminA.getByRole('link',{name:new RegExp(`Event Layouts, ${baseline+1} pending review`)}).waitFor();
  await adminB.getByRole('button',{name:'Notifications',exact:true}).click();await adminB.getByText(new RegExp(`^${baseline+1} Pending Reviews?$`)).waitFor();check(true,'Desktop sidebar and mobile queue retain pending-review count after reading');
  await shot(adminB,'03-mobile-read-pending-count');await adminB.reload({waitUntil:'networkidle'});await adminB.getByRole('button',{name:'Notifications',exact:true}).click();await notice(adminB).waitFor();check(await notice(adminB).locator('span.bg-red-600').count()===0,'Admin server read mark survives mobile reload');
  await cleanupUi();check(report.cleanup,'QA submission withdrawn and draft deleted through Student Org UI');
  const remaining=await adminApi.from('event_notification_receipts').select('event_id').eq('event_id',report.eventId);assert.ifError(remaining.error);check(remaining.data.length===0,'QA receipt removed with the deleted event');
  await focus(adminA);await adminA.getByText(report.title,{exact:true}).waitFor({state:'hidden'});await focus(adminB);await notice(adminB).waitFor({state:'hidden'});check(true,'Deleted QA event removed from both Admin queues');
  const after=await adminApi.from('map_elements').select('id,metadata,updated_at').or('element_type.eq.event_overlay,metadata->>kind.eq.event_overlay').is('archived_at',null);assert.ifError(after.error);
  assert.deepEqual(after.data.sort((a,b)=>a.id.localeCompare(b.id)),prior.data.sort((a,b)=>a.id.localeCompare(b.id)));check(true,'All pre-existing event metadata and revisions remain unchanged');
  check(report.pageErrors.length===0,'No browser page errors');check(report.endpointErrors.length===0,'No notification or activity endpoint errors');check(report.blockedWrites.length===0,'No unexpected or approval/publication write attempted');report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.message;console.error(error.message);if(orgPage)await shot(orgPage,'failure-org').catch(()=>{});if(adminB)await shot(adminB,'failure-admin').catch(()=>{});process.exitCode=1;}
finally{
  if(report.eventId&&!report.cleanup&&orgIdentity){
    try{await cleanupUi();}catch(error){report.uiCleanupError=error.message;try{await cleanupApi(report.eventId,report.title);report.cleanup=true;report.cleanupFallback='Exact owned QA record API fallback';}catch(cleanupError){report.cleanupError=cleanupError.message;process.exitCode=1;}}
  }
  save();if(browser)await browser.close();
}
