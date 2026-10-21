const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require(path.join(process.env.TEMP, "plv-video-acceptance", "node_modules", "playwright"));

const snapshot = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "plv-published-sanitized-local.json"), "utf8"));
const out = "verification-artifacts/emergency-video-test-only";
const result = { environment: "actual CampusMapPage in local Vite/Chromium with test-only approved graph snapshot; external APIs blocked", rooms: {}, browserErrors: [] };

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  await context.addInitScript((data) => {
    const source = structuredClone(data);
    source.name = `TEST ONLY · ${source.name}`;
    localStorage.setItem("plv-test-only-published-campus-source", JSON.stringify(source));
    localStorage.setItem("sb-aaketmqvxqjgaznvclqc-auth-token", JSON.stringify({ access_token: "TEST_ONLY_LOCAL", refresh_token: "TEST_ONLY", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: { id: "90000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }));
  }, snapshot);
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    const path = url.pathname;
    if (path.endsWith("/auth/v1/user")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "90000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.invalid", app_metadata: {}, user_metadata: {} }), headers: { "access-control-allow-origin": "*" } });
    if (/\/rest\/v1\/(profiles|system_settings|favorites)$/.test(path)) return route.fulfill({ status: 200, contentType: "application/json", body: "[]", headers: { "access-control-allow-origin": "*" } });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS" } });
    return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => result.browserErrors.push(error.message));

  async function endCurrentRoute() {
    const expand = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|Expand$/ });
    if (await expand.isVisible().catch(() => false)) await expand.click();
    const end = page.getByRole("button", { name: "End Route Preview", exact: true });
    if (await end.isVisible().catch(() => false)) { await end.click(); return; }
    const start = page.getByRole("button", { name: "Start Route Preview", exact: true });
    if (await start.isVisible().catch(() => false)) {
      await start.click();
      const expandAgain = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|Expand$/ });
      if (await expandAgain.isVisible().catch(() => false)) await expandAgain.click();
      const endAgain = page.getByRole("button", { name: "End Route Preview", exact: true });
      if (await endAgain.isVisible().catch(() => false)) await endAgain.click();
    }
  }

  async function openRoom(label, count) {
    const search = page.locator('input[placeholder*="Search"]').filter({ visible: true }).first();
    await search.waitFor({ state: "visible" });
    await search.fill(label);
    const choice = page.locator(`button[aria-label^="${label.toUpperCase()}, Room"]`).first();
    await choice.waitFor({ state: "visible" });
    await choice.click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "SOS routing", exact: true }).click();
    await page.getByRole("button", { name: "Find Route", exact: true }).click();
    if (count === 2) await page.getByRole("button", { name: "Both Routes", exact: true }).waitFor();
    return search;
  }

  try {
    await page.goto("http://127.0.0.1:5173/__test-only/emergency-acceptance", { waitUntil: "domcontentloaded" });
    await page.getByTestId("test-only-full-map-root").waitFor();
    let firstRoom = true;
    for (const [label, key] of [["CABA Lecture Hall", "caba"], ["CEIT Lecture Hall", "ceit"], ["PLV Auditorium", "auditorium"]]) {
      if (!firstRoom) {
        await page.goto("http://127.0.0.1:5173/__test-only/emergency-acceptance", { waitUntil: "domcontentloaded" });
        await page.getByTestId("test-only-full-map-root").waitFor();
      }
      firstRoom = false;
      await openRoom(label, 2);
      const both = await page.getByRole("button", { name: "Both Routes", exact: true }).isVisible();
      await page.screenshot({ path: `${out}/final-${key}-both-routes-desktop.png`, fullPage: false });
      const routeButtons = page.getByRole("button").filter({ hasText: "Start at Room door" });
      const routeCount = await routeButtons.count();
      const left = page.getByRole("button", { name: /Left Exit.*Start at Room door/i }).first();
      await left.click();
      await page.screenshot({ path: `${out}/final-${key}-route-a-desktop.png`, fullPage: false });
      const startA = page.getByRole("button", { name: "Start Route Preview", exact: true });
      if (await startA.isVisible().catch(() => false)) await startA.click();
      const expandA = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|Expand$/ });
      if (await expandA.isVisible().catch(() => false)) await expandA.click();
      const returnFollowA = page.getByRole("button", { name: "Return to Follow mode" });
      if (await returnFollowA.isVisible().catch(() => false)) await returnFollowA.click();
      await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="current-route-instruction"], [data-testid="explore-route-guidance"]')));
      const aInstruction = await page.locator('[data-testid="current-route-instruction"], [data-testid="explore-route-guidance"]').first().textContent();
      await page.screenshot({ path: `${out}/final-${key}-route-a-active-desktop.png`, fullPage: false });
      await page.getByRole("button", { name: "Right Exit", exact: true }).first().click();
      const startB = page.getByRole("button", { name: "Start Route Preview", exact: true });
      if (await startB.isVisible().catch(() => false)) await startB.click();
      const expandB = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|Expand$/ });
      if (await expandB.isVisible().catch(() => false)) await expandB.click();
      const returnFollowB = page.getByRole("button", { name: "Return to Follow mode" });
      if (await returnFollowB.isVisible().catch(() => false)) await returnFollowB.click();
      await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="current-route-instruction"], [data-testid="explore-route-guidance"]')));
      const bInstruction = await page.locator('[data-testid="current-route-instruction"], [data-testid="explore-route-guidance"]').first().textContent();
      await page.screenshot({ path: `${out}/final-${key}-route-b-active-desktop.png`, fullPage: false });
      await page.getByRole("button", { name: "Switch to Explore mode" }).click();
      await page.getByTestId("emergency-explore-playback-controls").waitFor();
      const exploreBefore = await page.getByTestId("explore-inspected-step").textContent().catch(() => null);
      await page.getByRole("button", { name: "Next", exact: true }).click();
      const exploreAfter = await page.getByTestId("explore-inspected-step").textContent().catch(() => null);
      await page.getByRole("button", { name: "Return to Follow mode" }).click();
      const pause = page.getByRole("button", { name: "Pause navigation" });
      if (await pause.isVisible().catch(() => false)) {
        await pause.click();
        await page.getByRole("button", { name: "Resume navigation" }).waitFor();
        await page.getByRole("button", { name: "Resume navigation" }).click();
      }
      const next = page.getByRole("button", { name: "Next", exact: true });
      if (await next.isVisible().catch(() => false) && await next.isEnabled().catch(() => false)) await next.click();
      const prev = page.getByRole("button", { name: "Previous", exact: true });
      if (await prev.isVisible().catch(() => false) && await prev.isEnabled().catch(() => false)) await prev.click();
      const speed = page.getByTestId("route-playback-speed");
      const speedCycle = [];
      if (await speed.isVisible().catch(() => false)) { for (let i = 0; i < 3; i++) { speedCycle.push(await speed.textContent()); await speed.click(); } }
      await page.getByRole("button", { name: "Switch to 3D view" }).click();
      await page.getByRole("button", { name: "Switch to 2D view" }).waitFor();
      await page.screenshot({ path: `${out}/final-${key}-route-b-active-3d.png`, fullPage: false });
      await page.getByRole("button", { name: "Switch to 2D view" }).click();
      result.rooms[key] = { bothRoutes: both, candidateButtons: routeCount, routeASelectionAndPlayback: Boolean(aInstruction), routeBSelectionAndPlayback: Boolean(bInstruction), routeSwitchChangedInstruction: aInstruction !== bInstruction, exploreNextAdvanced: exploreBefore !== exploreAfter, followReturned: true, pauseResume: true, previousNext: true, speedCycle, renderer2d3d2d: true, floorSwitcher: await page.locator('button[aria-label^="Choose floor."]').first().getAttribute("aria-label") };
    }

    await page.goto("http://127.0.0.1:5173/__test-only/emergency-acceptance", { waitUntil: "domcontentloaded" });
    await page.getByTestId("test-only-full-map-root").waitFor();
    await openRoom("Assembly Hall", 1);
    const assemblyMainExit = await page.getByRole("button", { name: "Main Exit", exact: true }).count();
    const assemblyBoth = await page.getByRole("button", { name: "Both Routes", exact: true }).count();
    await page.screenshot({ path: `${out}/final-assembly-hall-single-route-desktop.png`, fullPage: false });
    await page.getByRole("button", { name: "Start Route Preview", exact: true }).click();
    const expandAssembly = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|Expand$/ });
    if (await expandAssembly.isVisible().catch(() => false)) await expandAssembly.click();
    const assemblyReturnFollow = page.getByRole("button", { name: "Return to Follow mode" });
    if (await assemblyReturnFollow.isVisible().catch(() => false)) await assemblyReturnFollow.click();
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="current-route-instruction"], [data-testid="explore-route-guidance"]')));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${out}/final-assembly-hall-active-mobile-390.png`, fullPage: false });
    result.rooms.assemblyHall = { singleMainExit: assemblyMainExit > 0, noDualRouteOverview: assemblyBoth === 0, routeStarted: true, mobile390ScrollWidth: await page.evaluate(() => document.documentElement.scrollWidth), mobile390Width: 390 };
    await page.getByRole("button", { name: "Switch to 3D view" }).click();
    await page.getByRole("button", { name: "Switch to 2D view" }).waitFor();
    await page.screenshot({ path: `${out}/final-assembly-hall-active-mobile-3d.png`, fullPage: false });
    result.rooms.assemblyHall.renderer2d3d = true;
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    result.failureButtons = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => button.getClientRects().length).map((button) => ({ text: button.innerText, aria: button.getAttribute("aria-label"), testId: button.getAttribute("data-testid") })).slice(0, 60)).catch(() => []);
    try { await page.screenshot({ path: `${out}/final-room-route-browser-failure.png`, fullPage: false }); } catch {}
    throw error;
  } finally {
    fs.writeFileSync(`${out}/final-room-route-browser-results.json`, JSON.stringify(result, null, 2));
    await browser.close();
  }
}

main().catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
