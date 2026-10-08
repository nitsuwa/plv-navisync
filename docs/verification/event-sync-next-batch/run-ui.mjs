// Controlled UI verification on localhost. Only demo sign-in and map reads reach Supabase.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const output='docs/verification/event-sync-next-batch/evidence';fs.mkdirSync(output,{recursive:true});
const result={mode:'Controlled desktop/mobile browser contexts and clocks; no live event writes',checks:[],pageErrors:[],blockedLiveWrites:0,blockedRequests:[],status:'RUNNING'};
const check=(ok,label)=>{if(!ok)throw new Error(label);result.checks.push(label);console.log(`PASS ${label}`);};
const api=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const signIn=async(email,password)=>{const {data,error}=await api.auth.signInWithPassword({email,password});if(error||!data.session)throw new Error('Configured demo sign-in unavailable');return data;};
const stamp=n=>new Date(Date.now()+n).toISOString();
let browser,page,row,publishedRows,publicEvents=[],clockNow=stamp(0),failFeed=false,missingSync=false,failAck=false;
const receipts=new Map();
const canonical=x=>JSON.stringify(x,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
const payload=(stream)=>stream==='admin_submission'?(row.metadata.status==='pending'?[row.metadata.submittedAt??'',row.metadata.lastEditedAt??'',row.metadata.revision??0]:null):['approved','disapproved'].includes(row.metadata.status)?[row.metadata.submittedAt??null,row.metadata.status,row.metadata.adminComment??'',row.metadata.locationFeedback??{}]:null;
const respond=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
async function open(identity,path,viewport,reducedMotion='no-preference'){
  const context=await browser.newContext({viewport,hasTouch:viewport.width<768,reducedMotion});
  const key=`sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key,session:identity.session});
  await context.route('**/rest/v1/**',async route=>{
    const req=route.request(),u=new URL(req.url()),rpc=u.pathname.split('/rpc/')[1],body=req.postDataJSON();
    if(rpc==='get_admin_activity_clear_cutoff')return respond(route,null);
    if(rpc==='list_event_safe_published_campuses')return respond(route,publishedRows);
    if(rpc==='list_event_revisions')return respond(route,[]);
    if(rpc==='list_published_event_previews')return failFeed?respond(route,{code:'XX000',message:'Controlled feed unavailable'},503):respond(route,{serverNow:clockNow,events:publicEvents});
    if(rpc==='get_event_notification_states'||rpc==='ack_event_notification'){
      if(missingSync)return respond(route,{code:'PGRST202',message:`Could not find the function public.${rpc}`},404);
      const fp=canonical(payload(body.p_stream));
      if(rpc==='get_event_notification_states')return respond(route,body.p_candidates.map(item=>({event_id:item.event_id,is_current:canonical(item.payload)===fp,is_read:receipts.get(`${body.p_expected_user_id}:${body.p_stream}:${item.event_id}`)===fp})));
      if(failAck)return respond(route,{code:'XX000',message:'Controlled sync failure'},503);
      if(canonical(body.p_payload)!==fp)return respond(route,{code:'40001',message:'Event changed'},409);
      receipts.set(`${body.p_expected_user_id}:${body.p_stream}:${body.p_event_id}`,fp);return respond(route,stamp(0));
    }
    if(rpc==='review_event_layout'){await new Promise(resolve=>setTimeout(resolve,600));return respond(route,{code:'40001',message:'Controlled stale review; refresh the current revision.'},409);}
    if(rpc==='manage_event_publication'){await new Promise(resolve=>setTimeout(resolve,600));return respond(route,{code:'40001',message:'Controlled publication failure; your choices are kept.'},409);}
    if(u.pathname.endsWith('/map_elements')&&(u.searchParams.get('or')?.includes('event_overlay')||u.searchParams.has('id'))){
      if(req.method()!=='GET'){result.blockedLiveWrites++;return route.abort();}
      const single=(req.headers().accept??'').includes('vnd.pgrst.object');return respond(route,single?row:[row]);
    }
    if(req.method()==='GET'||req.method()==='HEAD')return route.continue();
    result.blockedLiveWrites++;result.blockedRequests.push({method:req.method(),path:u.pathname});return route.abort();
  });
  const next=await context.newPage();next.setDefaultTimeout(30000);next.on('pageerror',error=>result.pageErrors.push(error.message));
  await next.goto(`http://localhost:5173${path}`,{waitUntil:'networkidle'});return next;
}
async function shot(name){await page.screenshot({path:`${output}/${name}.png`});}
async function fit(label){check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${label}: no horizontal overflow`);const dialogs=page.getByRole('dialog');if(await dialogs.count()){const box=await dialogs.last().boundingBox(),size=page.viewportSize();check(box&&box.x>=0&&box.x+box.width<=size.width+1&&box.y>=0&&box.y+box.height<=size.height+1,`${label}: modal stays inside viewport`);}}
try{
  const admin=await signIn(env.VITE_DEMO_ADMIN_EMAIL,env.VITE_DEMO_ADMIN_PASSWORD);
  const org=await signIn(env.VITE_DEMO_ORG_STUDENT_EMAIL,env.VITE_DEMO_ORG_STUDENT_PASSWORD);
  const student=await signIn(env.VITE_DEMO_STUDENT_EMAIL,env.VITE_DEMO_STUDENT_PASSWORD);
  await api.auth.setSession(admin.session);
  const sample=await api.from('map_elements').select('id,campus_id,name,metadata,updated_at').eq('id','db0da611-5738-4c55-a9c1-61d2714d77bc').single();
  const campus=await api.rpc('list_event_safe_published_campuses');if(sample.error||!sample.data||campus.error||!campus.data?.length)throw new Error('Read-only campus fixtures unavailable');
  publishedRows=campus.data;
  row={...structuredClone(sample.data),id:randomUUID(),updated_at:stamp(-1000),metadata:{...structuredClone(sample.data.metadata),title:'QA Sync and Loading',createdByUserId:org.user.id,status:'pending',isActive:false,submittedAt:stamp(-60000),lastEditedAt:stamp(-30000),revision:3}};
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const anchor=await browser.newContext();await anchor.newPage();
  page=await open(admin,`/admin-dashboard/event-layouts?review=${row.id}`,{width:1440,height:900});
  const review=page.getByRole('dialog',{name:'Review Event Layout'});await review.waitFor();
  await page.getByText('New submission',{exact:true}).waitFor({state:'hidden'});
  check(receipts.size===1,'Admin review acknowledgement saved to shared controlled server');
  await review.getByLabel(/Admin Comment/i).fill('Move the booth away from the entrance.');
  await review.getByRole('button',{name:'Disapprove',exact:true}).click();
  await review.getByRole('button',{name:'Requesting changes…',exact:true}).waitFor();await shot('01-admin-review-loading-desktop');
  await review.getByText(/Controlled stale review/).waitFor();check(await review.getByLabel(/Admin Comment/i).inputValue()==='Move the booth away from the entrance.','Stale review keeps feedback and provides retry');
  await page.setViewportSize({width:390,height:844});await fit('Admin review mobile');await shot('02-admin-review-error-mobile');
  const second=await open(admin,'/admin-dashboard/event-layouts',{width:390,height:844});
  await second.getByRole('button',{name:'Notifications',exact:true}).click();
  await second.getByRole('button',{name:`Review ${row.metadata.title}`,exact:true}).waitFor();
  check(await second.getByRole('button',{name:`Review ${row.metadata.title}`,exact:true}).locator('span.bg-red-600').count()===0,'Separate Admin context reads same receipt without local storage');await second.context().close();await page.context().close();
  row.metadata.status='approved';row.metadata.adminComment='Check access at Pin 1';row.metadata.isActive=false;
  row.metadata.dateStart=stamp(86400000);row.metadata.dateEnd=stamp(90000000);row.metadata.publicationAt=stamp(-60000);
  page=await open(org,'/student/events',{width:390,height:844},'reduce');
  const card=page.getByTestId(`org-event-card-${row.id}`);await card.waitFor();
  await card.getByRole('button',{name:`Mark GSO update for ${row.metadata.title} as read`,exact:true}).click();
  await page.waitForFunction(id=>document.querySelector(`[data-testid="org-event-card-${id}"]`)?.dataset.unread==='false',row.id);await fit('Org mobile receipt');await shot('03-org-read-mobile-reduced-motion');
  const orgSecond=await open(org,'/student/events',{width:1440,height:900});
  await orgSecond.getByTestId(`org-event-card-${row.id}`).waitFor();check(await orgSecond.getByTestId(`org-event-card-${row.id}`).getAttribute('data-unread')==='false','Separate Org context uses server review receipt');
  row.metadata.adminComment='New GSO follow-up';await orgSecond.reload();
  await orgSecond.waitForFunction(id=>document.querySelector(`[data-testid="org-event-card-${id}"]`)?.dataset.unread==='true',row.id);check(true,'A changed review becomes unread on the second device');
  failAck=true;await orgSecond.getByRole('button',{name:`Mark GSO update for ${row.metadata.title} as read`,exact:true}).click();
  await orgSecond.getByText('Controlled sync failure',{exact:true}).waitFor();check(await orgSecond.getByTestId(`org-event-card-${row.id}`).getAttribute('data-unread')==='true','Failed server acknowledgement stays unread with visible retry');failAck=false;
  await orgSecond.context().close();await page.context().close();
  missingSync=true;
  page=await open(org,'/student/events',{width:360,height:640});await page.getByRole('link',{name:'View maps',exact:true}).first().click();
  await page.getByText('Read-only review',{exact:true}).waitFor();await page.goto('http://localhost:5173/student/events',{waitUntil:'networkidle'});
  check(await page.getByTestId(`org-event-card-${row.id}`).getAttribute('data-unread')==='false','Opening maps saves browser fallback before navigation');await fit('Org small mobile');await shot('04-org-browser-only-small-mobile');await page.context().close();missingSync=false;
  page=await open(admin,'/admin-dashboard/event-layouts',{width:390,height:844});await page.getByRole('button',{name:'Manage publication',exact:true}).click();
  const publication=page.getByRole('dialog',{name:'Manage event publication'});
  await publication.getByRole('button',{name:'Publish now',exact:true}).click();await publication.getByRole('button',{name:'Publishing…',exact:true}).waitFor();await fit('Mobile publication loading');await shot('05-publication-loading-mobile');await publication.getByText(/Controlled publication failure/).waitFor();await page.context().close();
  row.metadata.isActive=true;
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    clockNow=stamp(0);publicEvents=[{...row.metadata,id:row.id,campusId:row.campus_id,dateStart:stamp(60000),dateEnd:stamp(120000),publicationAt:stamp(-1000)}];
    page=await open(student,'/map',viewport);await page.clock.install({time:new Date(clockNow)});await page.getByRole('button',{name:'Open event map',exact:true}).click();
    const panel=page.getByRole('region',{name:'Campus events',exact:true});await panel.getByRole('button',{name:row.metadata.title}).waitFor();
    await panel.getByRole('button',{name:'Upcoming',exact:true}).click();check(await panel.getByRole('button',{name:row.metadata.title}).isVisible(),`${viewport.width}px: event visible in Upcoming`);
    failFeed=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel.getByRole('alert').waitFor();check(await panel.getByRole('button',{name:row.metadata.title}).isVisible(),`${viewport.width}px: cached event and retry stay visible after background failure`);await fit(`Student ${viewport.width}px`);await shot(`06-clock-error-${viewport.width}`);
    await page.clock.runFor(61000);await panel.getByRole('button',{name:'Ongoing',exact:true}).click();await panel.getByRole('button',{name:row.metadata.title}).waitFor();check(true,`${viewport.width}px: becomes Ongoing without reload`);
    await panel.getByRole('button',{name:row.metadata.title}).click();await page.clock.runFor(61000);await panel.getByRole('button',{name:'All',exact:true}).waitFor();check(await panel.getByRole('button',{name:row.metadata.title}).count()===0,`${viewport.width}px: end time dismisses selected overlay and event`);failFeed=false;await page.context().close();
  }
  check(result.pageErrors.length===0,'No browser page errors');check(!result.blockedRequests.some(item=>item.path.endsWith('/map_elements')),'No event record mutation attempts; all unhandled writes blocked');result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.message;if(page)await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});console.error(error.message);process.exitCode=1;}
finally{fs.writeFileSync(`${output}/results.json`,JSON.stringify(result,null,2));if(browser)await browser.close();}
