const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const base = "http://127.0.0.1:5174";
const out = __dirname;
const result = { errors: [], cases: [] };

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

  const geometry = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="remaining-route-line"]')].map((line) => line.getAttribute("points")));
  const inspect = async () => page.evaluate(() => ({
    visibleRouteLines: [...document.querySelectorAll('[data-testid="remaining-route-line"]')]
      .filter((line) => line.getBoundingClientRect().width > 0)
      .map((line) => ({ points: line.getAttribute("points"), stroke: getComputedStyle(line).stroke, width: getComputedStyle(line).strokeWidth })),
    markerCount: document.querySelectorAll("[data-route-current-position]").length,
    routeSteps: [...document.querySelectorAll('[data-testid="guided-route-steps"] button')].map((button) => button.innerText.trim()),
    activeInstruction: document.querySelector('[data-testid="current-route-instruction"]')?.textContent?.trim() ?? null,
    stepCounter: document.querySelector('[data-testid="guided-navigation-summary"]')?.textContent?.trim() ?? null,
    floor: [...document.querySelectorAll('[data-testid="student-floor-scene"]')]
      .map((scene) => ({ number: scene.getAttribute("data-floor-number"), opacity: getComputedStyle(scene).opacity }))
      .find((scene) => Number(scene.opacity) > 0) ?? null,
  }));

  const chooseEndpoint = async (dialog, endpoint, query) => {
    const buttonName = endpoint === "start" ? "Choose start" : "Choose destination";
    await dialog.getByTestId(`route-endpoint-card-${endpoint}`).getByRole("button", { name: buttonName }).click();
    const search = dialog.getByRole("searchbox", { name: endpoint === "start" ? "Search start" : "Search destination" });
    await search.fill(query);
    await page.waitForTimeout(700);
    const options = await page.locator('[role="option"]').allInnerTexts();
    const match = await page.locator('[role="option"]').filter({ hasText: new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
    if (await match.count()) await match.click();
    else if (options.length) await page.locator('[role="option"]').first().click();
    return options;
  };

  const runPair = async ({ mode, start, destination, name }) => {
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    if (!(await dialog.count())) await page.getByRole("button", { name: "Open directions" }).click();
    if (mode) await dialog.getByRole("button", { name: `${mode} routing` }).click();
    const startOptions = await chooseEndpoint(dialog, "start", start);
    const destinationOptions = await chooseEndpoint(dialog, "destination", destination);
    await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByTestId("route-summary").waitFor();
    await page.waitForTimeout(500);

    const selector = page.locator('[data-testid="automatic-route-selector"]');
    const choices = await page.locator('[data-testid^="automatic-route-choice-"]').evaluateAll((buttons) => buttons.map((button) => ({ text: button.textContent.trim(), id: button.getAttribute("data-testid"), pressed: button.getAttribute("aria-pressed") })));
    const before = { preview: await dialog.innerText(), geometry: await geometry(), state: await inspect() };
    const inspectIndoorPreview = async (tag) => {
      const enter = page.locator('[data-testid="student-active-transition-marker"][data-student-transition-kind="enter_building"]');
      const enterCount = await enter.count();
      if (enterCount) {
        await enter.first().click({ timeout: 3000 }).catch(() => enter.first().click({ force: true }));
        await page.waitForTimeout(500);
      }
      let floor = await page.locator('[data-testid="student-floor-scene"]').getAttribute("data-floor-number").catch(() => null);
      const targetFloor = Number(destinationOptions[0]?.match(/Floor (\d+)/i)?.[1] ?? (destinationOptions[0]?.match(/Ground Floor/i) ? 1 : floor));
      for (let transitionIndex = 0; floor && Number(floor) !== targetFloor && transitionIndex < 6; transitionIndex += 1) {
        const vertical = page.locator('[data-testid="student-active-transition-marker"][data-student-transition-kind="elevator"], [data-testid="student-active-transition-marker"][data-student-transition-kind="stairs"]');
        if (!(await vertical.count())) break;
        await vertical.first().click({ timeout: 2500 }).catch(() => vertical.first().click({ force: true }));
        const previousFloor = floor;
        await page.waitForFunction((previous) => document.querySelector('[data-testid="student-floor-scene"]')?.getAttribute("data-floor-number") !== previous,
          previousFloor, { timeout: 3000 }).catch(() => undefined);
        floor = await page.locator('[data-testid="student-floor-scene"]').getAttribute("data-floor-number").catch(() => null);
      }
      const indoor = await page.evaluate(() => [...document.querySelectorAll('[data-testid="floor-indoor-route-line"] [data-testid="remaining-route-line"]')]
        .map((line) => line.getAttribute("points")));
      await page.screenshot({ path: path.join(out, `${name}-${tag}-indoor.png`) });
      return { enterMarkerCount: enterCount, floor, indoorGeometry: indoor };
    };
    await page.screenshot({ path: path.join(out, `${name}-route-a-preview.png`) });
    const entry = { name, mode, start, destination, startOptions, destinationOptions, alternativeSelectorVisible: await selector.count() > 0, choices, routeA: before };
    if (choices.length > 1) {
      entry.routeA.indoor = await inspectIndoorPreview("route-a");
      const routeBButton = page.locator('[data-testid^="automatic-route-choice-"]').nth(1);
      const routeBTestId = await routeBButton.getAttribute("data-testid");
      await routeBButton.click();
      await page.waitForTimeout(500);
      entry.routeB = { preview: await dialog.innerText(), geometry: await geometry(), state: await inspect(), selected: await page.locator(`[data-testid="${routeBTestId}"]`).getAttribute("aria-pressed") };
      entry.routeGeometryChanged = JSON.stringify(entry.routeA.geometry) !== JSON.stringify(entry.routeB.geometry);
      entry.routeB.indoor = await inspectIndoorPreview("route-b");
      entry.indoorGeometryChanged = JSON.stringify(entry.routeA.indoor.indoorGeometry) !== JSON.stringify(entry.routeB.indoor.indoorGeometry);
      await page.screenshot({ path: path.join(out, `${name}-route-b-preview.png`) });

      const firstChoiceId = choices[0].id;
      await page.locator(`[data-testid="${firstChoiceId}"]`).click();
      await page.waitForTimeout(300);
      await dialog.getByRole("button", { name: "Start Navigation", exact: true }).click();
      await page.waitForTimeout(250);
      entry.initialNavigation = await inspect();
      entry.expandButtons = await page.locator("button").evaluateAll((buttons) => buttons
        .filter((button) => /expand/i.test(`${button.textContent} ${button.getAttribute("aria-label") ?? ""}`))
        .map((button) => ({ text: button.textContent.trim(), aria: button.getAttribute("aria-label"), disabled: button.disabled,
          rect: (() => { const r = button.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })() })));
      const expandAccessibleName = entry.expandButtons[0]?.aria;
      if (expandAccessibleName) await page.getByRole("button", { name: expandAccessibleName }).click();
      await page.waitForTimeout(250);
      entry.expandedNavigationVisible = await page.getByTestId("guided-navigation-summary").count() > 0;
      if (entry.expandedNavigationVisible) {
        await page.getByRole("button", { name: "Switch to Explore mode" }).click();
        const activeBeforeSwitch = await inspect();
        await page.locator(`[data-testid="${routeBTestId}"]`).click();
        await page.waitForTimeout(450);
        entry.exploreRouteSwitch = {
          priorProgress: activeBeforeSwitch,
          afterSwitch: await inspect(),
          previewVisible: await page.getByTestId("route-summary").count() > 0,
          startAvailable: await page.getByRole("button", { name: "Start Navigation", exact: true }).count() > 0,
          selected: await page.locator(`[data-testid="${routeBTestId}"]`).getAttribute("aria-pressed"),
        };
        await page.screenshot({ path: path.join(out, `${name}-route-b-explore-reset.png`) });
        await page.getByRole("button", { name: "Start Navigation", exact: true }).click();
        await page.waitForTimeout(300);
        const expandedAfterRestart = await page.locator("button").evaluateAll((buttons) => buttons
          .filter((button) => /expand/i.test(`${button.textContent} ${button.getAttribute("aria-label") ?? ""}`))
          .map((button) => button.getAttribute("aria-label")));
        if (expandedAfterRestart[0]) await page.getByRole("button", { name: expandedAfterRestart[0] }).click().catch(() => undefined);
        entry.alternativeRestart = {
          state: await inspect(),
          routeBSelected: await page.locator(`[data-testid="${routeBTestId}"]`).getAttribute("aria-pressed").catch(() => null),
          exploreControl: await page.getByRole("button", { name: "Return to Follow mode" }).count() > 0,
          followControl: await page.getByRole("button", { name: "Switch to Explore mode" }).count() > 0,
        };
        await page.screenshot({ path: path.join(out, `${name}-route-b-explore-restart.png`) });
      }
    } else {
      entry.routeGeometryChanged = false;
    }
    result.cases.push(entry);
  };

  try {
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await runPair({ mode: "Standard", start: "Campus Gate", destination: "BUSINESS OFFICE SIMULATION ROOM", name: "campus-gate-business-office-standard" });
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await runPair({ mode: "Accessible", start: "Campus Gate", destination: "BUSINESS OFFICE SIMULATION ROOM", name: "campus-gate-business-office-accessible" });
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await runPair({ mode: "Standard", start: "CANTEEN", destination: "CABA-403", name: "canteen-caba-standard-repeat" });
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await runPair({ mode: "Accessible", start: "CANTEEN", destination: "CABA-403", name: "canteen-caba-accessible-repeat" });
  } catch (error) {
    result.errors.push(error.stack ?? String(error));
    try { await page.screenshot({ path: path.join(out, "completion-targeted-browser-failure.png") }); } catch {}
  } finally {
    await context.close();
    await browser.close();
    fs.writeFileSync(path.join(out, "completion-targeted-browser.json"), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
}

main();
