// Hosted schema probes, existing events only. No event/content or receipt writes.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const output='docs/verification/event-sync-next-batch/live-api.json';
const result={mode:'Hosted schema/role probes; existing events only; no writes',checks:[],status:'RUNNING'};
const makeClient=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const check=(ok,label)=>{if(!ok)throw new Error(label);result.checks.push(label);console.log(`PASS ${label}`);};
const clients={admin:makeClient(),org:makeClient(),student:makeClient(),anon:makeClient()};
async function login(role,prefix){const {data,error}=await clients[role].auth.signInWithPassword({email:env[`${prefix}_EMAIL`],password:env[`${prefix}_PASSWORD`]});if(error||!data.user)throw new Error(`Configured ${role} sign-in failed`);return data.user.id;}
try{
  const adminId=await login('admin','VITE_DEMO_ADMIN');
  const orgId=await login('org','VITE_DEMO_ORG_STUDENT');
  const studentId=await login('student','VITE_DEMO_STUDENT');
  const cutoff=await clients.admin.rpc('get_admin_activity_clear_cutoff');check(!cutoff.error,'Admin activity cutoff RPC installed');
  const prefs=await clients.admin.from('admin_activity_preferences').select('admin_id').limit(1);check(!prefs.error,'Original activity preferences endpoint no longer returns 404');
  const events=await clients.admin.from('map_elements').select('id,campus_id,name,metadata,updated_at').or('element_type.eq.event_overlay,metadata->>kind.eq.event_overlay').is('archived_at',null);
  if(events.error)throw new Error('Could not read existing event fixtures');
  const pending=events.data.filter(row=>row.metadata?.status==='pending');
  const reviewed=events.data.filter(row=>['approved','disapproved'].includes(row.metadata?.status)&&row.metadata.createdByUserId===orgId);
  const payload=(row,stream)=>{const m=row.metadata;return stream==='admin_submission'?[m.submittedAt??'',m.lastEditedAt??'',m.revision??0]:[m.submittedAt??null,m.status,m.adminComment??'',m.locationFeedback??{}];};
  const candidates=(rows,stream)=>rows.map(row=>({event_id:row.id,payload:payload(row,stream)}));
  const adminStates=await clients.admin.rpc('get_event_notification_states',{p_expected_user_id:adminId,p_stream:'admin_submission',p_candidates:candidates(pending,'admin_submission')});
  check(!adminStates.error&&adminStates.data.length===pending.length,'Admin state RPC reads existing pending submissions');
  check(adminStates.data.every(row=>row.is_current),'Admin displayed payloads match hosted metadata');
  const orgStates=await clients.org.rpc('get_event_notification_states',{p_expected_user_id:orgId,p_stream:'org_review',p_candidates:candidates(reviewed,'org_review')});
  check(!orgStates.error&&orgStates.data.length===reviewed.length,'Org state RPC reads existing reviewed proposals');
  check(orgStates.data.every(row=>row.is_current),'Org displayed payloads match hosted metadata');
  const foreignActor=await clients.admin.rpc('get_event_notification_states',{p_expected_user_id:orgId,p_stream:'admin_submission',p_candidates:[]});check(foreignActor.error?.code==='42501','Expected actor mismatch is denied');
  const regular=await clients.student.rpc('get_event_notification_states',{p_expected_user_id:studentId,p_stream:'org_review',p_candidates:[]});check(regular.error?.code==='42501','Regular Student cannot read private Org notifications');
  const anonymous=await clients.anon.rpc('get_event_notification_states',{p_expected_user_id:adminId,p_stream:'admin_submission',p_candidates:[]});check(Boolean(anonymous.error),'Anonymous receipt RPC access denied');
  const table=await clients.student.from('event_notification_receipts').select('event_id').limit(5);check(!table.error&&table.data.length===0,'Regular Student cannot SELECT private receipt rows');
  result.existingPending=pending.length;result.existingOrgReviews=reviewed.length;
  const allEvents=await clients.admin.from('map_elements').select('id,name,metadata,archived_at').or('element_type.eq.event_overlay,metadata->>kind.eq.event_overlay');
  if(allEvents.error)throw new Error('Could not inspect archived event visibility');
  result.archivedPending=allEvents.data.filter(row=>row.archived_at&&row.metadata?.status==='pending').map(row=>({id:row.id,title:row.metadata.title??row.name,archived:true}));
  result.browserCandidates={admin:pending.map(row=>({id:row.id,title:row.metadata.title,wasRead:adminStates.data.find(state=>state.event_id===row.id)?.is_read})),org:reviewed.map(row=>({id:row.id,title:row.metadata.title,wasRead:orgStates.data.find(state=>state.event_id===row.id)?.is_read}))};
  result.status='PASS';console.log(JSON.stringify({status:result.status,pending:pending.length,orgReviews:reviewed.length,archivedPending:result.archivedPending.length}));
}catch(error){result.status='FAIL';result.failure=error.message;console.error(error.message);process.exitCode=1;}
finally{fs.writeFileSync(output,JSON.stringify(result,null,2));}
