// Read-only business-data inventory through the existing demo administrator.
// No event/grant/schema mutations, no persisted auth session, no live QA records.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1).trim().replace(/^['"]|['"]$/g,'')];}));
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const report={capturedAt:new Date().toISOString(),mode:'Authenticated administrator RLS view; read-only exact API counts before continuity SQL installation',sources:[],retainedEventQaRecords:0};
try{
 const login=await client.auth.signInWithPassword({email:env.VITE_DEMO_ADMIN_EMAIL,password:env.VITE_DEMO_ADMIN_PASSWORD});
 if(login.error||!login.data.user)throw new Error('Existing administrator sign-in could not be verified.');
 const profile=await client.from('profiles').select('role,is_active').eq('id',login.data.user.id).single();
 if(profile.error||!profile.data?.is_active||!['admin','super_admin'].includes(profile.data.role))throw new Error('The configured account is not a verified active administrator.');
 const requests=[
  ['events',client.from('events').select('id',{head:true,count:'exact'})],
  ['event_locations',client.from('event_locations').select('id',{head:true,count:'exact'})],
  ['event_overlays',client.from('map_elements').select('id',{head:true,count:'exact'}).or('element_type.eq.event_overlay,metadata->>kind.eq.event_overlay')],
  ['event_layout_revisions',client.from('event_layout_revisions').select('id',{head:true,count:'exact'})],
 ];
 const results=await Promise.all(requests.map(async([source,query])=>{
  const result=await query;return {source,count:result.count,status:result.error?'UNVERIFIED':'PASS',errorCode:result.error?.code};
 }));
 report.sources=results;
 report.status=results.every(result=>result.status==='PASS'&&Number.isInteger(result.count))?'PASS':'UNVERIFIED';
 report.limitations='API counts follow existing administrator RLS. Complete owner-level poster/receipt counts and the post-migration comparison still require the user-run SQL checklist.';
}catch(error){report.status='UNVERIFIED';report.error=error.message;process.exitCode=1;}
finally{
 await client.auth.signOut({scope:'local'}).catch(()=>{});
 fs.writeFileSync('docs/verification/organization-event-continuity/live-source-counts.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
 if(report.status!=='PASS')process.exitCode=1;
}
