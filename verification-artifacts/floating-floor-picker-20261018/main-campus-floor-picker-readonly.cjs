const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const base = process.env.FLOOR_PICKER_BASE || "http://[::1]:5173";
const output = path.resolve("verification-artifacts/floating-floor-picker-20261018");
const result = { source: "read-only published MAIN CAMPUS; all non-read-only Supabase mutations blocked", checks: [], screenshots: [], errors: [] };
const safePublishedReads = new Set([
  "list_event_safe_published_campuses",
  "list_published_campus_version_status",
  "list_coming_soon_campuses",
]);

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)) return route.continue();
    if (url.hostname.endsWith("supabase.co")) {
      if (request.method() === "GET" || request.method() === "OPTIONS") return route.continue();
      const rpc = url.pathname.match(/\/rpc\/([^/]+)$/)?.[1];
      if (request.method() === "POST" && rpc && safePublishedReads.has(rpc)) return route.continue();
      return route.fulfill({ status: 403, body: "Blocked by MAIN CAMPUS read-only browser check" });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => result.errors.push(error.message));

  try {
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    const mainBuilding = await page.evaluate(async () => {
      const service = await import("/src/services/campusService.ts");
      const campuses = await service.listPublishedCampusSnapshots();
      const campus = campuses.find((candidate) => candidate.code === "MAIN" && /MAIN CAMPUS - PLV/i.test(candidate.name));
      const building = campus?.buildings.find((candidate) => candidate.code === "CABA"
        || /COLLEGE OF ACCOUNTANCY AND BUSINESS ADMINISTRATION/i.test(candidate.name));
      return campus && building ? { campus: campus.name, campusId: campus.id, buildingId: building.id, building: building.name, floors: building.floors.length } : null;
    });
    if (!mainBuilding) throw new Error("Read-only published MAIN CAMPUS did not include its CABA building");
    result.mainCampus = mainBuilding;
    await page.goto(`${base}/map?buildingId=${encodeURIComponent(mainBuilding.buildingId)}`, { waitUntil: "domcontentloaded" });
    const buildingSheet = page.getByTestId("mobile-building-sheet");
    await buildingSheet.waitFor({ state: "visible" });
    await buildingSheet.getByRole("button", { name: /Enter Building/i }).click();
    const picker = page.getByTestId("student-floor-picker");
    await picker.waitFor({ state: "visible" });

    const inspect = async (stage) => {
      const state = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="student-floor-picker"]');
        const profile = document.querySelector('[data-testid="student-map-profile-trigger"] > button');
        const dialog = document.querySelector('[data-testid="route-planner-dialog"]');
        const rect = (element) => element?.getBoundingClientRect().toJSON() ?? null;
        return {
          pickerCount: document.querySelectorAll('[data-testid="student-floor-picker"], [data-testid="student-floor-picker-inline"]').length,
          inlineCount: document.querySelectorAll('[data-testid="student-floor-picker-inline"]').length,
          accountOwned: Boolean(root?.closest('[data-testid="student-map-floating-account-controls"]')),
          inRoutePanel: Boolean(root?.closest('[data-testid="route-planner-dialog"]')),
          label: root?.querySelector("button")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
          pickerRect: rect(root),
          profileRect: rect(profile),
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          routePanelVisible: Boolean(dialog?.getClientRects().length),
        };
      });
      result.checks.push({ stage, ...state });
      if (state.pickerCount !== 1 || state.inlineCount || !state.accountOwned || state.inRoutePanel) {
        throw new Error(`Published MAIN CAMPUS floor-picker ownership failed at ${stage}: ${JSON.stringify(state)}`);
      }
      if (state.documentWidth !== state.viewportWidth) throw new Error(`Published map overflowed at ${stage}: ${JSON.stringify(state)}`);
      return state;
    };

    await inspect("indoor-standard-390");
    await page.screenshot({ path: path.join(output, "main-campus-caba-floor-390.png"), fullPage: false });
    result.screenshots.push("main-campus-caba-floor-390.png");

    await page.getByRole("button", { name: "Open directions" }).click();
    const dialog = page.getByTestId("route-planner-dialog");
    await dialog.waitFor({ state: "visible" });
    await inspect("route-planner-standard-390");
    if (await dialog.getByRole("button", { name: "Accessible routing" }).count()) {
      await dialog.getByRole("button", { name: "Accessible routing" }).click();
      await inspect("route-planner-accessible-390");
    }
    if (await dialog.getByRole("button", { name: "SOS routing" }).count()) {
      await dialog.getByRole("button", { name: "SOS routing" }).click();
      await inspect("route-planner-sos-390");
    }

    const floorTrigger = page.getByRole("button", { name: /Choose floor\. Current floor:/ });
    await floorTrigger.click();
    const floorList = page.getByRole("listbox");
    await floorList.waitFor({ state: "visible" });
    const floorOptions = await floorList.getByRole("option").allTextContents();
    result.checks.push({ stage: "floor-menu-open-390", optionCount: floorOptions.length, options: floorOptions.map((text) => text.replace(/\s+/g, " ").trim()) });
    const otherFloor = floorList.locator('[role="option"][aria-selected="false"]').first();
    if (floorOptions.length > 1) {
      const targetLabel = (await otherFloor.innerText()).replace(/\s+/g, " ").trim();
      const compactLabel = (await otherFloor.locator("span").first().textContent())?.trim() ?? "";
      await otherFloor.click();
      await page.waitForFunction((label) => document.querySelector('[data-testid="student-floor-picker"] button')?.textContent?.includes(label), compactLabel, { timeout: 5000 });
      result.checks.push({ stage: "selected-another-floor-390", targetLabel, pickerLabel: await floorTrigger.textContent().catch(() => "") });
      await inspect("after-selecting-floor-in-sos-planner-390");
    } else {
      await page.keyboard.press("Escape");
      await page.getByTestId("student-floor-picker-menu").waitFor({ state: "hidden" });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await inspect("route-planner-sos-1440");
    await page.screenshot({ path: path.join(output, "main-campus-caba-route-planner-1440.png"), fullPage: false });
    result.screenshots.push("main-campus-caba-route-planner-1440.png");

    if (result.errors.length) throw new Error(`Chromium page errors: ${result.errors.join(" | ")}`);
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack?.slice(0, 2500) };
    await page.screenshot({ path: path.join(output, "main-campus-floor-picker-failure.png"), fullPage: false }).catch(() => {});
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(output, "main-campus-floor-picker-readonly-results.json"), JSON.stringify(result, null, 2));
    await browser.close();
    console.log(JSON.stringify(result, null, 2));
  }
}

main();
