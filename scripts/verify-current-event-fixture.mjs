// Explicitly authorized existing-project QA. Only a UUID created by this run is mutable.
// No service role, account creation, password reset, schema changes or existing-event writes.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertAllowlistedPublicEventPreview } from './event-full-pack-verifier-safety.mjs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const output='docs/verification/create-event-2026-10-03/live-fixture.json';
const report={project:new URL(env.VITE_SUPABASE_URL).hostname,id:randomUUID(),created:false,cleaned:false,checks:[]};
const clients=[]; const anon=makeClient(); let org,admin,student;
function makeClient(){return createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY??env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
function assert(c,m){if(!c)throw new Error(m);}
function pass(name){report.checks.push({name,status:'PASS'}); console.log('PASS '+name); fs.writeFileSync(output,JSON.stringify(report,null,2));}
async function signIn(prefix){const client=makeClient();const r=await client.auth.signInWithPassword({email:env[prefix+'_EMAIL'],password:env[prefix+'_PASSWORD']});assert(!r.error&&r.data.user,'Configured account login failed');clients.push(client);return {client,id:r.data.user.id};}
async function row(){const r=await org.client.from('map_elements').select('id,campus_id,metadata,updated_at').eq('id',report.id).single();assert(!r.error&&r.data, 'QA row read failed');return r.data;}
async function history(){const r=await org.client.rpc('list_event_revisions',{p_overlay_id:report.id});assert(!r.error&&Array.isArray(r.data),'History RPC unavailable');return r.data;}
async function denied(name,action){const before=JSON.stringify({row:await row(),history:await history()});const r=await action();assert(r.error || r.data===null || (Array.isArray(r.data)&&!r.data.length),name+' unexpectedly succeeded');assert(before===JSON.stringify({row:await row(),history:await history()}),name+' changed QA state');pass(name);}
async function write(metadata){const old=await row();const r=await org.client.from('map_elements').update({metadata}).eq('id',report.id).eq('updated_at',old.updated_at).select('id').single();assert(!r.error,r.error?.message??'Update failed');return row();}
async function resolve(addressed,expected){const old=await row();return org.client.rpc('set_event_feedback_pin_addressed',{p_overlay_id:report.id,p_expected_updated_at:expected??old.updated_at,p_location_id:'qa-grounds',p_pin_id:'qa-pin',p_addressed:addressed,p_note:addressed?'QA: moved booth away from entrance':''});}
try {
  org=await signIn('VITE_DEMO_ORG_STUDENT');admin=await signIn('VITE_DEMO_ADMIN');student=await signIn('VITE_DEMO_STUDENT');
  const versions=await org.client.from('campus_versions').select('campus_id,snapshot').eq('state','published').limit(1);
  assert(!versions.error&&versions.data?.length,'No published campus available'); report.campusId=versions.data[0].campus_id;
  const furniture=[{id:'qa-booth',type:'booth',name:'QA booth',category:'event',x:30,y:30,width:30,height:30,rotation:0,color:'#123456',layer:'events'}];
  const locations=[{id:'qa-grounds',locationRef:{type:'campus',label:'Campus Grounds'},eventFurniture:furniture,eventLabels:[]}];
  const metadata={id:report.id,kind:'event_overlay',title:'QA disposable Create Event '+report.id.slice(0,8),description:'Authorized completion verification; safe to remove',organizer:'QA existing Student Org',createdByUserId:org.id,status:'draft',isActive:true,markers:[],restrictedAreas:[],locations,locationRef:locations[0].locationRef,eventFurniture:furniture,eventLabels:[]};
  const insert=await org.client.from('map_elements').insert({id:report.id,campus_id:report.campusId,element_type:'event_overlay',name:metadata.title,x:0,y:0,metadata,is_visible:true,is_searchable:false,is_accessible:false,is_emergency_asset:false,z_index:0,rotation:0,search_keywords:[],style:{}}).select('id').single();
  assert(!insert.error,insert.error?.message??'QA insert failed');report.created=true;pass('L01 owner creates disposable draft on published campus');
  for(const [name,client] of [['regular student',student.client],['anonymous',anon]]){
    const read=await client.from('map_elements').select('id,metadata').eq('id',report.id).maybeSingle();assert(read.error||!read.data,name+' reads private event');pass(name+' cannot read private draft');
    await denied(name+' cannot address owner pin',()=>client.rpc('set_event_feedback_pin_addressed',{p_overlay_id:report.id,p_expected_updated_at:new Date().toISOString(),p_location_id:'qa-grounds',p_pin_id:'qa-pin',p_addressed:true,p_note:''}));
  }
  await denied('owner cannot forge resolution audit',async()=>{const old=await row();return org.client.from('map_elements').update({metadata:{...old.metadata,feedbackResolutions:{'qa-grounds':{'qa-pin':{addressedBy:org.id,addressedAt:new Date().toISOString()}}}}}).eq('id',report.id).select('id');});
  let current=await row();current=await write({...current.metadata,status:'pending',submittedAt:new Date().toISOString(),adminComment:null});pass('L01 owner submits draft');
  const firstSubmitted=current.metadata.submittedAt;const staleVersion=current.updated_at;
  const updatedLocations=structuredClone(current.metadata.locations);updatedLocations[0].eventFurniture[0].x=40;
  const pending=await org.client.rpc('save_pending_event_layout',{p_overlay_id:report.id,p_expected_updated_at:current.updated_at,p_locations:updatedLocations});assert(!pending.error,pending.error?.message??'Pending RPC failed');
  current=await row();assert(current.metadata.status==='pending'&&current.metadata.submittedAt===firstSubmitted,'Pending save loses original submission');pass('L02 pending RPC preserves status and submission time');
  const feedback='@event-feedback/v1:'+JSON.stringify({text:'QA entrance issue',pins:[{id:'qa-pin',x:40,y:40,comment:'Move booth clear of the entrance'}]});
  const reviewArgs=()=>({p_overlay_id:report.id,p_expected_updated_at:current.updated_at,p_decision:'disapproved',p_date_start:null,p_date_end:null,p_publication_mode:'now',p_publication_at:null,p_admin_comment:'QA: address the entrance pin',p_location_feedback:{'qa-grounds':feedback}});
  await denied('admin stale review rejected',()=>admin.client.rpc('review_event_layout',{...reviewArgs(),p_expected_updated_at:staleVersion}));
  const review=await admin.client.rpc('review_event_layout',reviewArgs());assert(!review.error,review.error?.message??'Review failed');pass('F03 super admin rejects with persisted pin');
  current=await row();await denied('L04 open-pin resubmission rejected',()=>org.client.from('map_elements').update({metadata:{...current.metadata,status:'pending',adminComment:null,submittedAt:new Date().toISOString()}}).eq('id',report.id).select('id'));
  const beforeAck=current.updated_at;let ack=await resolve(true);assert(!ack.error,ack.error?.message??'Ack failed');current=await row();
  const resolution=current.metadata.feedbackResolutions['qa-grounds']['qa-pin'];assert(resolution.addressedBy===org.id&&Number.isFinite(Date.parse(resolution.addressedAt))&&resolution.note.includes('QA:'),'Audit not persisted');pass('F04 owner acknowledgement actor/time/note persist');
  await denied('F08 stale acknowledgement rejected',()=>resolve(false,beforeAck));
  ack=await resolve(false);assert(!ack.error,'Reopen failed');current=await row();assert(!current.metadata.feedbackResolutions['qa-grounds']['qa-pin'],'Pin remains addressed');pass('F05 owner reopens pin');
  ack=await resolve(true);assert(!ack.error,'Second acknowledgement failed');current=await row();
  current=await write({...current.metadata,status:'pending',adminComment:null,submittedAt:new Date().toISOString()});assert(current.metadata.locationFeedback['qa-grounds']===feedback&&current.metadata.feedbackResolutions['qa-grounds']['qa-pin'].addressedBy===org.id,'Resubmit erased evidence');pass('L05 resubmission preserves feedback and resolution evidence');
  const revisions=await history();assert(revisions.some(r=>JSON.stringify(r).includes('feedbackResolutions')),'Missing resolution audit');pass('H02 owner revision history contains feedback changes');
  await denied('regular student cannot read private history',()=>student.client.rpc('list_event_revisions',{p_overlay_id:report.id}));
  const withdrawn=await org.client.rpc('withdraw_event_submission',{p_overlay_id:report.id,p_expected_updated_at:current.updated_at});assert(!withdrawn.error,withdrawn.error?.message??'Withdraw failed');current=await row();assert(current.metadata.status==='draft'&&current.metadata.locations[0].eventFurniture[0].x===40,'Withdraw loses layout');pass('L03 withdrawal preserves saved furniture');
  const feed=await anon.rpc('list_published_event_previews',{p_campus_id:report.campusId});assert(!feed.error&&Array.isArray(feed.data?.events),'Public feed unavailable');assertAllowlistedPublicEventPreview(feed.data.events);assert(!feed.data.events.some(e=>e.id===report.id),'Draft leaks into public feed');pass('P02 recursive public privacy and draft exclusion');
  report.checks.push({name:'Unrelated Student Org B / separate admin role',status:'BLOCKED',reason:'No separate configured identities; no new accounts requested.'},{name:'Live approval/publication positive fixture',status:'NOT RUN',reason:'Approved rows cannot be deleted; controlled-clock automated coverage used, no persistent live approved test event introduced.'});
} catch(e){report.failure=e.message;console.log('FAIL '+e.message);process.exitCode=1;}
finally{
  if(report.created&&org){try{let current=await row();if(current.metadata.status==='pending'){await org.client.rpc('withdraw_event_submission',{p_overlay_id:report.id,p_expected_updated_at:current.updated_at});current=await row();}if(['draft','disapproved'].includes(current.metadata.status)&&current.metadata.createdByUserId===org.id&&current.metadata.title.startsWith('QA disposable Create Event ')){const d=await org.client.from('map_elements').delete().eq('id',report.id).select('id');report.cleaned=!d.error&&d.data?.some(r=>r.id===report.id);if(d.error)report.cleanupError=d.error.message;}}catch(e){report.cleanupError=e.message;}}
  for(const client of clients)await client.auth.signOut({scope:'local'});
  fs.writeFileSync(output,JSON.stringify(report,null,2));console.log('Fixture '+report.id+' cleaned='+report.cleaned);
}
