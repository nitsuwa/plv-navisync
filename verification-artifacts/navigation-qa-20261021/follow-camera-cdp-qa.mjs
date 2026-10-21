import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outDir = path.dirname(fileURLToPath(import.meta.url));
await mkdir(outDir, { recursive: true });

const response = await fetch("http://127.0.0.1:9337/json/list");
if (!response.ok) throw new Error(`Chromium debugging endpoint returned ${response.status}`);
const targets = await response.json();
const target = targets.find((item) => item.type === "page" && item.url.includes("localhost:5173/map"));
if (!target) throw new Error("Could not find the Student Map page in isolated Chromium");

const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result ?? {});
});
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function cdp(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Browser expression failed");
  return result.result?.value;
}

async function waitFor(expression, label, timeoutMs = 12000) {
  const endAt = Date.now() + timeoutMs;
  while (Date.now() < endAt) {
    const value = await evaluate(`Boolean(${expression})`);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const debug = await evaluate(`(() => {const dialog=document.querySelector('[data-testid="route-planner-dialog"]');const summary=dialog?.querySelector('[data-testid="route-summary"]');const scroller=dialog?.querySelector('[data-testid="route-planner-scroll-region"]');const rect=(node)=>{const r=node?.getBoundingClientRect();return r&&{top:r.top,bottom:r.bottom,height:r.height}};return {url:location.href,width:innerWidth,height:innerHeight,body:document.body.innerText.slice(-1400),marked:dialog&&[...dialog.querySelectorAll('[data-testid]')].map((node)=>({id:node.dataset.testid,text:node.innerText?.slice(0,180)})),buttons:dialog&&[...dialog.querySelectorAll('button')].map((node)=>({label:node.getAttribute('aria-label'),text:node.innerText.trim(),disabled:node.disabled,testid:node.dataset.testid})),summary:summary&&{rect:rect(summary),opacity:getComputedStyle(summary).opacity,display:getComputedStyle(summary).display,visibility:getComputedStyle(summary).visibility,animations:summary.getAnimations().length,parent:summary.parentElement?.dataset.testid,parentStyle:summary.parentElement&&{opacity:getComputedStyle(summary.parentElement).opacity,display:getComputedStyle(summary.parentElement).display,visibility:getComputedStyle(summary.parentElement).visibility},html:summary.outerHTML.slice(0,1300)},scroller:rect(scroller),mobile:dialog?.dataset.mobileSheetState}})()`);
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(debug)}`);
}

async function clickButton(pattern) {
  const result = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const button = buttons.find((item) => ${pattern});
    if (!button) return null;
    button.click();
    return { label: button.getAttribute('aria-label'), text: button.innerText.trim() };
  })()`);
  if (!result) throw new Error(`Could not click button matching: ${pattern}`);
  return result;
}

async function insertText(text) {
  await cdp("Input.insertText", { text });
}

async function screenshot(name) {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(path.join(outDir, name), Buffer.from(result.data, "base64"));
}

async function mouse(type, x, y, button = "none", buttons = 0, clickCount = 0) {
  await cdp("Input.dispatchMouseEvent", { type, x, y, button, buttons, clickCount });
}

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await cdp("Page.navigate", { url: "http://localhost:5173/map" });
await waitFor("document.querySelector('main') && document.querySelector('[aria-label=\"Open directions\"]')", "Student Map controls");

await clickButton("item.getAttribute('aria-label') === 'Open directions'");
await clickButton("item.getAttribute('aria-label') === 'SOS routing'");
await clickButton("item.getAttribute('aria-label') === 'Choose start'");
await waitFor("document.querySelector('input[aria-label=\"Search start\"]')", "SOS origin search");
await evaluate("document.querySelector('input[aria-label=\"Search start\"]').focus()");
await insertText("COED 306");
await waitFor("document.querySelector('[role=option]') && [...document.querySelectorAll('[role=option]')].some((item) => item.innerText.includes('COED 306'))", "COED 306 result");
await evaluate("[...document.querySelectorAll('[role=option]')].find((item) => item.innerText.includes('COED 306')).click()");
await clickButton("item.innerText.trim() === 'Find Route'");
await waitFor("document.querySelector('[data-testid=\"mobile-route-preview-start-navigation\"]')", "compact SOS Start action");

const compact = await evaluate(`(() => {
  const panel = document.querySelector('[data-testid="route-planner-dialog"]');
  const summary = document.querySelector('[data-testid="mobile-route-preview-collapsed-summary"]');
  const start = document.querySelector('[data-testid="mobile-route-preview-start-navigation"]');
  const rect = (node) => { const r = node?.getBoundingClientRect(); return r && { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom, right:r.right }; };
  return { state:panel?.dataset.mobileSheetState, panel:rect(panel), summaryText:summary?.innerText, summary:rect(summary), start:rect(start), startVisible:Boolean(start && getComputedStyle(start).visibility !== 'hidden' && start.getBoundingClientRect().width > 0), mode:document.querySelector('[data-testid="route-preview-camera-mode"]')?.innerText ?? null, alternatives:document.querySelector('[data-testid="mobile-emergency-route-overview-choices"]')?.innerText ?? null, body:document.body.innerText.slice(-900) };
})()`);
await screenshot("sos-compact-390x844.png");

