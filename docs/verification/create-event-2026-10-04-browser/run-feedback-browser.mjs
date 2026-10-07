// Explicitly authorized existing-account QA; every mutation is confined to this run's UUID.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const {chromium}=createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output='docs/verification/create-event-2026-10-04-browser/evidence/feedback-recheck-main';
fs.mkdirSync(output,{recursive:true});
const report={id:randomUUID(),created:false,cleaned:false,checks:[],errors:[]};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
function assert(ok,message){if(!ok)throw new Error(message);}
function pass(name){report.checks.push({name,status:'PASS'});console.log('PASS '+name);}
async function login(prefix){const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const r=await client.auth.signInWithPassword({email:env[prefix+'_EMAIL'],password:env[prefix+'_PASSWORD']});assert(!r.error,'Configured login failed');return {client,...r.data};}
let org,admin,activePage;
async function row(){const r=await org.client.from('map_elements').select('id,metadata,updated_at').eq('id',report.id).single();assert(!r.error,'Fixture read failed');return r.data;}
async function pageFor(identity,route){const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`,session:identity.session});const page=await context.newPage();activePage=page;page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:5173'+route);return page;}
try {
  org=await login('VITE_DEMO_ORG_STUDENT');admin=await login('VITE_DEMO_ADMIN');
  const versions=await org.client.from('campus_versions').select('campus_id').eq('state','published').limit(1);assert(versions.data?.length,'Published campus unavailable');
  const locations=[{id:'qa-grounds',locationRef:{type:'campus',label:'Campus Grounds'},eventFurniture:[{id:'qa-booth',type:'booth',name:'QA booth',category:'event',x:30,y:30,width:30,height:30,rotation:0,color:'#123456',layer:'events'}],eventLabels:[]}];
  const metadata={id:report.id,kind:'event_overlay',title:'QA browser feedback '+report.id.slice(0,8),organizer:'QA existing Student Org',description:'Disposable authorized browser verification',createdByUserId:org.user.id,status:'draft',isActive:true,locations,locationRef:locations[0].locationRef,eventFurniture:locations[0].eventFurniture,eventLabels:[],markers:[],restrictedAreas:[]};
  const inserted=await org.client.from('map_elements').insert({id:report.id,campus_id:versions.data[0].campus_id,element_type:'event_overlay',name:metadata.title,x:0,y:0,metadata,is_visible:true,is_searchable:false,is_accessible:false,is_emergency_asset:false,z_index:0,rotation:0,search_keywords:[],style:{}});assert(!inserted.error,inserted.error?.message);report.created=true;
  let current=await row();const submit=await org.client.from('map_elements').update({metadata:{...current.metadata,status:'pending',submittedAt:new Date().toISOString()}}).eq('id',report.id).eq('updated_at',current.updated_at);assert(!submit.error,submit.error?.message);current=await row();
  const initialAdmin=await pageFor(admin,'/admin-dashboard/event-layouts');await initialAdmin.getByText(metadata.title,{exact:true}).waitFor();
  const initialCard=initialAdmin.getByText(metadata.title,{exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');await initialCard.getByRole('button',{name:'Review submission',exact:true}).click();await initialAdmin.getByRole('button',{name:'Preview requested maps',exact:true}).click();
  const reviewCanvas=initialAdmin.getByLabel('Event layout canvas',{exact:true});await reviewCanvas.waitFor();const canvasBox=await reviewCanvas.boundingBox();
  for(const [i,comment] of ['QA clear the entrance','QA verify booth clearance'].entries()){await initialAdmin.getByRole('button',{name:'Add pin',exact:true}).click();await reviewCanvas.click({position:{x:canvasBox.width*(.35+i*.2),y:canvasBox.height*.5}});await initialAdmin.getByLabel('Pin comment',{exact:true}).fill(comment);await initialAdmin.getByRole('button',{name:'Save pin',exact:true}).click();}
  assert(!Object.keys((await row()).metadata.locationFeedback??{}).length,'Staging pins changed persisted review prematurely');await initialAdmin.getByRole('button',{name:'Close map preview',exact:true}).click();await initialAdmin.getByLabel(/Admin Comment/).fill('QA address both issues');await initialAdmin.getByRole('button',{name:'Disapprove',exact:true}).click();
  for(let n=0;n<30;n++){current=await row();if(current.metadata.status==='disapproved')break;await initialAdmin.waitForTimeout(300);}assert(current.metadata.status==='disapproved','Admin UI decision not saved');
  const feedback=current.metadata.locationFeedback['qa-grounds'];const savedPins=JSON.parse(feedback.slice('@event-feedback/v1:'.length)).pins;assert(savedPins.length===2,'Admin decision lost pins');const firstPin=savedPins[0].id,secondPin=savedPins[1].id;pass('F01-F03 actual admin UI stages two pins and persists them only with review decision');
  const page=await pageFor(org,`/student/events/${report.id}/edit`);
  await page.getByRole('button',{name:'Skip tour',exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'Skip tour',exact:true}).click();
  await page.getByRole('button',{name:'Review & submit',exact:true}).waitFor({timeout:60000});
  const checklist=page.locator('[data-feedback-checklist]');await checklist.locator('summary').click();
  await page.getByRole('button',{name:'Show pin 1 on map',exact:true}).click();
  await page.getByLabel('Resolution note for pin 1 in qa-grounds',{exact:true}).fill('QA entrance checked and clear');
  await page.getByRole('button',{name:'Mark as addressed',exact:true}).first().click();
  await page.getByRole('button',{name:'Reopen issue',exact:true}).waitFor();
  assert((await row()).metadata.feedbackResolutions['qa-grounds'][firstPin].note==='QA entrance checked and clear','UI acknowledgement did not persist');pass('F04 browser note and acknowledgement persisted');
  await page.getByRole('button',{name:'Review & submit',exact:true}).click();
  assert(await page.getByRole('dialog',{name:'Review before submitting',exact:true}).count()===0,'Open issue bypasses submission gate');
  assert((await row()).metadata.status==='disapproved','Blocked UI submit changed event');pass('J3 one remaining open pin blocks browser resubmission');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:`${output}/feedback-editor-mobile.png`,fullPage:true});
  await page.getByLabel('Resolution note for pin 2 in qa-grounds',{exact:true}).fill('QA booth clearance checked');
  await page.getByRole('button',{name:'Mark as addressed',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-feedback-checklist] summary')?.textContent?.includes('2/2'));
  await page.reload();await page.getByRole('button',{name:'Review & submit',exact:true}).waitFor({timeout:60000});
  assert((await checklist.locator('summary').innerText()).includes('2/2'),'Reload lost resolution state');
  await page.getByRole('button',{name:'Review & submit',exact:true}).click();
  await page.getByRole('dialog',{name:'Review before submitting',exact:true}).waitFor();
  await page.screenshot({path:`${output}/feedback-submission-mobile.png`,fullPage:true});
  await page.getByRole('button',{name:'Confirm submission',exact:true}).click();
  await page.waitForURL('**/student/events',{timeout:60000});current=await row();
  assert(current.metadata.status==='pending'&&Object.keys(current.metadata.feedbackResolutions['qa-grounds']).length===2&&current.metadata.locationFeedback['qa-grounds']===feedback,'Resubmission lost evidence');pass('J3 mobile acknowledgement, reload and resubmission preserve both pins');
  const adminPage=await pageFor(admin,'/admin-dashboard/event-layouts');
  await adminPage.getByText(metadata.title,{exact:true}).waitFor({timeout:60000});
  const card=adminPage.locator('article').filter({has:adminPage.getByText(metadata.title,{exact:true})});
  const target=await card.count()?card:adminPage.getByText(metadata.title,{exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await target.getByRole('button',{name:'Review submission',exact:true}).click();
  await adminPage.getByText(/Student note: QA entrance checked and clear/).waitFor();
  await adminPage.screenshot({path:`${output}/feedback-admin-review.png`,fullPage:true});pass('J3 admin sees persisted student notes after resubmission');
  // Two independent owner browser contexts retain the same initial pending version.
  const ownerA=await pageFor(org,`/student/events/${report.id}/edit`);
  const ownerB=await pageFor(org,`/student/events/${report.id}/edit`);
  for(const p of [ownerA,ownerB]){await p.getByRole('button',{name:'Skip tour',exact:true}).waitFor();await p.getByRole('button',{name:'Skip tour',exact:true}).click();await p.getByRole('button',{name:'Save Draft',exact:true}).waitFor();}
  const original=await row();
  async function label(p,x){await p.getByRole('button',{name:'Label',exact:true}).click();const canvas=p.getByLabel('Event layout canvas',{exact:true});const box=await canvas.boundingBox();await canvas.click({position:{x:box.width*x,y:box.height*.8}});}
  await label(ownerA,.55);await ownerA.getByRole('button',{name:'Save Draft',exact:true}).click();
  for(let n=0;n<40;n++){current=await row();if(current.updated_at!==original.updated_at)break;await ownerA.waitForTimeout(250);}
  assert(current.updated_at!==original.updated_at&&current.metadata.status==='pending'&&current.metadata.submittedAt===original.metadata.submittedAt,'Pending browser save changed submission state');
  const persisted=JSON.stringify(current.metadata.locations);
  await label(ownerB,.7);await ownerB.getByRole('button',{name:'Save Draft',exact:true}).click();await ownerB.waitForTimeout(1500);
  assert(JSON.stringify((await row()).metadata.locations)===persisted,'Older browser erased newer map');
  const stale=await admin.client.rpc('review_event_layout',{p_overlay_id:report.id,p_expected_updated_at:original.updated_at,p_decision:'disapproved',p_date_start:null,p_date_end:null,p_publication_mode:'now',p_publication_at:null,p_admin_comment:'QA stale',p_location_feedback:{'qa-grounds':feedback}});assert(stale.error,'Old admin review accepted');pass('J2 two owner browsers and stale admin decision preserve newest pending layout/submittedAt');
  // A later feedback round changes the original comment and invalidates claims.
  current=await row();const changed=feedback.replace('QA clear the entrance','QA clear the entrance again');
  const later=await admin.client.rpc('review_event_layout',{p_overlay_id:report.id,p_expected_updated_at:current.updated_at,p_decision:'disapproved',p_date_start:null,p_date_end:null,p_publication_mode:'now',p_publication_at:null,p_admin_comment:'QA second review round',p_location_feedback:{'qa-grounds':changed}});assert(!later.error,later.error?.message);
  await ownerA.reload();await ownerA.getByRole('button',{name:'Review & submit',exact:true}).waitFor();const issues=ownerA.locator('[data-feedback-checklist]');await issues.locator('summary').click();assert((await issues.innerText()).includes('0/2'),'Changed feedback retained stale addressed state');
  await ownerA.getByLabel('Resolution note for pin 1 in qa-grounds',{exact:true}).fill('QA retry note retained');const beforeFailedAck=JSON.stringify((await row()).metadata.feedbackResolutions);let failAck=true;
  await ownerA.route('**/rest/v1/rpc/set_event_feedback_pin_addressed',route=>{if(failAck){failAck=false;return route.fulfill({status:503,json:{message:'QA acknowledgement unavailable'}});}return route.continue();});
  await ownerA.getByRole('button',{name:'Mark as addressed',exact:true}).first().click();await ownerA.getByText(/QA acknowledgement unavailable/).first().waitFor();assert(await ownerA.getByLabel('Resolution note for pin 1 in qa-grounds',{exact:true}).inputValue()==='QA retry note retained','Failed acknowledgement lost note');assert(JSON.stringify((await row()).metadata.feedbackResolutions)===beforeFailedAck,'Failed acknowledgement changed persisted resolutions');
  const acknowledge=ownerA.getByRole('button',{name:'Mark as addressed',exact:true}).first();await acknowledge.focus();await ownerA.keyboard.press('Enter');await ownerA.getByRole('button',{name:'Reopen issue',exact:true}).waitFor();assert((await row()).metadata.feedbackResolutions['qa-grounds'][firstPin].note==='QA retry note retained','Retry lost note');
  await ownerA.getByRole('button',{name:'Reopen issue',exact:true}).click();await ownerA.waitForFunction(()=>document.querySelector('[data-feedback-checklist] summary')?.textContent?.includes('0/2'));assert(!(await row()).metadata.feedbackResolutions?.['qa-grounds']?.[firstPin],'Browser reopen failed');pass('J4 later feedback invalidates claims; acknowledgement failure retains note; keyboard retry and reopen persist');
}catch(e){report.failure=e.message;if(activePage){report.screen=await activePage.locator('body').innerText();await activePage.screenshot({path:`${output}/feedback-browser-failure.png`,fullPage:true});}console.log('FAIL '+e.message);process.exitCode=1;}
finally{
  if(report.created&&org){try{let current=await row();if(current.metadata.status==='pending'){await org.client.rpc('withdraw_event_submission',{p_overlay_id:report.id,p_expected_updated_at:current.updated_at});current=await row();}if(['draft','disapproved'].includes(current.metadata.status)&&current.metadata.createdByUserId===org.user.id&&current.metadata.title.startsWith('QA browser feedback ')){const removed=await org.client.from('map_elements').delete().eq('id',report.id).select('id');report.cleaned=!removed.error&&removed.data?.some(r=>r.id===report.id);}}catch(e){report.cleanupError=e.message;}}
  await browser.close();if(org)await org.client.auth.signOut({scope:'local'});if(admin)await admin.client.auth.signOut({scope:'local'});fs.writeFileSync(`${output}/feedback-browser.json`,JSON.stringify(report,null,2));console.log('Fixture cleaned='+report.cleaned);
}
