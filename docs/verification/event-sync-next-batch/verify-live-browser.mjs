// Actual hosted receipt sync in independent desktop/mobile contexts.
// Only acknowledgement of ONE existing reviewed QA event may write; every
// event/content/publication mutation is blocked before it reaches Supabase.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const probe=JSON.parse(fs.readFileSync('docs/verification/event-sync-next-batch/live-api.json','utf8'));
const target=probe.browserCandidates.org.find(row=>row.id==='db0da611-5738-4c55-a9c1-61d2714d77bc')??probe.browserCandidates.org.find(row=>!row.wasRead);
assert.ok(target,'An existing reviewed event is required; no QA event will be created');
const output='docs/verification/event-sync-next-batch/live-evidence';fs.mkdirSync(output,{recursive:true});
const result={mode:'Actual hosted RPCs; two independent browser contexts; one existing QA review read mark only',eventId:target.id,checks:[],pageErrors:[],receiptErrors:[],blockedMutations:[],ackCount:0,status:'RUNNING'};
const check=(ok,label)=>{if(!ok)throw new Error(label);result.checks.push(label);console.log(`PASS ${label}`);};
const api=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const readonlyRpc=new Set(['get_admin_activity_clear_cutoff','get_event_notification_states','list_event_safe_published_campuses','list_coming_soon_campuses','list_published_event_previews','list_event_revisions']);
let browser,desktop,mobile;
async function open(identity,viewport,path){
  const context=await browser.newContext({viewport,hasTouch:viewport.width<768});
  const key=`sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key,session:identity.session});
  await context.route('**/rest/v1/**',route=>{
    const req=route.request(),u=new URL(req.url()),rpc=u.pathname.split('/rpc/')[1];
    if(['GET','HEAD'].includes(req.method())||readonlyRpc.has(rpc))return route.continue();
    if(rpc==='ack_event_notification'){
      const payload=req.postDataJSON();
      if(identity.user.id===org.user.id && payload.p_expected_user_id===org.user.id&&payload.p_stream==='org_review'&&payload.p_event_id===target.id){result.ackCount++;return route.continue();}
    }
    result.blockedMutations.push({method:req.method(),path:u.pathname});return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>result.pageErrors.push(error.message));
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(response.status()>=400&&/get_event_notification_states|ack_event_notification|admin_activity_preferences|get_admin_activity_clear_cutoff/.test(path))result.receiptErrors.push({status:response.status(),path});});
  await page.goto(`http://localhost:5173${path}`,{waitUntil:'networkidle'});return page;
}
let org;
try{
  const signIn=await api.auth.signInWithPassword({email:env.VITE_DEMO_ORG_STUDENT_EMAIL,password:env.VITE_DEMO_ORG_STUDENT_PASSWORD});
  if(signIn.error||!signIn.data.session)throw new Error('Configured Org sign-in unavailable');org=signIn.data;
  const before=await api.from('map_elements').select('metadata,updated_at').eq('id',target.id).single();if(before.error)throw new Error('Existing event cannot be read');
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const anchor=await browser.newContext();await anchor.newPage();
  desktop=await open(org,{width:1440,height:900},'/student/events');
  mobile=await open(org,{width:390,height:844},'/student/events');
  const desktopCard=desktop.getByTestId(`org-event-card-${target.id}`),mobileCard=mobile.getByTestId(`org-event-card-${target.id}`);
  await desktopCard.waitFor();await mobileCard.waitFor();
  check(await desktopCard.getAttribute('data-unread')===await mobileCard.getAttribute('data-unread'),'Independent contexts load identical hosted read state');
  if(await desktopCard.getAttribute('data-unread')==='true'){
    await desktopCard.getByRole('button',{name:`Mark GSO update for ${target.title} as read`,exact:true}).click();
    await desktop.waitForFunction(id=>document.querySelector(`[data-testid="org-event-card-${id}"]`)?.dataset.unread==='false',target.id);
    check(result.ackCount===1,'Org acknowledgement reached the real hosted RPC once');
    await mobile.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await mobile.waitForFunction(id=>document.querySelector(`[data-testid="org-event-card-${id}"]`)?.dataset.unread==='false',target.id);
    check(true,'Mobile context clears the same event unread mark on focus without reload');
  }else check(true,'Existing server receipt is read on both independent contexts');
  const prefix='plv-navisync:event-review-seen:v1:';
  check(await mobile.evaluate(prefix=>!Object.keys(localStorage).some(key=>key.startsWith(prefix)),prefix),'Second context has no browser-local review receipt');
  check(await mobile.getByText(/saved in this browser only|sync across devices is unavailable/i).count()===0,'App shows no browser-only fallback notice after migration');
  await mobileCard.scrollIntoViewIfNeeded();await mobile.screenshot({path:`${output}/org-mobile-synced.png`});
  await desktopCard.scrollIntoViewIfNeeded();await desktop.screenshot({path:`${output}/org-desktop-synced.png`});
  const after=await api.from('map_elements').select('metadata,updated_at').eq('id',target.id).single();assert.ifError(after.error);assert.deepEqual(after.data,before.data);check(true,'Event metadata and row revision are unchanged by the read mark');
  await mobile.reload({waitUntil:'networkidle'});await mobileCard.waitFor();check(await mobileCard.getAttribute('data-unread')==='false','Hosted receipt survives page reload');
  check(result.receiptErrors.length===0,'No receipt or activity-preferences endpoint errors');
  check(result.pageErrors.length===0,'No browser page errors');check(result.blockedMutations.length===0,'No event/content/publication mutation attempted');
  result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.message;console.error(error.message);if(mobile)await mobile.screenshot({path:`${output}/failure.png`}).catch(()=>{});process.exitCode=1;}
finally{fs.writeFileSync(`${output}/results.json`,JSON.stringify(result,null,2));if(browser)await browser.close();}
