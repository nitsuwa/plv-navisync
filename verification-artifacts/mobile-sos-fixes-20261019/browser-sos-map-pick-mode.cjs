const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe", args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const result = { viewport: "390x844", errors: [] };
  page.on("pageerror", error => result.errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") result.errors.push(message.text().slice(0, 250)); });
  try {
    await page.goto("http://127.0.0.1:5174/map", { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await page.getByRole("button", { name: "Open directions" }).click();
    const dialog = page.getByTestId("route-planner-dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "SOS routing" }).click();
    result.modeBeforeMapPick = await dialog.getAttribute("data-route-mode");
    await dialog.getByTestId("route-endpoint-card-start").getByRole("button", { name: "Choose start" }).click();
    await dialog.getByRole("button", { name: "Choose on map" }).click();
    result.modeDuringMapPick = await dialog.getAttribute("data-route-mode");
    const options = await page.locator('[data-testid="readonly-building"]').evaluateAll(nodes => nodes.map(node => ({ label: node.textContent?.trim(), id: node.getAttribute("data-building-id"), title: node.querySelector("title")?.textContent?.trim() })));
    result.mapBuildingOptions = options;
    const target = page.locator('[data-testid="readonly-building"]').filter({ hasText: /STUDENT CENTER BUILDING/i }).first();
    if (await target.count()) result.selectedMapTarget = "STUDENT CENTER BUILDING";
    else { result.selectedMapTarget = "first authored building"; await page.locator('[data-testid="readonly-building"]').first().click(); }
    if (result.selectedMapTarget === "STUDENT CENTER BUILDING") await target.click();
    await dialog.getByRole("button", { name: "Use as starting point" }).waitFor();
    await dialog.getByRole("button", { name: "Use as starting point" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="route-planner-dialog"]')?.getAttribute("data-map-picking") !== "true");
    result.modeAfterMapPick = await dialog.getAttribute("data-route-mode");
    result.plannerCountAfterMapPick = await page.locator('[data-testid="route-planner-dialog"]').count();
    const findRoute = dialog.getByRole("button", { name: "Find Route", exact: true });
    result.findRouteEnabled = await findRoute.isEnabled();
    result.sosStatus = await dialog.locator('[data-testid="emergency-route-status"]').innerText().catch(() => null);
    if (result.findRouteEnabled) {
      await findRoute.click();
      await page.waitForTimeout(600);
      result.modeAfterFindRoute = await page.locator('[data-testid="route-planner-dialog"]').getAttribute("data-route-mode").catch(() => null);
      result.routeReady = (await page.locator("body").innerText()).includes("Route ready from");
      result.routePhase = await page.getByTestId("student-map-surface").getAttribute("data-route-phase");
      result.plannerCountAfterFindRoute = await page.locator('[data-testid="route-planner-dialog"]').count();
      const readArrows = () => page.locator('[data-testid="route-direction-chevron"]').evaluateAll(nodes => nodes.map(node => node.getAttribute("transform")));
      result.previewArrowsBefore = await readArrows();
      await page.waitForTimeout(450);
      result.previewArrowsAfter = await readArrows();
      result.previewArrowsMove = result.previewArrowsBefore.length > 0 && JSON.stringify(result.previewArrowsBefore) !== JSON.stringify(result.previewArrowsAfter);
      const expand = page.getByRole("button", { name: /Expand route panel|^Expand$/ }).first();
      if (await expand.isVisible().catch(() => false)) await expand.click();
      await page.evaluate(() => {
        const state = { samples: 0, changedFrames: 0, moved: false, paused: false, last: null, transform: null };
        window.__sosArrowMotion = state;
        window.__sosArrowMotionTimer = window.setInterval(() => {
          if (document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") !== "navigating") return;
          const transforms = [...document.querySelectorAll('[data-testid="route-direction-chevron"]')].map(node => node.getAttribute("transform"));
          if (!transforms.length) return;
          const signature = JSON.stringify(transforms);
          state.samples += 1;
          if (state.last !== null && signature !== state.last) state.changedFrames += 1;
          state.last = signature;
          if (state.changedFrames > 0) state.moved = true;
          if (state.moved && !state.paused) {
            const pause = [...document.querySelectorAll('button[aria-label="Pause navigation"]')].find(button => button.getClientRects().length && !button.disabled);
            if (pause) { state.paused = true; state.transform = signature; pause.click(); }
          }
        }, 20);
      });
      const startRoute = dialog.getByRole("button", { name: "Start", exact: true }).last();
      result.startRouteEnabled = await startRoute.isEnabled().catch(() => false);
      if (result.startRouteEnabled) {
        await startRoute.click();
        await page.waitForFunction(() => ["navigating", "arrived"].includes(document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") ?? ""), null, { timeout: 10000 });
        await page.waitForFunction(() => window.__sosArrowMotion?.moved || document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") === "arrived", null, { timeout: 8000 }).catch(() => undefined);
        result.guidedArrows = await page.evaluate(() => window.__sosArrowMotion);
        result.guidedPhase = await page.getByTestId("student-map-surface").getAttribute("data-route-phase");
        await page.screenshot({ path: "verification-artifacts/mobile-sos-fixes-20261019/sos-map-pick-guided-2d-390.png" });
        const view3d = page.getByRole("button", { name: "Switch to 3D view" });
        if (await view3d.isVisible().catch(() => false)) {
          await view3d.click();
          await page.getByRole("button", { name: "Switch to 2D view" }).waitFor({ state: "visible", timeout: 10000 });
          await page.waitForTimeout(800);
          result.modeAfter3dSwitch = await page.locator('[data-testid="route-planner-dialog"]').getAttribute("data-route-mode").catch(() => null);
          result.phaseAfter3dSwitch = await page.getByTestId("student-map-surface").getAttribute("data-route-phase");
          result.threeDCanvasVisible = await page.locator("canvas").evaluateAll(nodes => nodes.some(node => { const r=node.getBoundingClientRect(); return r.width>100&&r.height>100; }));
          await page.screenshot({ path: "verification-artifacts/mobile-sos-fixes-20261019/sos-map-pick-guided-3d-390.png" });
        }
      }
    }
    await page.screenshot({ path: "verification-artifacts/mobile-sos-fixes-20261019/sos-map-pick-mode-390.png" });
  } catch (error) { result.failure = { message: error.message, stack: error.stack }; }
  finally {
    fs.writeFileSync("verification-artifacts/mobile-sos-fixes-20261019/sos-map-pick-mode-results.json", JSON.stringify(result, null, 2));
    await browser.close();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }
})().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });