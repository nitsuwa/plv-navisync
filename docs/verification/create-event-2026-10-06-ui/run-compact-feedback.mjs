// Existing Org account; controlled owner-event responses simulate GSO updates. No database writes.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const out = 'docs/verification/create-event-2026-10-06-ui/evidence/compact-feedback'; fs.mkdirSync(out, { recursive: true });
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {auth:{persistSession:false}});
const login = await client.auth.signInWithPassword({email:env.VITE_DEMO_ORG_STUDENT_EMAIL,password:env.VITE_DEMO_ORG_STUDENT_PASSWORD});
if(login.error) throw new Error('Sign-in failed');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try {
 const context=await browser.newContext();
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`,session:login.data.session});
 const reads=new Set(['list_event_safe_published_campuses','list_coming_soon_campuses','list_published_event_previews','list_event_revisions']);
 await context.route('**/rest/v1/**',route=>{const r=route.request();return ['GET','HEAD'].includes(r.method())||reads.has(new URL(r.url()).pathname.split('/rpc/')[1])?route.continue():route.abort();});
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:5173/student/events');
 const card=page.locator('article').filter({has:page.getByText('TEST upcoming',{exact:true})}).first();
 await card.getByRole('link',{name:'View maps'}).click({timeout:60000});
 const checklist=page.locator('[data-feedback-checklist]');
 await checklist.waitFor({timeout:60000});
 for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844],['landscape',740,390],['tablet',768,1024]]){
  await page.setViewportSize({width,height});
  if(await checklist.getAttribute('open')!==null) await checklist.locator('summary').click();
  const b=await checklist.boundingBox(); if(b.height>65)throw Error(name+' collapsed too tall '+b.height);
  await page.screenshot({path:`${out}/${name}-closed.png`});
  await checklist.locator('summary').click();
  await page.screenshot({path:`${out}/${name}-open.png`});
  await checklist.getByRole('button',{name:'Show pin 1 on map'}).click();
  if(await checklist.getAttribute('open')!==null)throw Error('Locate did not collapse');
  const feedback=page.locator('[data-map-feedback]'); await feedback.locator('summary').click();
  const f=await feedback.boundingBox();if(f.width>281||f.x<0||f.x+f.width>width)throw Error('Feedback clipped');
  await feedback.locator('summary').click();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow');
  console.log('PASS '+name);
 }
} finally {await browser.close(); await client.auth.signOut({scope:'local'});}
