import {PGlite} from '../../../.tmp/event-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {continuityFixtureSql} from './sql-fixture.mjs';
import {eventFixtureSql,baselineEventMigrations,eventPreOwnershipHistorySql} from './event-fixture.mjs';

const db=new PGlite();
let stage='initializing';
try{
  stage='test identity fixture';await db.exec(continuityFixtureSql);
  stage='event fixture';await db.exec(eventFixtureSql);
  for(const migration of baselineEventMigrations){
    stage=`baseline migration ${migration}`;
    let sql=readFileSync(`supabase/migrations/${migration}`,'utf8');
    if(migration==='20261005033712_isolate_event_overlays_from_campus_structure_save.sql')sql=sql.replaceAll('\r','');
    await db.exec(sql);
  }
  stage='seed existing event history';await db.exec(eventPreOwnershipHistorySql);
  stage='SQL handoff preflight';
  const preflight=await db.exec(readFileSync('docs/verification/organization-event-continuity/preflight.sql','utf8'));
  assert(preflight[0].rows.every(row=>row.present)&&preflight[1].rows.every(row=>row.present),'Preflight dependencies must exist');
  for(const migration of ['20261009120000_event_organization_access.sql','20261009130000_event_organization_ownership.sql']){
    stage=`organization migration ${migration}`;await db.exec(readFileSync(`supabase/migrations/${migration}`,'utf8'));
  }
  for(const [index,sql] of readFileSync('supabase/tests/event_organization_handover_assertions.sql','utf8').split(/;\s*\r?\n/).map(sql=>sql.trim()).filter(Boolean).entries()){
    stage=`handover assertion ${index+1}: ${sql.slice(-100)}`;await db.exec(`${sql};`);
  }
  stage='historical reuse migration';await db.exec(readFileSync('supabase/migrations/20261009140000_event_organization_reuse.sql','utf8'));
  for(const [index,sql] of readFileSync('supabase/tests/event_organization_reuse_assertions.sql','utf8').split(/;\s*\r?\n/).map(sql=>sql.trim()).filter(Boolean).entries()){
    stage=`reuse assertion ${index+1}: ${sql.slice(-120)}`;await db.exec(`${sql};`);
  }
  stage='organization notification migration';await db.exec(readFileSync('supabase/migrations/20261009150000_event_organization_notifications.sql','utf8'));
  for(const [index,sql] of readFileSync('supabase/tests/event_organization_notification_assertions.sql','utf8').split(/;\s*\r?\n/).map(sql=>sql.trim()).filter(Boolean).entries()){
    stage=`notification assertion ${index+1}: ${sql.slice(-120)}`;await db.exec(`${sql};`);
  }
  const checks=(await db.query('select name from continuity_test.results order by name')).rows;
  stage='SQL handoff postflight';
  const postflight=await db.exec(readFileSync('docs/verification/organization-event-continuity/postflight.sql','utf8'));
  assert(postflight[0].rows.every(row=>row.present)&&postflight[1].rows.every(row=>row.present),'Postflight contracts must exist');
  assert(postflight[2].rows.every(row=>row.rls_enabled),'Protected continuity tables must retain RLS');
  assert.equal(postflight.at(-1).rows.length,0,'There must be no duplicate open assignments');
  checks.push({name:'SQL handoff preflight/postflight queries and readiness checks'});
  writeFileSync('docs/verification/organization-event-continuity/sql-reuse-results.json',JSON.stringify({status:'PASS',engine:'PGlite PostgreSQL; real baseline and organization event migrations; disposable single-session fixture',checks},null,2));
  console.log(`${checks.length} organization handover, historical reuse, and notification SQL checks PASS`);
}catch(error){
  console.error(JSON.stringify({status:'FAIL',stage,code:error.code,message:error.message}));
  process.exitCode=1;
}finally{await db.close();}
