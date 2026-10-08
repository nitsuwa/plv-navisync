// Isolated browser audit: real demo sign-in/published-map reads; event responses and writes controlled.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const {chromium}=createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const output='docs/verification/event-final-audit/evidence'+(process.argv.includes('--context-only')?'/context-probe':process.argv.includes('--recovery-only')?'/recovery':process.argv.includes('--zoom-only')?'/zoom-probe':process.argv.includes('--smoke')?'/smoke':process.argv.includes('--student-only')?'/geometry-probe':'');fs.mkdirSync(output,{recursive:true});
const result={mode:'Rendered UI with controlled event responses; no live event writes',checks:[],pageErrors:[],blockedWrites:[],status:'RUNNING'};
const save=()=>{
  const temporary=`${output}/results-${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(result,null,2));
  for(let attempt=0;attempt<3;attempt++){
    try{fs.renameSync(temporary,`${output}/results.json`);return;}
    catch(error){if(attempt===2)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}
  }
};
const check=(ok,label,detail)=>{result.checks.push({label,status:ok?'PASS':'FAIL',...(detail?{detail}:{})});console.log(`${ok?'PASS':'FAIL'} ${label}`);};
const api=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const signIn=async(prefix)=>{const {data,error}=await api.auth.signInWithPassword({email:env[`${prefix}_EMAIL`],password:env[`${prefix}_PASSWORD`]});if(error||!data.session)throw Error('Demo sign-in unavailable');return data;};
const reply=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
let browser,page,row,campuses,identities;
const title='QA Event — Community Innovation and Campus Accessibility Showcase';
const state={status:'approved',feedError:false,longError:false,networkOffline:false,expired:false,ownerForeign:false};
const profiles=[{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:740,height:390},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900},{width:1920,height:1080}];
const auditProfiles=process.argv.includes('--wide-only')?[profiles[7]]:process.argv.includes('--smoke')?[profiles[0],profiles[3]]:profiles;
async function open(role,path,viewport,options={}){
  const context=options.context??await browser.newContext({viewport,hasTouch:viewport.width<1024,reducedMotion:options.reduce?'reduce':'no-preference',colorScheme:options.dark?'dark':'light'});
  const key=`sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({key,session,dark})=>{localStorage.setItem(key,JSON.stringify(session));if(dark)localStorage.setItem('plv-theme-preference','dark');},{key,session:identities[role].session,dark:options.dark});
  await context.route('**/rest/v1/**',async route=>{
    const req=route.request(),u=new URL(req.url()),rpc=u.pathname.split('/rpc/')[1];
    if(!['GET','HEAD'].includes(req.method())&&!['list_event_safe_published_campuses','list_coming_soon_campuses','list_event_revisions','get_admin_activity_clear_cutoff','get_event_notification_states','ack_event_notification','list_published_event_previews'].includes(rpc)){
      result.blockedWrites.push({method:req.method(),path:u.pathname});return route.abort();
    }
    const m={...row.metadata,status:state.status,createdByUserId:state.ownerForeign?'00000000-0000-4000-8000-000000000002':identities.org.user.id};
    if(rpc==='list_event_safe_published_campuses')return reply(route,campuses);
    if(rpc==='list_coming_soon_campuses'||rpc==='list_event_revisions')return reply(route,[]);
    if(rpc==='get_admin_activity_clear_cutoff')return reply(route,null);
    if(rpc==='get_event_notification_states')return reply(route,[]);
    if(rpc==='ack_event_notification')return reply(route,new Date().toISOString());
    if(rpc==='list_published_event_previews')return state.networkOffline?route.continue():state.feedError?reply(route,{code:'XX000',message:state.longError?'Controlled event refresh unavailable. Please retry your connection. '.repeat(3):'Controlled event refresh unavailable'},503):reply(route,{serverNow:new Date().toISOString(),events:[{...m,id:row.id,campusId:row.campus_id}]});
    if(u.pathname.endsWith('/map_elements')&&(u.searchParams.get('or')?.includes('event_overlay')||u.searchParams.get('id')===`eq.${row.id}`)){
      if(state.expired)return reply(route,{code:'PGRST301',message:'Session expired. Sign in again.'},401);
      const single=(req.headers().accept??'').includes('vnd.pgrst.object');return reply(route,single?{...row,metadata:m}:[{...row,metadata:m}]);
    }
    if(req.method()==='GET'||req.method()==='HEAD')return route.continue();
    result.blockedWrites.push({method:req.method(),path:u.pathname});return route.abort();
  });
  const next=await context.newPage();next.setDefaultTimeout(18000);next.on('pageerror',error=>result.pageErrors.push(error.message));
  await next.goto(`http://localhost:5173${path}`,{waitUntil:'domcontentloaded',timeout:45000});
  await next.waitForLoadState('networkidle',{timeout:20000}).catch(()=>{});return next;
}
async function shot(name){await page.screenshot({path:`${output}/${name}.png`});}
async function fit(label,locator){
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${label}: no document horizontal overflow`);
  const b=await locator.boundingBox(),size=page.viewportSize()??await page.evaluate(()=>({width:innerWidth,height:innerHeight}));check(b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=size.width+1&&b.y+b.height<=size.height+1,`${label}: panel/modal inside viewport`,b);
}
async function scenario(label,task){try{await task();}catch(error){check(false,label,error.message);if(page)await shot(`failure-${label.replace(/[^\w-]/g,'-')}`).catch(()=>{});}finally{if(page)await page.context().close();page=null;state.ownerForeign=false;state.expired=false;state.feedError=false;state.longError=false;state.networkOffline=false;save();}}
async function student(viewport,options={}){
  const tag=`student-${viewport.width}x${viewport.height}${options.zoom?'-zoom200':''}${options.dark?'-dark':''}`;
  page=await open('student','/map',viewport,options);
  await page.getByRole('button',{name:'Open event map',exact:true}).click();
  const panel=page.getByRole('region',{name:'Campus events',exact:true});
  await panel.getByRole('button',{name:new RegExp('QA Event')}).click();
  await panel.getByRole('button',{name:'Show event details'}).waitFor();
  check(await panel.getByText(/Map shown: Campus Grounds/).isVisible(),`${tag}: event/map context survives collapse`);
  await fit(tag,panel);await shot(`${tag}-campus`);
  await panel.getByRole('button',{name:'Show event details'}).click();
  const floor=row.metadata.locations.find(l=>l.locationRef.type==='building');
  await panel.getByRole('button',{name:`View floor layout: ${floor.locationRef.label}`,exact:true}).click();
  await page.getByTestId('readonly-floor-plan-scene').waitFor();
  check(await panel.getByText(/Map shown:/).innerText()!== 'Map shown: Campus Grounds',`${tag}: actual floor context replaces campus`);
  await panel.getByRole('button',{name:'Fit map',exact:true}).click();
  await page.waitForTimeout(450);await fit(`${tag} floor`,panel);await shot(`${tag}-floor`);
  const geometry=await page.evaluate(()=>{
    const scene=document.querySelector('[data-testid="readonly-floor-plan-scene"]')?.getBoundingClientRect();
    const panel=document.querySelector('[data-testid="event-map-panel"]')?.getBoundingClientRect();
    const svg=document.querySelector('[data-testid="student-map-surface"] > svg'),camera=svg?.querySelector(':scope > g');
    return scene&&panel?{x:scene.x,y:scene.y,right:scene.right,bottom:scene.bottom,width:scene.width,height:scene.height,panelTop:panel.top,panelRight:panel.right,viewBox:svg?.getAttribute('viewBox'),cameraTransform:camera?.getAttribute('style')}:null;
  });
  const side=viewport.width>=1024||(viewport.width>=640&&viewport.height<=500);
  const availableWidth=side?viewport.width-geometry.panelRight-32:viewport.width-72;
  check(geometry&&geometry.width>=availableWidth*.65,`${tag}: floor uses available map width`,geometry);
  check(geometry&&geometry.x>=-1&&geometry.right<=viewport.width+1,`${tag}: complete authored floor and access features fit horizontally`,geometry);
  const camera=page.locator('[data-testid="student-map-surface"] > svg > g').first();const beforeZoom=await camera.getAttribute('style');
  await page.keyboard.press('=');await page.waitForFunction(before=>document.querySelector('[data-testid="student-map-surface"] > svg > g')?.getAttribute('style')!==before,beforeZoom);
  await page.waitForTimeout(450);const manualCamera=await camera.getAttribute('style');
  await panel.getByRole('button',{name:'Show event details'}).click();
  await page.waitForTimeout(150);check(await camera.getAttribute('style')===manualCamera,`${tag}: opening details preserves manual keyboard zoom`);
  check(await panel.getByRole('button',{name:/Currently viewing:/}).getAttribute('aria-current')==='location',`${tag}: current location identified by text/check state`);
  await fit(`${tag} details`,panel);await shot(`${tag}-details`);
  const floorPicker=page.getByTestId('student-floor-picker');
  if(await floorPicker.count()){
    await floorPicker.getByRole('button',{name:/Choose floor/}).click();
    const otherFloor=page.getByRole('option').nth(1);await otherFloor.click();
    await panel.getByText('No event layout on this floor.',{exact:true}).waitFor();
    check(await panel.locator('[aria-current="location"]').count()===0,`${tag}: manual floor change cannot keep a stale viewing marker`);
    if(await panel.getByRole('button',{name:'Show event details'}).count())await panel.getByRole('button',{name:'Show event details'}).click();
    await panel.getByRole('button',{name:`View floor layout: ${floor.locationRef.label}`,exact:true}).click();
    await panel.getByRole('button',{name:'Show event details'}).click();
  }
  await panel.getByRole('button',{name:'Hide event details'}).focus();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Open event map',exact:true}).waitFor();
  check(await page.getByRole('button',{name:'Open event map',exact:true}).evaluate(el=>el===document.activeElement),`${tag}: Escape returns focus to event trigger`);
}
async function proposal(viewport,options={}){
  const tag=`proposal-${viewport.width}x${viewport.height}${options.zoom?'-zoom200':''}${options.dark?'-dark':''}${options.reduce?'-reduce':''}`;
  state.status='approved';page=await open('org','/student/events',viewport,options);
  const trigger=page.getByRole('button',{name:'Create event',exact:true});await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Create event proposal',exact:true});await fit(tag,dialog);
  if(options.reduce)check(await dialog.locator(':scope > div').first().evaluate(el=>getComputedStyle(el).transform==='none'),`${tag}: reduced-motion entrance avoids scale/translation`);
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  check(await dialog.getByText('Event title is required.',{exact:true}).isVisible(),`${tag}: required-title feedback is visible`);
  await dialog.getByLabel(/Event title/).fill(title);
  await dialog.getByLabel(/Description/).fill('A long event description. '.repeat(45));
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  await dialog.getByRole('button',{name:'Create & design maps',exact:true}).waitFor();
  await fit(`${tag} locations`,dialog);await shot(`${tag}-locations`);
  check(await dialog.getByRole('button',{name:'Create & design maps',exact:true}).isDisabled(),`${tag}: empty requested locations cannot create`);
  await dialog.getByRole('checkbox',{name:/Campus Grounds/}).check();await dialog.getByRole('button',{name:'Create & design maps',exact:true}).click();
  const summary=page.getByRole('alertdialog',{name:'Review event proposal',exact:true});await summary.waitFor();await fit(`${tag} proposal summary`,summary);
  check(await summary.getByRole('button',{name:'Confirm & design',exact:true}).isVisible(),`${tag}: confirmation action remains reachable with long details`);await shot(`${tag}-summary`);
  await summary.getByRole('button',{name:'Back to locations',exact:true}).click();check(await dialog.getByRole('checkbox',{name:/Campus Grounds/}).isChecked(),`${tag}: nested summary preserves requested locations`);
  await dialog.getByRole('button',{name:'Back',exact:true}).click();
  check(await dialog.getByLabel(/Event title/).inputValue()===title,`${tag}: details survive step navigation`);
  if(viewport.width===320){
    await dialog.getByLabel(/Event title/).focus();await page.setViewportSize({width:320,height:320});
    await fit(`${tag} reduced input viewport`,dialog);await dialog.getByRole('button',{name:'Continue',exact:true}).scrollIntoViewIfNeeded();
    check(await dialog.getByRole('button',{name:'Continue',exact:true}).isVisible(),`${tag}: actions reachable with keyboard-sized viewport reduction`);
    await shot(`${tag}-input-viewport`);await page.setViewportSize(viewport);
  }
  await dialog.getByLabel(/Event title/).focus();
  for(let n=0;n<12;n++){await page.keyboard.press('Tab');check(await dialog.evaluate(el=>el.contains(document.activeElement)),`${tag}: Tab stays inside proposal (${n+1})`);}
  await page.keyboard.press('Escape');const discard=page.getByRole('alertdialog',{name:'Discard this proposal?',exact:true});await discard.waitFor();
  await fit(`${tag} discard`,discard);await discard.getByRole('button',{name:'Keep editing',exact:true}).click();
  check(await dialog.getByLabel(/Event title/).inputValue()===title,`${tag}: nested discard keeps form content`);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await discard.getByRole('button',{name:'Discard changes',exact:true}).click();
  await dialog.waitFor({state:'hidden'});check(await trigger.evaluate(el=>el===document.activeElement),`${tag}: discard restores opener focus`);
}
async function adminReview(viewport,options={}){
  const tag=`review-${viewport.width}x${viewport.height}${options.zoom?'-zoom200':''}`;state.status='pending';page=await open('admin',`/admin-dashboard/event-layouts?review=${row.id}`,viewport,options);
  const review=page.getByRole('dialog',{name:'Review Event Layout',exact:true});await review.waitFor();await fit(tag,review);
  const date=review.getByRole('button',{name:/^(Event starts date:|Choose event starts date)/});await date.click();await page.getByRole('button',{name:'Next month',exact:true}).waitFor();
  const calendar=page.locator('[data-radix-popper-content-wrapper] [role="dialog"]');await fit(`${tag} calendar`,calendar);await shot(`${tag}-calendar`);
  await page.keyboard.press('Escape');check(await review.isVisible()&&await date.evaluate(el=>el===document.activeElement),`${tag}: calendar Escape preserves parent and restores focus`);
  const time=review.getByRole('button',{name:/^Event starts time:/});await time.click();const picker=page.getByRole('dialog',{name:'Event starts time picker',exact:true});await picker.waitFor();await fit(`${tag} time`,picker);
  await picker.getByRole('spinbutton',{name:'Minute',exact:true}).fill('99');
  check(await picker.getByRole('button',{name:'Done',exact:true}).isDisabled(),`${tag}: invalid minute disables Done and explains range`);
  check(await picker.getByText(/Enter an hour from 1–12 and a minute from 00–59/).isVisible(),`${tag}: invalid time instructions are visible`);
  await picker.getByRole('spinbutton',{name:'Minute',exact:true}).fill('58');await picker.getByRole('button',{name:'Increase minute',exact:true}).click();
  check(await picker.getByRole('spinbutton',{name:'Minute',exact:true}).inputValue()==='59',`${tag}: minute arrows work without scrolling`);
  await shot(`${tag}-time`);await page.keyboard.press('Escape');check(await review.isVisible()&&await time.evaluate(el=>el===document.activeElement),`${tag}: time Escape closes only nested picker`);
  const previewButton=review.getByRole('button',{name:'Preview requested maps',exact:true});await previewButton.click();
  const preview=page.getByRole('dialog',{name:'Requested map preview',exact:true});await preview.waitFor();await fit(`${tag} preview`,preview);await shot(`${tag}-preview`);
  await preview.getByRole('button',{name:'Add pin',exact:true}).click();
  const point=await preview.locator('[aria-label="Event layout canvas"]').evaluate(canvas=>{
    const a=canvas.getBoundingClientRect(),b=canvas.querySelector('[data-testid="event-canvas-content"]').getBoundingClientRect();
    let best=null,distance=Infinity;
    for(let y=Math.max(a.top,b.top)+6;y<Math.min(a.bottom,b.bottom)-6;y+=12)for(let x=Math.max(a.left,b.left)+6;x<Math.min(a.right,b.right)-6;x+=12){
      const target=document.elementFromPoint(x,y),score=Math.hypot(x-a.left-a.width/2,y-a.top-a.height/2);
      if(target&&canvas.contains(target)&&!target.closest('[data-event-editor-chrome]')&&score<distance){best={x,y};distance=score;}
    }
    return best;
  });
  check(Boolean(point),`${tag}: an unobstructed authored map point is available for pin placement`);
  if(!point)throw Error('No unobstructed authored map point for pin placement');await page.mouse.click(point.x,point.y);
  await preview.getByRole('textbox',{name:'Pin comment',exact:true}).fill('Keep this access route clear. '.repeat(5));
  const draftMap=await preview.locator('[aria-label="Event layout canvas"]').boundingBox();
  check(draftMap&&draftMap.height>=96,`${tag}: draft pin keeps a visible map while entering feedback`,draftMap);
  check(await preview.getByRole('button',{name:'Save pin',exact:true}).isVisible(),`${tag}: pin comment/save action visible`);
  await shot(`${tag}-pin`);await preview.getByRole('button',{name:'Save pin',exact:true}).click();
  check(await preview.getByText(/Pin saved to review draft/).isVisible(),`${tag}: saved pin clearly remains a review draft`);
  await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});
  await page.waitForFunction(button=>button===document.activeElement,await previewButton.elementHandle(),{timeout:3000});
  check(await previewButton.evaluate(el=>el===document.activeElement),`${tag}: map preview Escape restores review trigger`);
  await review.getByLabel(/Admin Comment/i).fill('Feedback for the student organization. '.repeat(25));await review.getByRole('button',{name:'Approve',exact:true}).scrollIntoViewIfNeeded();
  check(await review.getByRole('button',{name:'Approve',exact:true}).isVisible(),`${tag}: decision footer remains reachable with long feedback`);await shot(`${tag}-feedback`);
}
async function recovery(){
  state.status='approved';page=await open('student','/map',{width:320,height:568});await page.getByRole('button',{name:'Open event map',exact:true}).click();
  const panel=page.getByRole('region',{name:'Campus events',exact:true});await panel.getByRole('button',{name:/QA Event/}).click();
  await panel.getByRole('button',{name:'Show event details'}).click();const floor=row.metadata.locations.find(l=>l.locationRef.type==='building');await panel.getByRole('button',{name:`View floor layout: ${floor.locationRef.label}`,exact:true}).click();
  state.feedError=true;state.longError=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel.getByRole('alert').waitFor();
  check(await panel.getByRole('button',{name:'Retry',exact:true}).isVisible(), 'Cached selected event exposes refresh error/retry while collapsed');
  await panel.getByRole('button',{name:'Fit map',exact:true}).click();await page.waitForTimeout(200);
  const floorBox=await page.getByTestId('readonly-floor-plan-scene').boundingBox(),panelBox=await panel.boundingBox();
  check(floorBox&&panelBox&&floorBox.y+floorBox.height<=panelBox.y,'Fit map keeps floor above persistent long refresh-error panel',{floorBox,panelBox});
  await shot('recovery-collapsed-error');state.feedError=false;state.longError=false;await panel.getByRole('button',{name:'Retry',exact:true}).click();await panel.getByRole('alert').waitFor({state:'hidden'});
  state.networkOffline=true;await page.context().setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await panel.getByRole('alert').waitFor();
  check(await panel.getByText(/Map shown:/).isVisible(),'Offline refresh retains event context');await page.context().setOffline(false);state.networkOffline=false;
  await panel.getByRole('button',{name:'Retry',exact:true}).click();await panel.getByRole('alert').waitFor({state:'hidden'});check(true,'Reconnect retry restores event feed');
}
async function ownerIsolation(){
  state.ownerForeign=true;page=await open('org',`/student/events/${row.id}/edit`,{width:390,height:844});
  await page.getByText(/belongs to another student organization/).waitFor();check(await page.getByRole('button',{name:'Save Draft',exact:true}).count()===0,'Foreign Org event response cannot expose editor or mutation controls');
  await shot('foreign-owner-blocked');state.ownerForeign=false;
}
async function venueContext(viewport){
  state.status='approved';page=await open('student','/map',viewport);await page.getByRole('button',{name:'Open event map',exact:true}).click();
  const panel=page.getByRole('region',{name:'Campus events',exact:true});await panel.getByRole('button',{name:/QA Event/}).click();
  await page.locator('[data-event-venue^="building:"]').first().click();await panel.getByRole('button',{name:'Hide event details'}).click();
  check(await panel.locator('header h2').innerText()===title,`${viewport.width}px: selected event identity survives venue inspection/collapse`);
  check(await panel.getByText(/Inspecting venue:/).isVisible()&&await panel.getByText(/Map shown: Campus Grounds/).isVisible(),`${viewport.width}px: inspected venue and actual map remain distinct`);
  await shot(`venue-context-${viewport.width}`);
}
async function expired(){
  state.expired=true;page=await open('org',`/student/events/${row.id}/edit`,{width:390,height:844});await page.getByText('Event map unavailable',{exact:true}).waitFor();
  check(await page.getByRole('link',{name:'Back to My Events'}).isVisible()&&await page.getByRole('button',{name:'Save Draft',exact:true}).count()===0,'Expired-session read shows recovery path and no save controls');await shot('expired-session');state.expired=false;
  check(await page.getByRole('alert').getByText(/Your session has expired/).isVisible(),'Expired read explains signing in again rather than claiming the event is missing');
}
async function nativeZoom(role='student'){
  const root=path.resolve('.tmp'),folder=path.join(root,`event-final-zoom-${randomUUID()}`);
  fs.mkdirSync(path.join(folder,'Default'),{recursive:true});
  let context;
  try{
    context=await chromium.launchPersistentContext(folder,{headless:true,viewport:null,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--window-size=1440,900']});
    const settings=await context.newPage();await settings.goto('edge://settings/appearance',{waitUntil:'networkidle'});
    await settings.getByRole('button',{name:'Page zoom',exact:true}).click();
    await settings.getByText('100%',{exact:true}).first().waitFor({timeout:15000});
    await settings.screenshot({path:`${output}/zoom-settings.png`});
    result.zoomSelectors=await settings.locator('button,[role="combobox"],[role="listbox"],select').evaluateAll(nodes=>nodes.map(node=>({role:node.getAttribute('role'),label:node.getAttribute('aria-label'),text:node.textContent?.slice(0,120)})).filter(node=>/zoom|%/i.test(`${node.text} ${node.label}`)));
    save();
    result.zoomControls=await settings.getByRole('combobox').evaluateAll(nodes=>nodes.map(node=>({label:node.getAttribute('aria-label'),text:node.textContent?.slice(0,240)})));
    await settings.screenshot({path:`output/zoom-settings.png`.replace('output',output)});
    const zoomControl=settings.getByRole('combobox',{name:/Page zoom|Zoom/i});
    if(await zoomControl.count())await zoomControl.selectOption({label:'200%'});
    else {await settings.getByText('100%',{exact:true}).first().click();await settings.getByText('200%',{exact:true}).click();}
    await settings.close();
    const probe=await context.newPage();await probe.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});
    const size=await probe.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,outerWidth}));(result.zoomMeasurements??=[]).push({role,...size});
    check(Math.abs(size.dpr-2)<.02&&size.width<800,`${role}: native browser 200% zoom verified by CSS viewport/device-pixel ratio`,size);
    await probe.close();const viewport={width:size.width,height:size.height};
    if(role==='org')await proposal(viewport,{context,zoom:true});else if(role==='admin')await adminReview(viewport,{context,zoom:true});else await student(viewport,{context,zoom:true});
  }finally{
    await context?.close();page=null;
    if(path.dirname(folder)!==root||!path.basename(folder).startsWith('event-final-zoom-'))throw Error('Unsafe zoom profile cleanup');
    fs.rmSync(folder,{recursive:true,force:true});
  }
}
try{
  identities={admin:await signIn('VITE_DEMO_ADMIN'),org:await signIn('VITE_DEMO_ORG_STUDENT'),student:await signIn('VITE_DEMO_STUDENT')};
  await api.auth.setSession(identities.admin.session);
  const fixture=await api.from('map_elements').select('id,campus_id,name,metadata,updated_at').eq('id','db0da611-5738-4c55-a9c1-61d2714d77bc').single();
  const published=await api.rpc('list_event_safe_published_campuses');if(fixture.error||published.error)throw Error('Published map fixture unavailable');
  campuses=published.data;row={...structuredClone(fixture.data),id:randomUUID(),metadata:{...structuredClone(fixture.data.metadata),title,description:'Information for visitors. '.repeat(35),organizer:'Student Organization for Community Innovation and Campus Accessibility',isActive:true,status:'approved',publicationAt:new Date(Date.now()-60000).toISOString(),dateStart:new Date(Date.now()+86400000).toISOString(),dateEnd:new Date(Date.now()+90000000).toISOString()}};
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const anchor=await browser.newContext();await anchor.newPage();
  if(process.argv.includes('--context-only')){
    for(const viewport of [{width:390,height:844},{width:1440,height:900}])await scenario(`venue-${viewport.width}`,()=>venueContext(viewport));
    await scenario('reduced-motion-proposal',()=>proposal({width:390,height:844},{dark:true,reduce:true}));
  }
  else if(process.argv.includes('--review-only'))for(const viewport of auditProfiles)await scenario(`review-${viewport.width}`,()=>adminReview(viewport));
  else if(process.argv.includes('--recovery-only'))await scenario('recovery',recovery);
  else if(process.argv.includes('--zoom-only'))await scenario('native-zoom',nativeZoom);
  else{
  if(!process.argv.includes('--roles-only'))for(const viewport of auditProfiles)await scenario(`student-${viewport.width}`,()=>student(viewport));
  if(process.argv.includes('--student-only')&&!process.argv.includes('--wide-only'))await scenario('native-zoom-student',()=>nativeZoom('student'));
  if(!process.argv.includes('--student-only')){
    for(const viewport of auditProfiles){await scenario(`proposal-${viewport.width}`,()=>proposal(viewport));await scenario(`review-${viewport.width}`,()=>adminReview(viewport));}
    await scenario('proposal-dark-reduce',()=>proposal({width:390,height:844},{dark:true,reduce:true}));
    await scenario('recovery',recovery);await scenario('foreign-owner',ownerIsolation);await scenario('expired-session',expired);
    for(const role of ['student','org','admin'])await scenario(`native-zoom-${role}`,()=>nativeZoom(role));
  }
  }
  check(result.pageErrors.length===0,'No browser page errors');check(result.blockedWrites.length===0,'No event/content mutation attempts');
  result.status=result.checks.every(x=>x.status==='PASS')?'PASS':'FAIL';if(result.status==='FAIL')process.exitCode=1;
}catch(error){result.status='FAIL';result.failure=error.message;process.exitCode=1;console.error(error.message);}
finally{save();await browser?.close();}
