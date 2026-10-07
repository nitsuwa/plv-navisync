// Current configured project: explicit user authorization, existing identities only.
// Read-only reconnaissance. No account provisioning and no credential output.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const i = line.indexOf('='); return [line.slice(0,i), line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]; }));
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'docs/verification/create-event-2026-10-03';
const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
function assert(value,message){if(!value)throw new Error(message);}
const report = {project: new URL(env.VITE_SUPABASE_URL).hostname, roles:[], browser:[]};
try {
  for (const [label,prefix,route] of [['org','VITE_DEMO_ORG_STUDENT','/student/events'],['admin','VITE_DEMO_ADMIN','/admin-dashboard/event-layouts'],['student','VITE_DEMO_STUDENT','/home']]) {
    const client = createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const login = await client.auth.signInWithPassword({email:env[`${prefix}_EMAIL`],password:env[`${prefix}_PASSWORD`]});
    if(login.error) { report.roles.push({label,authenticated:false,error:login.error.message}); continue; }
    const profile = await client.from('profiles').select('role,is_active').eq('id',login.data.user.id).single();
    report.roles.push({label,authenticated:true,profile:profile.data,error:profile.error?.message});
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    const storageKey=`sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:storageKey,session:login.data.session});
    const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5173'+route); await page.waitForLoadState('networkidle');
    if(label==='org') await page.getByRole('button',{name:'Create event',exact:true}).waitFor({timeout:60000});
    if(label==='admin') await page.getByRole('button',{name:'Review submission',exact:true}).first().waitFor({timeout:60000});
    await page.screenshot({path:`${output}/${label}-desktop.png`,fullPage:true});
    report.browser.push({label,url:page.url(),text:(await page.locator('body').innerText()).slice(0,5500),errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
    if(label==='admin') {
      await page.getByRole('button',{name:'Review submission',exact:true}).first().click();
      await page.getByRole('button',{name:'Preview requested maps',exact:true}).waitFor();
      await page.screenshot({path:`${output}/admin-review-desktop.png`,fullPage:true});
      await page.getByRole('button',{name:/Event starts time:/}).click();
      await page.getByRole('button',{name:'Minute 59',exact:true}).scrollIntoViewIfNeeded();
      await page.getByRole('button',{name:'Minute 59',exact:true}).click();
      await page.getByRole('button',{name:'Hour 12',exact:true}).click();
      await page.getByRole('button',{name:'PM',exact:true}).click();
      await page.screenshot({path:`${output}/time-picker-desktop.png`,fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:`${output}/time-picker-mobile.png`,fullPage:true});
      await page.getByRole('button',{name:'Done',exact:true}).click();
      assert((await page.getByRole('button',{name:/Event starts time:/}).innerText()).includes('12:59 PM'),'Time picker conversion incorrect');
      report.browser.push({label:'T01',status:'PASS',case:'Minute 59 and noon PM selection in desktop/mobile popover'});
      await page.setViewportSize({width:1440,height:900});
      await page.getByRole('button',{name:'Preview requested maps',exact:true}).click();
      await page.getByRole('button',{name:'Pan map',exact:true}).waitFor({timeout:60000});
      await page.screenshot({path:`${output}/preview-desktop.png`,fullPage:true});
      const canvas=page.getByLabel('Event layout canvas',{exact:true});
      const rect=await canvas.boundingBox(); assert(rect&&rect.height>100,'Canvas collapsed');
      await canvas.focus(); await page.keyboard.press('h');
      assert(await page.getByRole('button',{name:'Pan map',exact:true}).getAttribute('aria-pressed')==='false','H did not toggle pan');
      await page.keyboard.press('h'); await page.keyboard.press('0');
      const outerScroll=await page.evaluate(()=>scrollY);
      await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2); await page.mouse.wheel(0,200);
      assert(await page.evaluate(()=>scrollY)===outerScroll,'Canvas wheel leaked to page');
      const beforePan=await page.getByTestId('event-canvas-content').getAttribute('style');
      await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2); await page.mouse.down(); await page.mouse.move(rect.x+rect.width/2+50,rect.y+rect.height/2+30,{steps:5}); await page.mouse.up();
      assert(await page.getByTestId('event-canvas-content').getAttribute('style')!==beforePan,'Drag did not pan');
      report.browser.push({label:'preview-pan-scroll',status:'PASS'});
      await page.getByRole('button',{name:'Furniture summary',exact:true}).last().click();
      await page.getByRole('dialog',{name:'Event furniture summary',exact:true}).waitFor();
      await page.screenshot({path:`${output}/furniture-desktop.png`,fullPage:true});
      await page.getByRole('button',{name:'Close furniture summary',exact:true}).click();
      await page.getByRole('button',{name:'Add pin',exact:true}).click();
      await canvas.click({position:{x:rect.width/2,y:rect.height/2}});
      await page.getByLabel('Pin comment',{exact:true}).fill('QA local draft only: reposition the booth');
      await page.screenshot({path:`${output}/pin-draft-desktop.png`,fullPage:true});
      await page.getByRole('button',{name:'Close map preview',exact:true}).click();
      await page.getByRole('alertdialog',{name:'Discard this unsaved pin?',exact:true}).waitFor();
      await page.getByRole('button',{name:'Keep pin draft',exact:true}).click();
      assert(await page.getByLabel('Pin comment',{exact:true}).inputValue()==='QA local draft only: reposition the booth','Draft lost on canceled close');
      await page.getByRole('button',{name:'Save pin',exact:true}).click();
      assert(await page.getByRole('button',{name:/Feedback pin 1:/}).count()===1,'Staged pin missing');
      report.browser.push({label:'F01-F03',status:'PASS',case:'Visible draft, canceled discard preserves comment, Save pin stages to review only'});
      report.browser.push({label:'preview',text:(await page.getByRole('dialog').last().innerText()).slice(0,4000)});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:`${output}/preview-mobile.png`,fullPage:true});
      for(const [width,height] of [[768,1024],[1920,1080],[844,390],[720,450]]) {
        await page.setViewportSize({width,height});
        const viewport=await canvas.boundingBox();
        assert(viewport.height>(height<=450?120:60),'Map collapsed at '+width+'x'+height);
        const controls=await page.getByRole('button',{name:'Zoom out',exact:true}).boundingBox();
        assert(controls.x>=0&&controls.x+controls.width<=width,'Toolbar clipped at '+width);
        await page.screenshot({path:`${output}/preview-${width}x${height}.png`,fullPage:true});
      }
      await page.evaluate(()=>document.documentElement.classList.add('dark'));
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:`${output}/preview-mobile-dark.png`,fullPage:true});
      await page.evaluate(()=>document.documentElement.classList.remove('dark'));
      report.browser.push({label:'responsive-preview',status:'PASS',case:'390,768,1440,1920,short-landscape and 720x450 effective viewport; light/dark screenshots'});
      await page.getByRole('button',{name:'Close map preview',exact:true}).click();
      await page.screenshot({path:`${output}/admin-review-mobile.png`,fullPage:true});
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'Discard review',exact:true}).click();
      await page.setViewportSize({width:1440,height:900});
    }
    if(label==='org') {
      const create=page.getByRole('button',{name:'Create event',exact:true});
      if(await create.count()) { await create.click(); await page.getByRole('dialog').waitFor(); await page.screenshot({path:`${output}/create-desktop.png`,fullPage:true}); report.browser.push({label:'creation',text:(await page.locator('body').innerText()).slice(0,3000)}); }
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:`${output}/${label}-mobile.png`,fullPage:true});
    await context.close();
    await client.auth.signOut({scope:'local'});
  }
} finally { await browser.close(); fs.writeFileSync(`${output}/current-session.json`,JSON.stringify(report,null,2)); }
console.log(JSON.stringify(report));
