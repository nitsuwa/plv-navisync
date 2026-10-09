import {PGlite} from '../../../.tmp/event-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {continuityFixtureSql} from './sql-fixture.mjs';
import {eventFixtureSql,baselineEventMigrations,eventPreOwnershipHistorySql} from './event-fixture.mjs';
const db=new PGlite();
let stage='initializing';
try{
  stage='test identity fixture';await db.exec(continuityFixtureSql);stage='event fixture';await db.exec(eventFixtureSql);
  for(const migration of baselineEventMigrations){stage=`baseline migration ${migration}`;let sql=readFileSync(`supabase/migrations/${migration}`,'utf8');if(migration==='20261005033712_isolate_event_overlays_from_campus_structure_save.sql')sql=sql.replaceAll('\r','');await db.exec(sql);}
  stage='seed existing event history';await db.exec(eventPreOwnershipHistorySql);
  stage='organization access migration';await db.exec(readFileSync('supabase/migrations/20261009120000_event_organization_access.sql','utf8'));
  const migration='supabase/migrations/20261009130000_event_organization_ownership.sql';
  if(existsSync(migration)){stage='event ownership migration';await db.exec(readFileSync(migration,'utf8'));}
  const assertions=readFileSync('supabase/tests/event_organization_handover_assertions.sql','utf8').split(/;\s*\r?\n/).map(sql=>sql.trim()).filter(Boolean);
  for(const [index,sql] of assertions.entries()){stage=`organization assertion ${index+1}: ${sql.slice(-100)}`;await db.exec(`${sql};`);}
  const checks=(await db.query('select name from continuity_test.results order by name')).rows;
  writeFileSync('docs/verification/organization-event-continuity/sql-handover-results.json',JSON.stringify({status:'PASS',engine:'PGlite PostgreSQL; real baseline migrations; single session',checks},null,2));
  console.log(`${checks.length} organization event handover SQL checks PASS`);
}catch(error){console.error(JSON.stringify({status:'FAIL',stage,code:error.code,message:error.message}));process.exitCode=1;}
finally{await db.close();}
