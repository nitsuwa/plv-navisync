// Local disposable PostgreSQL only. Does not read .env or connect to Supabase.
import { PGlite } from '../../../.tmp/event-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { continuityFixtureSql } from './sql-fixture.mjs';
const db = new PGlite();
try {
  await db.exec(continuityFixtureSql);
  const migration = 'supabase/migrations/20261009120000_event_organization_access.sql';
  if (existsSync(migration)) await db.exec(readFileSync(migration,'utf8'));
  await db.exec(readFileSync('supabase/tests/event_organization_access_assertions.sql','utf8'));
  const before=(await db.query('select count(*)::int as count from event_organization_grants')).rows[0].count;
  await db.exec(readFileSync(migration,'utf8'));
  const after=(await db.query('select count(*)::int as count from event_organization_grants')).rows[0].count;
  await db.query('select continuity_test.assert($1,$2)',['migration replay preserves assignment history',before===after]);
  const checks = (await db.query('select name from continuity_test.results order by name')).rows;
  writeFileSync('docs/verification/organization-event-continuity/sql-access-results.json',JSON.stringify({status:'PASS',engine:'PGlite PostgreSQL; single session',checks},null,2));
  console.log(`${checks.length} organization access SQL checks PASS`);
} catch (error) {
  console.error(JSON.stringify({status:'FAIL',code:error.code,message:error.message}));
  process.exitCode=1;
} finally { await db.close(); }
