const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const base = "http://127.0.0.1:5174";
const out = __dirname;
const result = { errors: [], routeSearches: [], indoorSeekSamples: [], exploreChecks: [] };

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") result.errors.push(`console: ${message.text()}`); });
  page.on("requestfailed", (request) => result.errors.push(`request failed ${request.url()}: ${request.failure()?.errorText}`));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname.endsWith("supabase.co") && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
      const readRpc = request.method() === "POST" && /\/rpc\/(list_event_safe_published_campuses|list_published_campus_version_status|list_coming_soon_campuses)$/.test(url.pathname);
      if (!readRpc) return route.fulfill({ status: 403, body: "Blocked by read-only navigation test" });
    }
    return route.continue();
  });

  const snapshotFloor = async () => page.evaluate(() => {
    const scenes = [...document.querySelectorAll('[data-testid="student-floor-scene"]')].map((scene) => ({
      floorId: scene.getAttribute("data-floor-id") ?? null,
      floorNumber: scene.getAttribute("data-floor-number") ?? null,
      opacity: getComputedStyle(scene).opacity,
      rect: (() => { const rect = scene.getBoundingClientRect(); return [rect.x, rect.y, rect.width, rect.height]; })(),
    }));
    const scene = scenes.find((candidate) => Number(candidate.opacity) > 0 && candidate.rect[2] > 0) ?? scenes[0];
    const routeLines = [...document.querySelectorAll('[data-testid="floor-indoor-route-line"] [data-testid="remaining-route-line"]')];
    const markers = [...document.querySelectorAll('[data-route-current-position]')];
    const canvases = [...document.querySelectorAll('canvas')].map((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return { width: canvas.width, height: canvas.height, rect: [rect.x, rect.y, rect.width, rect.height], className: canvas.className };
    });
    return {
      scenes,
      floorId: scene?.floorId ?? null,
      floorNumber: scene?.floorNumber ?? null,
      sceneOpacity: scene?.opacity ?? null,
      routePoints: routeLines.map((line) => line.getAttribute("points")),
      markerTransforms: markers.map((marker) => marker.getAttribute("transform")),
      markerCount: markers.length,
      indoor3DRendererCount: document.querySelectorAll('[data-testid="student-indoor-3d-renderer"]').length,
      canvases,
      step: document.querySelector('[data-testid="explore-inspected-step"], [data-testid="guided-active-step"]')?.textContent?.trim() ?? null,
    };
  });
  const sampleIndoorMarker = async (label) => {
    const samples = [];
    for (let i = 0; i < 12; i += 1) {
      samples.push({ tMs: i * 50, ...(await snapshotFloor()) });
      if (i === 6) await page.screenshot({ path: path.join(out, `focused-${label}-midpoint.png`) });
      await page.waitForTimeout(50);
    }
    result.indoorSeekSamples.push({ label, samples });
    return samples;
  };
  const routeGeometry = async () => page.evaluate(() => [...document.querySelectorAll('[data-testid="remaining-route-line"]')].map((line) => line.getAttribute("points")));
  const enterFloorFour = async () => {
    const enter = page.locator('[data-testid="student-active-transition-marker"][data-student-transition-kind="enter_building"]');
    if (await enter.count()) await enter.first().click({ force: true });
    await page.waitForTimeout(350);
    let floorNumber = await page.locator('[data-testid="student-floor-scene"]').getAttribute("data-floor-number").catch(() => null);
    for (let transition = 0; floorNumber && Number(floorNumber) !== 4 && transition < 5; transition += 1) {
      const vertical = page.locator('[data-testid="student-active-transition-marker"][data-student-transition-kind="elevator"], [data-testid="student-active-transition-marker"][data-student-transition-kind="stairs"]');
      if (!(await vertical.count())) break;
      await vertical.first().click({ force: true });
      const priorFloor = floorNumber;
      await page.waitForFunction((previous) => document.querySelector('[data-testid="student-floor-scene"]')?.getAttribute("data-floor-number") !== previous,
        priorFloor, { timeout: 3000 }).catch(() => undefined);
      floorNumber = await page.locator('[data-testid="student-floor-scene"]').getAttribute("data-floor-number").catch(() => null);
    }
    await page.waitForTimeout(850);
    return snapshotFloor();
  };
  const findRoute = async (start, destination) => {
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    if (!(await dialog.count())) await page.getByRole("button", { name: "Open directions" }).click();
    const activeDialog = page.getByRole("dialog", { name: "Route planner" });
    for (const [endpoint, query] of [["start", start], ["destination", destination]]) {
      await activeDialog.getByTestId(`route-endpoint-card-${endpoint}`).getByRole("button", { name: endpoint === "start" ? "Choose start" : "Choose destination" }).click();
      const search = activeDialog.getByRole("searchbox", { name: endpoint === "start" ? "Search start" : "Search destination" });
      await search.fill(query);
      await page.waitForTimeout(800);
      const options = await page.locator('[role="option"]').allInnerTexts();
      result.routeSearches.push({ endpoint, query, options });
      if (options.length) await page.locator('[role="option"]').first().click();
    }
    await activeDialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByTestId("route-summary").waitFor();
    await page.waitForTimeout(650);
    return activeDialog;
  };

  try {
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    const dialog = await findRoute("CANTEEN", "CABA-403");
    result.canteenCaba = { preview: await dialog.innerText(), alternatives: await page.locator('[data-testid="automatic-route-selector"]').count() };
    result.routeA = { geometry: await routeGeometry(), preview: await dialog.innerText() };
    await page.screenshot({ path: path.join(out, "focused-route-a-preview.png") });
    result.routeAIndoor = await enterFloorFour();
    await page.screenshot({ path: path.join(out, "focused-route-a-floor4.png") });
    await page.getByRole("button", { name: "Switch to 3D view" }).click();
    await page.waitForTimeout(2200);
    result.routeAIndoor3DPreview = await snapshotFloor();
    await page.screenshot({ path: path.join(out, "focused-route-a-floor4-3d.png") });
    await page.getByRole("button", { name: "Switch to 2D view" }).click();
    await page.waitForTimeout(400);

    if (result.canteenCaba.alternatives > 0) {
      await page.getByTestId("automatic-route-choice-route-b").click();
      await page.waitForTimeout(500);
      result.routeB = { selected: await page.getByTestId("automatic-route-choice-route-b").getAttribute("aria-pressed"), geometry: await routeGeometry(), preview: await dialog.innerText() };
      result.routeBIndoor = await enterFloorFour();
      result.routeGeometryChangedOutdoors = JSON.stringify(result.routeA.geometry) !== JSON.stringify(result.routeB.geometry);
      result.routeGeometryChangedIndoors = JSON.stringify(result.routeAIndoor.routePoints) !== JSON.stringify(result.routeBIndoor.routePoints);
      await page.screenshot({ path: path.join(out, "focused-route-b-floor4.png") });

      await page.getByTestId("automatic-route-choice-route-a").click();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: "Start Navigation", exact: true }).click();
      const expandRoutePanel = page.getByRole("button", { name: "Expand route panel" });
      if (await expandRoutePanel.count()) await expandRoutePanel.click();
      await page.getByTestId("guided-navigation-summary").waitFor();
      result.routeASteps = await page.locator('[data-testid="guided-route-steps"] button').allInnerTexts().catch(() => []);
      await page.getByRole("button", { name: "Switch to Explore mode" }).click();
      await page.getByTestId("guided-route-steps").waitFor();
      const stepSix = page.getByTestId("explore-instruction-5");
      await stepSix.click();
      await page.waitForTimeout(450);
      result.exploreChecks.push({ step: 6, ...(await snapshotFloor()) });
      await page.screenshot({ path: path.join(out, "focused-step-6-explore-2d.png") });
      await page.getByTestId("explore-instruction-6").click();
      await page.waitForTimeout(450);
      result.exploreChecks.push({ step: 7, ...(await snapshotFloor()) });
      await page.screenshot({ path: path.join(out, "focused-step-7-explore-2d.png") });

      await page.getByRole("button", { name: "Return to Follow mode" }).click();
      await page.getByTestId("route-arrival-state").waitFor({ timeout: 5000 }).catch(() => undefined);
      if (!(await page.getByRole("button", { name: "Previous step from arrival" }).count())) {
        await page.getByTestId("collapsed-arrival-previous").waitFor({ timeout: 5000 });
      }
      await page.getByRole("button", { name: "Previous step from arrival" }).click();
      result.previousFromArrival = await sampleIndoorMarker("arrival-to-previous-2d");
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(out, "focused-arrival-previous-2d.png") });
      await page.getByRole("button", { name: "Switch to 3D view" }).click();
      await page.waitForTimeout(900);
      result.stepSix3D = await snapshotFloor();
      await page.screenshot({ path: path.join(out, "focused-step-6-follow-3d.png") });
      const nextButton3D = page.getByRole("button", { name: "Next", exact: true });
      if (await nextButton3D.count()) await nextButton3D.click();
      else await page.getByRole("button", { name: "Next step" }).click();
      result.nextToArrival3D = await sampleIndoorMarker("indoor-next-3d");
      await page.waitForTimeout(700);
      result.renderer3D = await snapshotFloor();
      await page.screenshot({ path: path.join(out, "focused-arrival-3d.png") });
      const previousFromArrival3D = page.getByRole("button", { name: "Previous step from arrival" });
      if (await previousFromArrival3D.count()) await previousFromArrival3D.click();
      else {
        const previousButton3D = page.getByRole("button", { name: "Previous", exact: true });
        if (await previousButton3D.count()) await previousButton3D.click();
        else await page.getByRole("button", { name: "Previous step" }).click();
      }
      result.previousFromArrival3D = await sampleIndoorMarker("arrival-to-previous-3d");
      await page.waitForTimeout(700);
      await page.getByRole("button", { name: "Switch to 2D view" }).click();
      await page.waitForTimeout(850);
      result.renderer2DAfterSwitch = await snapshotFloor();
      await page.screenshot({ path: path.join(out, "focused-reverse-after-render-switch.png") });
    }
  } catch (error) {
    result.errors.push(error.stack ?? String(error));
    try { await page.screenshot({ path: path.join(out, "focused-browser-failure.png") }); } catch {}
  } finally {
    await context.close();
    await browser.close();
    fs.writeFileSync(path.join(out, "focused-browser-acceptance.json"), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
}

main();
