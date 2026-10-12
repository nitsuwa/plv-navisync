// Real separate-session PostgreSQL race tests on loopback. No live credentials.
import {initdb,pg_ctl,postgres} from '../../../.tmp/event-sql-runtime/node_modules/@embedded-postgres/windows-x64/dist/index.js';
import pg from '../../../.tmp/event-sql-runtime/node_modules/pg/esm/index.mjs';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import assert from 'node:assert/strict';
import {continuityFixtureSql} from './sql-fixture.mjs';
import {eventFixtureSql,baselineEventMigrations,eventPreOwnershipHistorySql} from './event-fixture.mjs';
const allMode=process.argv.includes('--all');
const eventMode=allMode||process.argv.includes('--events');
const root=path.resolve('.tmp'),dir=path.join(root,`continuity-pg-${randomUUID()}`);
mkdirSync(dir,{recursive:true});
const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
let child,stopped=false;const clients=[];const checks=[];
const connect=async(actor)=>{const client=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await client.connect();clients.push(client);if(actor){await client.query('set role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);}return client;};
const admin='00000000-0000-0000-0000-000000000001',old='00000000-0000-0000-0000-000000000002',next='00000000-0000-0000-0000-000000000003',other='00000000-0000-0000-0000-000000000004';
try{
  execFileSync(initdb,['-D',dir,'-U','postgres','--auth=trust','--no-locale'],{windowsHide:true,stdio:'pipe'});
  child=spawn(postgres,['-D',dir,'-h','127.0.0.1','-p',String(port)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',data=>{log+=data.toString();});child.stderr.on('data',data=>{log+=data.toString();});
  await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(new Error('Local PostgreSQL did not start')),10000);const check=setInterval(()=>{if(log.includes('ready to accept connections')){clearInterval(check);clearTimeout(deadline);resolve();}},50);child.once('error',error=>{clearInterval(check);clearTimeout(deadline);reject(error);});});
  const observer=await connect();await observer.query(continuityFixtureSql);
  if(eventMode){await observer.query(eventFixtureSql);for(const migration of baselineEventMigrations){let sql=readFileSync(`supabase/migrations/${migration}`,'utf8');if(migration==='20261005033712_isolate_event_overlays_from_campus_structure_save.sql')sql=sql.replaceAll('\r','');await observer.query(sql);}await observer.query(eventPreOwnershipHistorySql);}
  await observer.query(readFileSync('supabase/migrations/20261009120000_event_organization_access.sql','utf8'));
  if(eventMode){
    await observer.query(readFileSync('supabase/migrations/20261009130000_event_organization_ownership.sql','utf8'));
    await observer.query(readFileSync('supabase/tests/event_organization_handover_assertions.sql','utf8'));
    if(allMode){
      await observer.query(readFileSync('supabase/migrations/20261009140000_event_organization_reuse.sql','utf8'));
      await observer.query(readFileSync('supabase/tests/event_organization_reuse_assertions.sql','utf8'));
      await observer.query(readFileSync('supabase/migrations/20261009150000_event_organization_notifications.sql','utf8'));
      await observer.query(readFileSync('supabase/tests/event_organization_notification_assertions.sql','utf8'));
    }
  }else await observer.query(readFileSync('supabase/tests/event_organization_access_assertions.sql','utf8'));
  checks.push(...(await observer.query('select name from continuity_test.results')).rows.map(row=>row.name));
  const a=await connect(admin),b=await connect(admin);
  const org=(await a.query("select admin_save_event_organization(null,'RACE','Race Organization',true,null) as org")).rows[0].org.id;
  const assign=(client,profile,expected)=>client.query('select admin_set_event_representative($1,$2,$3,clock_timestamp()+interval \'1 year\',$4) as context',[org,profile,'2026–2027',expected]);
  const original=(await assign(a,old,null)).rows[0].context.grant_id;
  await a.query('begin');await b.query('begin');
  const first=(await assign(a,next,original)).rows[0].context.grant_id;
  const racing=assign(b,other,original).then(()=>({success:true}),error=>({success:false,code:error.code}));
  const waitDeadline=Date.now()+3000;let waiting=false;
  while(Date.now()<waitDeadline){const result=await observer.query("select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock') as waiting");if(result.rows[0].waiting){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(waiting,true,'second replacement must wait for the organization lock');
  await a.query('commit');assert.deepEqual(await racing,{success:false,code:'40001'});await b.query('rollback');
  assert.equal((await observer.query('select id from event_organization_grants where organization_id=$1 and ended_at is null',[org])).rows[0].id,first);
  checks.push('two concurrent replacements serialize and reject stale expected grant');
  const before=(await observer.query('select to_jsonb(g) as grant from event_organization_grants g where id=$1',[first])).rows[0].grant;
  await a.query('begin');await assign(a,old,first);await a.query('rollback');
  assert.deepEqual((await observer.query('select to_jsonb(g) as grant from event_organization_grants g where id=$1',[first])).rows[0].grant,before);
  assert.equal((await observer.query('select count(*)::int as count from event_organization_grants where organization_id=$1 and ended_at is null',[org])).rows[0].count,1);
  checks.push('rolling back handover restores old grant and removes replacement');
  if(eventMode){
    const writer=await connect(next);
    const eventId='40000000-0000-0000-0000-000000000001';
    const content={title:'Race event',locations:[{id:'campus-grounds',locationRef:{type:'campus',label:'Campus Grounds'},eventFurniture:[],eventLabels:[]}]};
    const created=(await writer.query('select create_organization_event($1,$2,$3,$4,$5,$6) as event',[eventId,org,first,'10000000-0000-0000-0000-000000000001','2026–2027',content])).rows[0].event;
    await writer.query('begin');
    await writer.query("select mutate_organization_event($1,$2,$3,'details',$4)",[eventId,created.updatedAt,first,{title:'Saved before handover'}]);
    await a.query('begin');
    const transfer=assign(a,other,first);
    const deadline=Date.now()+3000;let blocked=false;
    while(Date.now()<deadline){if((await observer.query("select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock') as waiting")).rows[0].waiting){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
    assert.equal(blocked,true,'handover waits for an already-authorized save');
    await writer.query('commit');const currentGrant=(await transfer).rows[0].context.grant_id;await a.query('commit');
    const saved=(await observer.query('select updated_at,metadata from map_elements where id=$1',[eventId])).rows[0];
    assert.equal(saved.metadata.title,'Saved before handover');assert.equal(saved.metadata.createdByUserId,next);
    checks.push('an authorized save commits before handover with original creator preserved');
    const outgoing=await connect(other);
    await a.query('begin');await assign(a,old,currentGrant);
    await outgoing.query('begin');
    const late=outgoing.query("select mutate_organization_event($1,$2,$3,'details',$4)",[eventId,saved.updated_at,currentGrant,{title:'Late outgoing save'}]).then(()=>({success:true}),error=>({success:false,code:error.code}));
    const lateDeadline=Date.now()+3000;let lateBlocked=false;
    while(Date.now()<lateDeadline){if((await observer.query("select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock') as waiting")).rows[0].waiting){lateBlocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
    assert.equal(lateBlocked,true,'late save waits while handover owns the organization lock');
    await a.query('commit');assert.deepEqual(await late,{success:false,code:'42501'});await outgoing.query('rollback');
    assert.equal((await observer.query('select metadata from map_elements where id=$1',[eventId])).rows[0].metadata.title,'Saved before handover');
    checks.push('handover winning the organization lock rejects the outgoing in-flight save');
  }
  const version=(await observer.query('select version()')).rows[0].version;
  if(allMode){
    const postflight=await observer.query(readFileSync('docs/verification/organization-event-continuity/postflight.sql','utf8'));
    assert(postflight[0].rows.every(row=>row.present)&&postflight[1].rows.every(row=>row.present),'SQL handoff contracts must exist');
    assert(postflight[2].rows.every(row=>row.rls_enabled),'Protected continuity tables must retain RLS');
    assert.equal(postflight.at(-1).rows.length,0,'No duplicate open assignments');
    checks.push('SQL handoff postflight queries and readiness checks');
  }
  writeFileSync(`docs/verification/organization-event-continuity/${allMode?'sql-continuity-postgres-results':eventMode?'sql-event-concurrency-results':'sql-concurrency-results'}.json`,JSON.stringify({status:'PASS',engine:version,checks},null,2));
  console.log(`${checks.length} real PostgreSQL access/concurrency checks PASS`);
}catch(error){console.error(JSON.stringify({status:'FAIL',code:error.code,message:error.message}));process.exitCode=1;}
finally{
  await Promise.allSettled(clients.map(client=>client.end()));
  if(child){try{execFileSync(pg_ctl,['-D',dir,'stop','-m','fast','-w'],{windowsHide:true,stdio:'pipe'});stopped=true;}catch{console.error('Local database stop failed; preserving its temporary directory.');process.exitCode=1;}}
  else stopped=true;
  if(stopped){if(path.dirname(path.resolve(dir))!==root||!path.basename(dir).startsWith('continuity-pg-'))throw new Error('Unsafe local PostgreSQL cleanup path');rmSync(dir,{recursive:true,force:true});}
}
