const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));
const out = __dirname;
const result = { errors: [], observations: [] };

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") result.errors.push(`console: ${message.text()}`); });
  page.on("requestfailed", (request) => result.errors.push(`request failed ${request.url()}: ${request.failure()?.errorText}`));
  await page.route("**/*", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.hostname.endsWith("supabase.co") && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
      const readRpc = request.method() === "POST" && /\/rpc\/(list_event_safe_published_campuses|list_published_campus_version_status|list_coming_soon_campuses)$/.test(url.pathname);
      if (!readRpc) return route.fulfill({ status: 403, body: "Blocked by read-only navigation test" });
    }
    return route.continue();
  });

  const markerState = () => page.evaluate(() => {
    const marker = document.querySelector("[data-route-current-position]");
    const lines = [...document.querySelectorAll('[data-testid="floor-indoor-route-line"] [data-testid="remaining-route-line"]')];
    const activeScene = [...document.querySelectorAll('[data-testid="student-floor-scene"]')]
      .find((scene) => Number(getComputedStyle(scene).opacity) > 0);
    return {
      transform: marker?.getAttribute("transform") ?? null,
      progress: marker?.getAttribute("data-progress") ?? null,
      markerCount: document.querySelectorAll("[data-route-current-position]").length,
      routePoints: lines.map((line) => line.getAttribute("points")),
      floor: activeScene?.getAttribute("data-floor-number") ?? null,
    };
  });
  const sample = async (label, times = [0, 50, 100, 150, 250, 350, 500]) => {
    const samples = [];
    for (const tMs of times) {
      if (tMs) await page.waitForTimeout(tMs - samples.at(-1).tMs);
      samples.push({ tMs, ...(await markerState()) });
      if (tMs === 150) await page.screenshot({ path: path.join(out, `${label}-midpoint.png`) });
    }
    result.observations.push({ label, samples });
    return samples;
  };

  try {
    await page.goto("http://[::1]:5173/map", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await page.getByRole("button", { name: "Open directions" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    for (const [endpoint, query] of [["start", "CABA-405"], ["destination", "CABA-403"]]) {
      await dialog.getByTestId(`route-endpoint-card-${endpoint}`).getByRole("button", { name: endpoint === "start" ? "Choose start" : "Choose destination" }).click();
      const search = dialog.getByRole("searchbox", { name: endpoint === "start" ? "Search start" : "Search destination" });
      await search.fill(query); await page.waitForTimeout(650);
      const options = await page.locator('[role="option"]').allInnerTexts();
      result[`${endpoint}Options`] = options;
      const matching = page.locator('[role="option"]').filter({ hasText: query }).first();
      if (await matching.count()) await matching.click(); else if (options.length) await page.locator('[role="option"]').first().click();
    }
    await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByTestId("route-summary").waitFor();
    result.preview = await dialog.innerText();
    await page.screenshot({ path: path.join(out, "indoor-seek-final-preview.png") });
    await dialog.getByRole("button", { name: "Start Navigation", exact: true }).click();
    const expand = page.locator('button[aria-label="Expand navigation panel"], button[aria-label="Expand route panel"]');
    if (await expand.count()) await expand.first().click();
    await page.getByTestId("guided-navigation-summary").waitFor();
    await page.waitForTimeout(180);
    const pause = page.getByRole("button", { name: "Pause navigation" });
    if (await pause.count()) await pause.click();
    await page.waitForTimeout(150);
    result.initial = { state: await markerState(), panel: await page.getByTestId("guided-navigation-summary").innerText() };
    await page.screenshot({ path: path.join(out, "indoor-seek-final-start.png") });

    const next = page.getByRole("button", { name: "Next", exact: true }).first();
    const previous = page.getByRole("button", { name: "Previous", exact: true }).first();
    await next.click();
    await page.waitForTimeout(90);
    result.previousEnabledDuringSeek = await previous.isEnabled();
    result.retargetStart = await markerState();
    if (result.previousEnabledDuringSeek) await previous.click();
    result.rapidNextPrevious = await sample("indoor-seek-next-previous");

    await page.getByRole("button", { name: "Previous step from arrival" }).click();
    await page.waitForTimeout(800);
    const expandAfterArrivalPrevious = page.locator('button[aria-label="Expand navigation panel"], button[aria-label="Expand route panel"]');
    if (await expandAfterArrivalPrevious.count()) await expandAfterArrivalPrevious.first().click();
    const stepAfterArrivalReverse = await page.getByTestId("guided-navigation-summary").innerText();
    result.arrivalPrevious = stepAfterArrivalReverse;

    await next.click();
    await page.waitForTimeout(90);
    const beforePause = await markerState();
    await page.getByRole("button", { name: "Pause navigation" }).click();
    const pausedPosition = await markerState();
    await page.waitForTimeout(1050);
    const afterPauseWait = await markerState();
    result.pauseDuringSeek = { beforePause, pausedPosition, afterPauseWait, stable: pausedPosition.transform === afterPauseWait.transform && pausedPosition.progress === afterPauseWait.progress };
    result.rendererSwitchStart = pausedPosition;
    await page.getByRole("button", { name: "Switch to 3D view" }).click();
    await page.waitForTimeout(350);
    result.renderer3D = { state: await markerState(), rendererCount: await page.locator('[data-testid="student-indoor-3d-renderer"]').count() };
    await page.screenshot({ path: path.join(out, "indoor-seek-final-3d.png") });
    await page.getByRole("button", { name: "Switch to 2D view" }).click();
    await page.waitForTimeout(350);
    result.renderer2DReturn = await markerState();
    await page.screenshot({ path: path.join(out, "indoor-seek-final-2d-return.png") });

    await page.getByRole("button", { name: "Resume navigation" }).click();
    await page.waitForTimeout(220);
    result.resumeAfterSeekPause = await markerState();
  } catch (error) {
    result.errors.push(error.stack ?? String(error));
    try { await page.screenshot({ path: path.join(out, "indoor-seek-final-failure.png") }); } catch {}
  } finally {
    await context.close(); await browser.close();
    fs.writeFileSync(path.join(out, "indoor-seek-final-results.json"), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
}
main();
