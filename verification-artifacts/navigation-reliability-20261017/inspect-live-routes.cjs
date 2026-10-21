const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const base = "http://127.0.0.1:5174";
const out = __dirname;
const result = { errors: [], routeSearches: [] };

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
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
  try {
    await page.goto(`${base}/map`, { waitUntil: "commit", timeout: 30000 });
    await page.waitForTimeout(5000);
    result.bootstrap = await page.evaluate(() => ({ readyState: document.readyState, title: document.title, root: document.querySelector("#root")?.innerHTML.slice(0, 500), scripts: [...document.scripts].map((script) => script.src) }));
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await page.getByRole("button", { name: "Open directions" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    await dialog.waitFor();
    for (const [endpoint, query] of [["start", "CANTEEN"], ["destination", "CABA-403"]]) {
      await dialog.getByTestId(`route-endpoint-card-${endpoint}`).getByRole("button", { name: endpoint === "start" ? "Choose start" : "Choose destination" }).click();
      const search = dialog.getByRole("searchbox", { name: endpoint === "start" ? "Search start" : "Search destination" });
      await search.fill(query);
      await page.waitForTimeout(800);
      const options = await page.locator('[role="option"]').allInnerTexts();
      result.routeSearches.push({ endpoint, query, options });
      if (options.length) await page.locator('[role="option"]').first().click();
    }
    await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByTestId("route-summary").waitFor();
    await page.waitForTimeout(500);
    result.preview = await dialog.innerText();
    result.alternatives = await page.locator('[data-testid="automatic-route-selector"]').count();
    const routeGeometry = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="remaining-route-line"]')].map((line) => line.getAttribute("points")));
    result.routeA = { geometry: await routeGeometry(), pathCount: await page.locator('[data-testid="remaining-route-line"]').count() };
    await page.screenshot({ path: path.join(out, "canteen-caba-route-a.png") });
    const inspectFloorFour = async (label) => {
      const enter = page.locator('[data-testid="student-active-transition-marker"][data-student-transition-kind="enter_building"]');
      if (await enter.count()) await enter.click({ force: true });
      await page.waitForTimeout(350);
      let floorNumber = await page.locator('[data-testid="student-floor-scene"]').getAttribute("data-floor-number").catch(() => null);
      for (let transition = 0; floorNumber && Number(floorNumber) !== 4 && transition < 5; transition += 1) {
        const vertical = page.locator('[data-testid="student-active-transition-marker"][data-student-transition-kind="elevator"], [data-testid="student-active-transition-marker"][data-student-transition-kind="stairs"]');
        if (!(await vertical.count())) break;
        await vertical.click({ force: true });
        const priorFloor = floorNumber;
        await page.waitForFunction((previous) => document.querySelector('[data-testid="student-floor-scene"]')?.getAttribute("data-floor-number") !== previous,
          priorFloor, { timeout: 3000 }).catch(() => undefined);
        floorNumber = await page.locator('[data-testid="student-floor-scene"]').getAttribute("data-floor-number").catch(() => null);
      }
      await page.waitForTimeout(1000);
      const geometry = await page.evaluate(() => [...document.querySelectorAll('[data-testid="floor-indoor-route-line"] [data-testid="remaining-route-line"]')].map((line) => line.getAttribute("points")));
      const scene = await page.locator('[data-testid="student-floor-scene"]').getAttribute("data-floor-id").catch(() => null);
      const renderState = await page.evaluate(() => {
        const scene = document.querySelector('[data-testid="student-floor-scene"]');
        const line = document.querySelector('[data-testid="floor-indoor-route-line"] [data-testid="remaining-route-line"]');
        const svg = document.querySelector('svg.student-map-renderer-crossfade');
        const style = (element) => element ? { rect: (() => { const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(), opacity: getComputedStyle(element).opacity, visibility: getComputedStyle(element).visibility, display: getComputedStyle(element).display } : null;
        return { scene: style(scene), line: style(line), svg: style(svg), sceneChildren: scene?.childElementCount };
      });
      await page.screenshot({ path: path.join(out, `canteen-caba-${label}-floor.png`) });
      return { floorNumber, scene, geometry, renderState };
    };
    result.routeAIndoor = await inspectFloorFour("a");
    if (result.alternatives) {
      await page.getByTestId("automatic-route-choice-route-b").click();
      await page.waitForTimeout(350);
      result.routeB = { geometry: await routeGeometry(), pathCount: await page.locator('[data-testid="remaining-route-line"]').count() };
      result.routeBSelected = await page.getByTestId("automatic-route-choice-route-b").getAttribute("aria-pressed");
      result.routeGeometryChanged = JSON.stringify(result.routeA.geometry) !== JSON.stringify(result.routeB.geometry);
      await page.screenshot({ path: path.join(out, "canteen-caba-route-b.png") });
      result.routeBIndoor = await inspectFloorFour("b");
      result.indoorRouteGeometryChanged = JSON.stringify(result.routeAIndoor.geometry) !== JSON.stringify(result.routeBIndoor.geometry);
      await page.getByTestId("automatic-route-choice-route-a").click();
    }
  } catch (error) {
    result.errors.push(error.stack ?? String(error));
    try { await page.screenshot({ path: path.join(out, "live-route-search-failure.png") }); } catch {}
  } finally {
    await context.close();
    await browser.close();
    fs.writeFileSync(path.join(out, "live-route-search.json"), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
}

main();
