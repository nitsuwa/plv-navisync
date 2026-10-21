// Browser rendering/interaction checks with controlled HTTP fixtures.
// Every Supabase request is intercepted. This does not prove live Supabase access.
// Server authorization is separately exercised by the disposable SQL harnesses.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const serviceUrl = new URL(env.VITE_SUPABASE_URL);
const url = process.env.CONTINUITY_UI_URL || 'http://127.0.0.1:5175';
const out = 'docs/verification/organization-event-continuity/evidence';
fs.mkdirSync(out, { recursive: true });
const report = { mode: 'controlled HTTP fixtures in the real application browser; no live Supabase mutations', checks: [], pageErrors: [], unknownRequests: [], retainedLiveRecords: 0, liveRequestsForwarded: 0 };
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = new Date().toISOString();
const actor = id(1), former = id(2), incoming = id(3), orgId = id(4), grantId = id(5), campusId = id(6);
const orgName = 'Information Technology Organization and Annual Campus Event Planning Committee';
const contextRow = { organization_id: orgId, organization_name: orgName, grant_id: grantId, academic_year: '2026–2027', expires_at: '2027-06-30T15:59:59Z' };
const campus = { id: campusId, name: 'Main Campus', code: 'MAIN', status: 'active', lifecycleStatus: 'published', publishStatus: 'published', visibleToStudents: true, isDefault: true, description: '', address: '', city: '', province: '', postalCode: '', canvasW: 900, canvasH: 680, canvasConfigured: true, features: { indoorNavigation: true, eventLayer: true }, settings: { eventLayer: true }, buildings: [], markers: [], paths: [], createdAt: now, updatedAt: now, publishedAt: now };
const location = { id: 'campus-grounds', locationRef: { type: 'campus', label: 'Campus Grounds' }, eventFurniture: [], eventLabels: [] };
const events = [
 { id: id(10), campusId, organizationId: orgId, title: `Inherited draft ${'LongEventTitle'.repeat(10)}`, description: 'Unfinished work', organizer: 'IT Organization', academicYear: '2025–2026', creatorName: 'Former Representative', createdByUserId: former, createdAt: '2025-09-10T00:00:00Z', updatedAt: now, status: 'draft', locations: [location] },
 { id: id(11), campusId, organizationId: orgId, title: 'Submitted organization layout with feedback', description: 'Pending review', organizer: 'IT Organization', academicYear: '2025–2026', creatorName: 'Former Representative', createdByUserId: former, createdAt: '2025-09-11T00:00:00Z', updatedAt: now, submittedAt: now, status: 'pending', locations: [location] },
 { id: id(12), campusId, organizationId: orgId, title: 'Historical approved campus fair layout from a previous academic year', description: 'Past fair', organizer: 'IT Organization', academicYear: '2024–2025', creatorName: 'Former Representative', createdByUserId: former, createdAt: '2025-01-10T00:00:00Z', updatedAt: now, dateStart: '2025-03-01T01:00:00Z', dateEnd: '2025-03-01T09:00:00Z', status: 'approved', locations: [location] },
];
const rawEvent = event => ({ id: event.id, campus_id: campusId, organization_id: orgId, element_type: 'event_overlay', name: event.title, metadata: event, created_at: event.createdAt, updated_at: event.updatedAt, archived_at: null });
const responseEvent = event => ({ id: event.id, campusId, organizationId: orgId, creatorName: event.creatorName, createdAt: event.createdAt, updatedAt: event.updatedAt, reusedFromEventId: event.reusedFromEventId, metadata: event });
const profiles = [
 { id: actor, role: 'student_org', first_name: 'Current', last_name: 'RepresentativeWithAnExtremelyLongUnbrokenCompoundSurnameForResponsiveChecks', email: 'current@example.test' },
 { id: former, role: 'student_org', first_name: 'Former', last_name: 'Representative', email: 'former@example.test' },
 { id: incoming, role: 'student_org', first_name: 'Incoming', last_name: 'RepresentativeWithAnExtremelyLongUnbrokenCompoundSurnameForResponsiveChecks', email: 'incoming@example.test' },
].map(profile => ({ ...profile, is_active: true, created_at: now, updated_at: now, department: 'IT', student_number: null }));
const grant = { id: grantId, organization_id: orgId, representative_id: actor, representative_name: `${profiles[0].first_name} ${profiles[0].last_name}`, academic_year: '2026–2027', starts_at: now, expires_at: contextRow.expires_at, granted_by: id(20), ended_at: null, ended_by: null, end_reason: null, profile_active: true, profile_role: 'student_org' };
const organization = { id: orgId, code: 'IT-ORG', name: orgName, is_active: true, created_at: now, updated_at: now, grants: [grant] };
let page;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const assert = (value, message) => { if (!value) throw new Error(message); };
async function check(name, action) {
 try { await action(); report.checks.push({ name, status: 'PASS' }); }
 catch (error) { report.checks.push({ name, status: 'FAIL', error: error.message }); await page?.screenshot({ path: `${out}/failure-${report.checks.length}.png`, fullPage: true }).catch(() => {}); }
 const last = report.checks.at(-1); console.log(JSON.stringify({ ...last, error: last.error?.split('\n')[0] }));
}
async function openRole(role, viewport, existingContext) {
 const state = { role, access: true, missing: false };
 const user = { id: actor, aud: 'authenticated', role: 'authenticated', email: 'browser-fixture@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: now };
 const claims = Buffer.from(JSON.stringify({ sub: actor, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url');
 const session = { access_token: `fixture.${claims}.fixture`, refresh_token: 'controlled-fixture', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user };
 const ctx = existingContext || await browser.newContext({ viewport, reducedMotion: 'reduce' });
 await ctx.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${serviceUrl.hostname.split('.')[0]}-auth-token`, session });
 await ctx.route(`**://${serviceUrl.hostname}/**`, async route => {
  const request = route.request(), requestUrl = new URL(request.url()), path = requestUrl.pathname;
  const body = request.postDataJSON() || {};
  const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } });
  if (request.method() === 'OPTIONS') return send(null);
  if (path.includes('/auth/v1/user')) return send(user);
  if (path.includes('/auth/v1/')) return send(session);
  const rpc = path.split('/rpc/')[1];
  if (rpc) {
   if (state.missing && ['get_my_event_organizations', 'admin_list_event_organizations'].includes(rpc)) return send({ code: 'PGRST202', message: 'Organization database update is not installed' }, 404);
   if (rpc === 'get_my_event_organizations') return send(state.access && role === 'student_org' ? [contextRow] : []);
   if (rpc === 'admin_list_event_organizations') return send([organization]);
   if (rpc === 'get_event_organization_handover') return send({ ...contextRow, starts_at: now, pending_count: 1, unfinished_count: 1, open_feedback_count: 0, is_read: false });
   if (rpc === 'get_event_notification_states') return send([]);
   if (['ack_event_notification', 'ack_event_organization_handover', 'get_admin_activity_clear_cutoff'].includes(rpc)) return send(now);
   if (rpc === 'list_organization_events') {
    const list = body.p_include_archived ? events.filter(event => event.status === 'approved') : events.filter(event => event.status !== 'approved');
    return state.access ? send({ events: list.map(responseEvent), total: list.length }) : send({ code: '42501', message: 'Organization access changed' }, 403);
   }
   if (rpc === 'list_event_safe_published_campuses') return send([{ campus_id: campusId, snapshot: { campus }, published_at: now }]);
   if (rpc === 'list_coming_soon_campuses') return send([]);
   if (rpc === 'list_published_event_previews') return send({ serverNow: now, events: [] });
   if (rpc === 'get_event_edit_access') return send({ organizationId: orgId, grantId, isArchived: false, canEditContent: true, canAddressFeedback: true });
   if (rpc === 'list_event_revisions') return send([]);
   if (rpc === 'reuse_organization_event') {
    const created = { ...events[0], id: id(14), title: body.p_title, academicYear: body.p_academic_year, createdByUserId: actor, creatorName: 'Current Representative', reusedFromEventId: body.p_source_id, createdAt: now, updatedAt: now };
    events.push(created); return send(responseEvent(created));
   }
   report.unknownRequests.push(`${request.method()} rpc/${rpc}`);
   return send({ code: '42883', message: `Controlled fixture does not implement ${rpc}` }, 400);
  }
  const table = path.split('/rest/v1/')[1];
  if (table === 'profiles') {
   const profile = { ...profiles[0], role };
   return send(requestUrl.searchParams.get('id') === `eq.${actor}` ? profile : profiles);
  }
  if (table === 'map_elements') {
   const eventId = requestUrl.searchParams.get('id')?.replace(/^eq\./, '');
   return send(eventId ? rawEvent(events.find(event => event.id === eventId) || events[0]) : events.map(rawEvent));
  }
  if (table === 'campuses') return send([{ ...campus, is_default: true, metadata: {}, preview_buildings: [] }]);
  if (request.method() === 'GET' || request.method() === 'HEAD') return send([]);
  report.unknownRequests.push(`${request.method()} ${table || path}`);
  return send({ message: 'Live writes are blocked by the controlled browser harness' }, 403);
 });
 page = await ctx.newPage(); page.setDefaultTimeout(12000); page.setDefaultNavigationTimeout(45000);
 page.on('pageerror', error => report.pageErrors.push(error.message));
 return { ctx, state };
}
async function noOverflow() { assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal page overflow'); }
async function reachable(locator, viewport) { await locator.scrollIntoViewIfNeeded(); const b = await locator.boundingBox(); assert(b && b.x >= -1 && b.y >= -1 && b.x+b.width <= viewport.width+1 && b.y+b.height <= viewport.height+1, `Action is clipped: ${JSON.stringify(b)}`); }
try {
 const matrix = [[320,568],[390,844],[390,420],[740,390],[768,1024],[1440,900]];
 for (const [width,height] of matrix) {
  const viewport = { width,height }; const {ctx,state} = await openRole('student_org', viewport);
  await page.goto(`${url}/student/events`);
  await check(`Create proposal validation, nested dismissal and reachable actions ${width}x${height}`, async()=>{
   const trigger=page.getByRole('button',{name:'Create event',exact:true}); await trigger.click();
   const dialog=page.getByRole('dialog',{name:'Create event proposal'}); await dialog.waitFor();
   await dialog.getByRole('button',{name:'Continue',exact:true}).click();
   await dialog.getByRole('alert').filter({hasText:'Event title is required'}).waitFor();
   await dialog.getByLabel(/Event title/).fill('Controlled browser proposal with a long title for responsive verification');
   await reachable(dialog.getByRole('button',{name:'Continue',exact:true}),viewport);
   await page.screenshot({path:`${out}/proposal-${width}x${height}.png`});
   await page.keyboard.press('Escape');
   const discard=page.getByRole('alertdialog',{name:'Discard this proposal?'}); await discard.waitFor();
   await reachable(discard.getByRole('button',{name:'Keep editing'}),viewport);
   await discard.getByRole('button',{name:'Keep editing'}).click(); await discard.waitFor({state:'hidden'});
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click(); await discard.waitFor();
   await discard.getByRole('button',{name:'Discard changes'}).click(); await dialog.waitFor({state:'hidden'});
   assert(await trigger.evaluate(element=>element===document.activeElement),'Focus did not return from the proposal');
  });
  await check(`Organization workspace, history and reuse dialog ${width}x${height}`, async () => {
   await page.getByRole('heading',{name:'Organization Events',exact:true}).waitFor();
   const history = page.getByRole('region',{name:'Event history'});
   await history.getByRole('button',{name:'Reuse as new draft'}).waitFor();
   assert((await history.getByText('Original creator:',{exact:true}).locator('..').innerText()).includes('Former Representative'), 'Original creator attribution is missing');
   await noOverflow();
   const trigger = history.getByRole('button',{name:'Reuse as new draft'}); await trigger.click();
   const dialog = page.getByRole('dialog',{name:'Reuse event layout'}); await dialog.waitFor();
   await reachable(dialog.getByRole('button',{name:'Create new draft'}),viewport);
   assert(await dialog.innerText().then(text=>text.includes('fresh admin approval')), 'Fresh approval requirement is missing');
   await page.keyboard.press('Tab'); assert(await dialog.evaluate(element=>element.contains(document.activeElement)), 'Focus escaped the reuse dialog');
   await page.screenshot({path:`${out}/reuse-${width}x${height}.png`});
   await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
   assert(await trigger.evaluate(element=>element===document.activeElement), 'Focus did not return to the reuse trigger');
  });
  await check(`Revoked access removes protected workspace ${width}x${height}`,async()=>{
   state.access=false; await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await page.getByRole('heading',{name:'No active organization assignment'}).waitFor();
   assert(await page.getByText(events[0].title,{exact:true}).count()===0,'Inherited private work stayed visible after revalidation');
  });
  await ctx.close();
  const admin = await openRole('admin',viewport); await page.goto(`${url}/admin-dashboard/users`);
  await check(`Representative handover modal and focus ${width}x${height}`,async()=>{
   const panel = page.getByRole('region',{name:'Student Organizations'});
   const trigger = panel.getByRole('button',{name:'Replace representative',exact:true}); await trigger.click();
   const dialog = page.getByRole('dialog',{name:'Replace representative'}); await dialog.waitFor();
   await dialog.getByLabel('Incoming representative').selectOption(incoming);
   await dialog.getByLabel('Academic year',{exact:true}).fill('2026–2027');
   await dialog.getByLabel('Access expires on').fill('2027-06-30');
   await dialog.getByRole('button',{name:'Continue to handover'}).click();
   assert(await dialog.innerText().then(text=>text.includes('Current Representative')&&text.includes('Incoming Representative')&&text.includes('loses organization access')), 'Handover names or access consequence missing');
   await reachable(dialog.getByRole('button',{name:'Confirm handover'}),viewport);
   const headingBox=await dialog.getByRole('heading',{name:'Replace representative',exact:true}).boundingBox();
   assert(headingBox&&headingBox.y>=0&&headingBox.y+headingBox.height<=height,'Modal heading was scrolled out of view');
   await noOverflow(); await page.screenshot({path:`${out}/handover-${width}x${height}.png`});
   await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
   assert(await trigger.evaluate(element=>element===document.activeElement),'Focus did not return to the assignment trigger');
  });
  await check(`Organization form and revoke controls ${width}x${height}`,async()=>{
   const panel=page.getByRole('region',{name:'Student Organizations'});
   const add=panel.getByRole('button',{name:'Add organization',exact:true}); await add.click();
   const form=page.getByRole('dialog',{name:'Add organization',exact:true}); await form.waitFor();
   await form.getByLabel('Organization name',{exact:true}).fill(orgName);
   await reachable(form.getByRole('button',{name:'Create organization',exact:true}),viewport);
   const formTitle=await form.getByRole('heading',{name:'Add organization',exact:true}).boundingBox(); assert(formTitle&&formTitle.y>=0,'Organization form heading is clipped');
   await page.keyboard.press('Escape'); await form.waitFor({state:'hidden'});
   assert(await add.evaluate(element=>element===document.activeElement),'Organization form did not return focus');
   const revoke=panel.getByRole('button',{name:'Revoke representative',exact:true}); await revoke.click();
   const revokeDialog=page.getByRole('dialog',{name:'Revoke organization access',exact:true}); await revokeDialog.waitFor();
   await revokeDialog.getByLabel('Reason for revocation').fill('Controlled browser verification; no action is submitted.');
   await reachable(revokeDialog.getByRole('button',{name:'Revoke access',exact:true}),viewport);
   const revokeTitle=await revokeDialog.getByRole('heading',{name:'Revoke organization access',exact:true}).boundingBox(); assert(revokeTitle&&revokeTitle.y>=0,'Revocation heading is clipped');
   await page.screenshot({path:`${out}/revoke-${width}x${height}.png`});
   await page.keyboard.press('Escape'); await revokeDialog.waitFor({state:'hidden'});
   assert(await revoke.evaluate(element=>element===document.activeElement),'Revocation dialog did not return focus');
  });
  await page.goto(`${url}/admin-dashboard/event-layouts?review=${id(11)}`);
  await check(`Legacy admin review link and canonical tabs ${width}x${height}`,async()=>{
   await page.waitForURL('**/admin-dashboard/events?**');
   await page.getByRole('tab',{name:'Needs review',exact:true}).waitFor();
   const reviewDialog = page.getByRole('dialog').first(); await reviewDialog.waitFor();
   await page.keyboard.press('Escape'); await reviewDialog.waitFor({state:'hidden'});
   const tabs = page.getByRole('tablist',{name:'Events workspace'});
   const history = tabs.getByRole('tab',{name:'History',exact:true}); await history.click();
   await page.waitForURL('**view=history*'); await noOverflow();
   await history.focus(); await page.keyboard.press('ArrowLeft');
   assert(await tabs.getByRole('tab',{name:'Approved & publication',exact:true}).getAttribute('aria-selected')==='true','Workspace arrow-key navigation failed');
   await page.screenshot({path:`${out}/admin-workspace-${width}x${height}.png`});
  });
  await admin.ctx.close();
 }
 const ordinary = await openRole('student',{width:390,height:844}); await page.goto(`${url}/student/events`);
 await check('Ordinary student cannot open organization workspace',async()=>{await page.waitForURL('**/home');assert(await page.getByRole('heading',{name:'Organization Events',exact:true}).count()===0,'Private workspace visible to Student');});
 await ordinary.ctx.close();
 const missing = await openRole('student_org',{width:390,height:844}); missing.state.missing=true; await page.goto(`${url}/student/events`);
 await check('Missing organization RPC is visible and does not grant fallback creation',async()=>{await page.getByRole('alert').filter({hasText:'Could not verify current organization access'}).waitFor();assert(await page.getByRole('button',{name:'Create event',exact:true}).count()===0,'Creation enabled without a verified organization');});
 await missing.ctx.close();
 // An isolated extension uses the browser's actual tabs.setZoom API. It is
 // removed with the temporary browser profile; CSS zoom/pinch is not substituted.
 const tempRoot=path.join(os.tmpdir(),'plv-navisync-browser-profiles'); fs.mkdirSync(tempRoot,{recursive:true});
 const zoomRoot=fs.mkdtempSync(path.join(tempRoot,'continuity-zoom-'));
 const extension=path.join(zoomRoot,'extension'); fs.mkdirSync(extension);
 fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Disposable continuity zoom check',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));
 fs.writeFileSync(path.join(extension,'worker.js'),'chrome.runtime.onInstalled.addListener(() => {});');
 let zoomContext;
 try {
  zoomContext=await chromium.launchPersistentContext(path.join(zoomRoot,'profile'),{headless:false,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',viewport:{width:1440,height:900},reducedMotion:'reduce',args:['--headless=new',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const worker=zoomContext.serviceWorkers()[0] || await zoomContext.waitForEvent('serviceworker',{timeout:10000});
  await openRole('student_org',{width:1440,height:900},zoomContext); await page.goto(`${url}/student/events`);
  await page.getByRole('heading',{name:'Organization Events',exact:true}).waitFor();
  const zoom=await worker.evaluate(async appUrl=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(tab=>tab.url?.startsWith(`${appUrl}/student/events`));if(!tab)throw new Error('App browser tab unavailable');await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);},url);
  await check('Actual 200% browser zoom reflow and reachable proposal action',async()=>{
   assert(zoom===2,'Browser zoom is not 200%');
   await page.waitForFunction(()=>innerWidth<1000);
   const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
   await noOverflow(); await reachable(page.getByRole('button',{name:'Create event',exact:true}),viewport);
   await page.screenshot({path:`${out}/actual-browser-zoom-200.png`,fullPage:true});
   report.actualZoom={factor:zoom,...viewport};
  });
 } catch(error) { report.checks.push({name:'Actual 200% browser zoom',status:'UNVERIFIED',error:error.message.split('\n')[0]});console.log(JSON.stringify(report.checks.at(-1))); }
 finally {
  await zoomContext?.close();
  if(path.dirname(path.resolve(zoomRoot))!==path.resolve(tempRoot)||!path.basename(zoomRoot).startsWith('continuity-zoom-'))throw new Error('Unsafe browser profile cleanup path');
  fs.rmSync(zoomRoot,{recursive:true,force:true});
 }
} finally {
 await browser.close();
 fs.writeFileSync(`${out}/ui-results.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.checks.filter(check=>check.status==='PASS').length,failed:report.checks.filter(check=>check.status==='FAIL').length,pageErrors:report.pageErrors.length}));
 if(report.checks.some(check=>check.status==='FAIL')||report.pageErrors.length)process.exitCode=1;
}
