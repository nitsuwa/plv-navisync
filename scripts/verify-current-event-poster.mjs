// Only a new random QA object is eligible for upload/cleanup. No event rows touched.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const report={bucket:'event_posters',path:`posters/qa-${randomUUID()}.png`,uploaded:false,cleaned:false};
try{
 const login=await client.auth.signInWithPassword({email:env.VITE_DEMO_ORG_STUDENT_EMAIL,password:env.VITE_DEMO_ORG_STUDENT_PASSWORD});
 if(login.error)throw new Error('Configured Org login failed');
 report.path=`${login.data.user.id}/qa-${randomUUID()}.png`;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=','base64');
 const result=await client.storage.from(report.bucket).upload(report.path,png,{contentType:'image/png',upsert:false});
 report.uploaded=!result.error;report.error=result.error?.message;report.status=result.error?.statusCode;
 if(report.uploaded){
  const {data}=client.storage.from(report.bucket).getPublicUrl(report.path);
  const response=await fetch(data.publicUrl);
  report.publicReadStatus=response.status;
  report.publicRead=response.ok&&Buffer.from(await response.arrayBuffer()).equals(png);
  if(!report.publicRead)throw new Error('Anonymous public poster read failed');
 }
}catch(error){report.verificationError=error.message;process.exitCode=1;}
finally{
 if(report.uploaded){const cleanup=await client.storage.from(report.bucket).remove([report.path]);report.cleaned=!cleanup.error;report.cleanupError=cleanup.error?.message;if(!report.cleaned)process.exitCode=1;}
 await client.auth.signOut({scope:'local'});fs.writeFileSync('docs/verification/create-event-2026-10-03/poster-storage.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