await clickButton("item.getAttribute('aria-label') === 'Expand route panel'");
await waitFor("document.querySelector('[data-testid=\"route-planner-dialog\"]')?.dataset.mobileSheetState === 'expanded'", "expanded SOS preview");
const expanded = await evaluate(`(() => {
  const panel=document.querySelector('[data-testid="route-planner-dialog"]');
  const footer=panel?.querySelector('[data-testid="route-planner-footer"]');
  const steps=panel?.querySelector('[data-testid="route-planner-scroll-region"]');
  const start=panel?.querySelector('button[aria-label="Start Navigation"]') ?? [...(panel?.querySelectorAll('button') ?? [])].find((button)=>button.innerText.trim()==='Start Navigation');
  const rect=(node)=>{const r=node?.getBoundingClientRect();return r&&{top:r.top,bottom:r.bottom,height:r.height};};
  return {state:panel?.dataset.mobileSheetState, panel:rect(panel),footer:rect(footer),steps:rect(steps),start:rect(start),buttons:panel?.innerText.slice(-700)};
})()`);
await screenshot("sos-expanded-390x844.png");

// Pointer drag from the dedicated handle must settle in one of exactly two states.
const handleCenter = () => evaluate(`(() => {const r=document.querySelector('[data-testid="route-planner-resize-handle"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
const handle = await handleCenter();
await mouse("mousePressed", handle.x, handle.y, "left", 1, 1);
await mouse("mouseMoved", handle.x, handle.y - 120, "left", 1);
await mouse("mouseReleased", handle.x, handle.y - 120, "left", 0, 1);
await waitFor("document.querySelector('[data-testid=\"route-planner-dialog\"]')?.dataset.mobileSheetState === 'expanded'", "drag-up expanded snap");
const afterUpDrag = await evaluate("document.querySelector('[data-testid=\"route-planner-dialog\"]')?.dataset.mobileSheetState");
const downHandle = await handleCenter();
await mouse("mousePressed", downHandle.x, downHandle.y, "left", 1, 1);
await mouse("mouseMoved", downHandle.x, downHandle.y + 120, "left", 1);
await mouse("mouseReleased", downHandle.x, downHandle.y + 120, "left", 0, 1);
await waitFor("document.querySelector('[data-testid=\"route-planner-dialog\"]')?.dataset.mobileSheetState === 'compact'", "drag-down compact snap");
const afterDownDrag = await evaluate("document.querySelector('[data-testid=\"route-planner-dialog\"]')?.dataset.mobileSheetState");

// Measure the actual compact panel and Start control at the shortest supported viewport.
await cdp("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
await new Promise((resolve) => setTimeout(resolve, 450));
const shortViewport = await evaluate(`(() => {
  const panel=document.querySelector('[data-testid="route-planner-dialog"]');
  const start=document.querySelector('[data-testid="mobile-route-preview-start-navigation"]');
  const rect=(node)=>{const r=node?.getBoundingClientRect();return r&&{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
  return {viewport:[innerWidth,innerHeight],state:panel?.dataset.mobileSheetState,panel:rect(panel),start:rect(start),safeBottom:parseFloat(getComputedStyle(document.querySelector('nav[aria-label="Mobile navigation"]') ?? document.body).height)||0,body:document.body.innerText.slice(-520)};
})()`);
await screenshot("sos-compact-320x568.png");

// Return to 390 px and engage 3D before starting so both the map and route are present.
await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await clickButton("item.getAttribute('aria-label') === 'Switch to 3D view'");
await waitFor("document.querySelector('[data-testid=\"student-campus-3d-canvas\"]') || document.querySelector('[data-testid=\"student-indoor-3d-renderer\"] canvas')", "indoor 3D renderer", 20000);
await clickButton("['Start Navigation','Start'].includes(item.innerText.trim()) || item.getAttribute('aria-label') === 'Start Navigation'");
await waitFor("document.querySelector('[data-testid=\"collapsed-route-card\"]')", "active guided route", 10000);
await new Promise((resolve) => setTimeout(resolve, 350));
await screenshot("sos-follow-playing-390x844.png");

const playing = await evaluate(`(() => ({
  dock:document.querySelector('[data-testid="collapsed-route-card"]')?.innerText,
  followSelected:[...document.querySelectorAll('button')].some((button)=>button.getAttribute('aria-label')==='Follow mode' && button.getAttribute('aria-pressed')==='true'),
  exploreSelected:[...document.querySelectorAll('button')].some((button)=>button.getAttribute('aria-label')==='Explore route' && button.getAttribute('aria-pressed')==='true'),
  routeText:document.querySelector('[data-testid="collapsed-route-card"]')?.innerText,
  canvas:[...document.querySelectorAll('canvas')].map((canvas)=>({rect:(()=>{const r=canvas.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})(),keys:Object.keys(canvas).filter((key)=>key.startsWith('__r3f'))})),
  surface:document.querySelector('[data-testid="student-campus-3d-surface"]')?.getBoundingClientRect().toJSON() ?? document.querySelector('[data-testid="student-indoor-3d-renderer"]')?.getBoundingClientRect().toJSON()
}))()`);

const canvasRect = playing.canvas.at(-1)?.rect ?? playing.surface;
if (!canvasRect || canvasRect.width < 10 || canvasRect.height < 10) throw new Error("The active 3D map has no usable canvas bounds");
const x = Math.round(canvasRect.x + Math.min(canvasRect.width - 24, 54));
const y = Math.round(canvasRect.y + Math.min(canvasRect.height - 24, 124));
await mouse("mousePressed", x, y, "left", 1, 1);
await mouse("mouseMoved", x + 80, y + 42, "left", 1);
await mouse("mouseReleased", x + 80, y + 42, "left", 0, 1);
await waitFor("document.body.innerText.includes('Paused for map inspection')", "Follow paused after pan", 8000);
const pausedAfterPan = await evaluate(`(() => ({
  paused:document.body.innerText.includes('Paused for map inspection'),
  followSelected:[...document.querySelectorAll('button')].some((button)=>button.getAttribute('aria-label')==='Follow mode' && button.getAttribute('aria-pressed')==='true'),
  action:[...document.querySelectorAll('button')].find((button)=>/Resume/.test(button.innerText))?.innerText.trim(),
  route:document.querySelector('[data-testid="route-planner-dialog"]')?.innerText.slice(-600),
  surface:document.querySelector('[data-testid="student-campus-3d-surface"]')?.dataset.dragging ?? document.querySelector('[data-testid="student-indoor-3d-renderer"]')?.dataset.dragging
}))()`);
await screenshot("sos-follow-paused-after-pan-390x844.png");

// A right drag while paused should still be accepted by OrbitControls and must not change the selected mode.
await mouse("mousePressed", x, y, "right", 2, 1);
await mouse("mouseMoved", x + 56, y + 30, "right", 2);
await mouse("mouseReleased", x + 56, y + 30, "right", 0, 1);
const contextMenuResult = await evaluate(`(() => {
  const surface=document.querySelector('[data-testid="student-campus-3d-surface"]') ?? document.querySelector('[data-testid="student-indoor-3d-renderer"]');
  if(!surface) return null;
  const event=new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true});
  surface.dispatchEvent(event);
  return {defaultPrevented:event.defaultPrevented,rightButtonDragging:surface.dataset.rightButtonDragging ?? null};
})()`);
const afterRotate = await evaluate(`(() => ({
  paused:document.body.innerText.includes('Paused for map inspection'),
  followSelected:[...document.querySelectorAll('button')].some((button)=>button.getAttribute('aria-label')==='Follow mode' && button.getAttribute('aria-pressed')==='true'),
  contextMenuPrevented:document.querySelector('[data-testid="student-campus-3d-surface"]')?.dataset.rightButtonDragging === undefined || document.querySelector('[data-testid="student-campus-3d-surface"]')?.dataset.rightButtonDragging === 'true'
}))()`);
await screenshot("sos-follow-paused-after-rotate-390x844.png");

await clickButton("item.getAttribute('aria-label') === 'Resume navigation' || item.innerText.trim() === 'Resume'");
await new Promise((resolve) => setTimeout(resolve, 1800));
const resumed = await evaluate(`(() => ({
  routeText:document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.slice(-800),
  inspectionPaused:document.body.innerText.includes('Paused for map inspection'),
  returning:document.body.innerText.includes('Returning…') || document.body.innerText.includes('Returning to route'),
  followSelected:[...document.querySelectorAll('button')].some((button)=>button.getAttribute('aria-label')==='Follow mode' && button.getAttribute('aria-pressed')==='true'),
  pausedAction:[...document.querySelectorAll('button')].find((button)=>/Pause|Resume/.test(button.innerText))?.innerText.trim(),
  continueAction:[...document.querySelectorAll('button')].find((button)=>/Continue Outside|Continue to Floor|Continue to/.test(button.innerText))?.innerText.trim(),
  error:document.querySelector('[role="alert"]')?.innerText ?? null
}))()`);
await screenshot("sos-follow-after-resume-390x844.png");

const report = {
  route: "SOS · COED 306 → Emergency Assembly Point · MAIN CAMPUS",
  preview: compact,
  expanded,
  dragSnaps: { afterUpDrag, afterDownDrag },
  viewport320: shortViewport,
  playing,
  pan: pausedAfterPan,
  contextMenu: contextMenuResult,
  rotateWhilePaused: afterRotate,
  resume: resumed,
};
await writeFile(path.join(outDir, "follow-camera-cdp-qa-results.json"), JSON.stringify(report, null, 2));
socket.close();
console.log(JSON.stringify(report, null, 2));
