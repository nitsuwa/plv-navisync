// Existing Org only; intercept failures for this run's disposable proposal.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const {chromium}=createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out='docs/verification/create-event-2026-10-04-browser/evidence';
const report={title:'QA poster '+randomUUID().slice(0,8),id:null,checks:[],errors:[],cleaned:false,objectsCleaned:false};
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=','base64');
const paths=new Set();let uploads=0,failUpload=true,createAttempts=0,failEdit=false,page,user;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
function assert(ok,msg){if(!ok)throw new Error(msg);}
function pass(name){report.checks.push({name,status:'PASS'});console.log('PASS '+name);}
async function row(){const r=await client.from('map_elements').select('*').eq('id',report.id).single();assert(!r.error,r.error?.message);return r.data;}
async function edit(){const card=page.locator('article').filter({has:page.getByText(report.title,{exact:true})});await card.getByRole('button',{name:'Edit details',exact:true}).click();}
try{
 const login=await client.auth.signInWithPassword({email:env.VITE_DEMO_ORG_STUDENT_EMAIL,password:env.VITE_DEMO_ORG_STUDENT_PASSWORD});assert(!login.error,'Org login failed');user=login.data.user;
 const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`,session:login.data.session});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/storage/v1/object/event_posters/**',async route=>{
  if(route.request().method()!=='POST')return route.continue();uploads++;
  if(failUpload){failUpload=false;return route.fulfill({status:503,json:{message:'QA injected upload unavailable',error:'QA upload unavailable'}});}
  paths.add(decodeURIComponent(new URL(route.request().url()).pathname.split('/object/event_posters/')[1]));return route.continue();
 });
 await page.route('**/rest/v1/map_elements*',async route=>{
  const req=route.request();if(req.method()==='POST'&&req.postData()?.includes(report.title)){
   createAttempts++;if(createAttempts===1)return route.fulfill({status:503,json:{message:'QA injected save unavailable'}});
   if(createAttempts===2){const response=await route.fetch();assert(response.ok(),'Actual create failed');return route.fulfill({status:503,json:{message:'QA lost successful create response'}});}
  }
  if(req.method()==='PATCH'&&failEdit){failEdit=false;return route.fulfill({status:503,json:{message:'QA injected details unavailable'}});}
  return route.continue();
 });
 await page.goto('http://127.0.0.1:5173/student/events');await page.getByRole('button',{name:'Create event',exact:true}).click();
 await page.getByLabel('Event title *',{exact:true}).fill(report.title);await page.locator('input[type=file]').setInputFiles({name:'qa.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('checkbox',{name:/Campus Grounds/}).check();
 async function confirm(){await page.getByRole('button',{name:'Create & design maps',exact:true}).click();await page.getByRole('button',{name:'Confirm & design',exact:true}).click();}
 await confirm();await page.getByText(/QA.*upload unavailable/).first().waitFor();assert(createAttempts===0,'Failed upload created an event');pass('Upload failure preserves proposal and makes no event');
 await confirm();await page.getByText(/Something went wrong/).first().waitFor();const afterUpload=uploads;pass('Create save failure stays in form after upload');
 await confirm();await page.waitForURL('**/student/events/*/edit',{timeout:60000});report.id=page.url().split('/').at(-2);assert(uploads===afterUpload,'Retry duplicated poster upload');
 let current=await row();assert(current.metadata.posterUrl?.includes('/event_posters/'),'Poster missing from created event');
 const count=await client.from('map_elements').select('id').eq('name',report.title);assert(count.data?.length===1,'Retry duplicated event');pass('Lost create response recovers one draft using cached poster');
 const firstUrl=current.metadata.posterUrl;assert((await fetch(firstUrl)).ok,'Saved poster cannot be read');await page.goto('http://127.0.0.1:5173/student/events');await edit();assert(await page.getByAltText('Event poster preview').getAttribute('src')===firstUrl,'Reload lost poster');pass('Created poster persists after reload in Edit details');
 await page.locator('input[type=file]').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:png});failEdit=true;await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText(/Save failed/).first().waitFor();assert((await row()).metadata.posterUrl===firstUrl,'Failed details save changed poster');const replacementUploads=uploads;
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('dialog',{name:'Edit event proposal',exact:true}).waitFor({state:'hidden'});assert(uploads===replacementUploads,'Details retry duplicated upload');current=await row();assert(current.metadata.posterUrl!==firstUrl,'Replacement not saved');const replacementUrl=current.metadata.posterUrl;assert((await fetch(replacementUrl)).ok,'Replacement image missing');pass('Replacement failure/retry retains saved image and reuses new upload');
 await page.reload();await edit();assert(await page.getByAltText('Event poster preview').getAttribute('src')===replacementUrl,'Replacement reload failed');await page.getByRole('button',{name:'Remove poster',exact:true}).click();await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('dialog',{name:'Edit event proposal',exact:true}).waitFor({state:'hidden'});assert(!(await row()).metadata.posterUrl,'Poster removal did not persist');assert((await fetch(replacementUrl)).ok,'Remove deleted possibly shared image');await page.reload();await edit();assert(await page.getByAltText('Event poster preview').count()===0,'Removed poster returned after reload');pass('Remove persists after reload without deleting shared poster contents');
 await page.screenshot({path:out+'/poster-details-removed.png',fullPage:true});
}catch(e){report.failure=e.message;process.exitCode=1;console.log('FAIL '+e.message);if(page){report.screen=await page.locator('body').innerText();await page.screenshot({path:`${out}/poster-browser-failure.png`,fullPage:true});}}
finally{
 if(user){if(!report.id){const r=await client.from('map_elements').select('id').eq('name',report.title).eq('metadata->>createdByUserId',user.id);if(r.data?.length===1)report.id=r.data[0].id;}if(report.id){const r=await row();if(r.metadata.title===report.title&&r.metadata.createdByUserId===user.id&&r.metadata.status==='draft'){const d=await client.from('map_elements').delete().eq('id',report.id).select('id');report.cleaned=!d.error&&d.data?.length===1;}}if(paths.size){const d=await client.storage.from('event_posters').remove([...paths]);report.objectsCleaned=!d.error;}else report.objectsCleaned=true;}
 await browser.close();await client.auth.signOut({scope:'local'});fs.writeFileSync(`${out}/poster-browser.json`,JSON.stringify(report,null,2));console.log('Cleanup '+report.cleaned+'/'+report.objectsCleaned);
}
