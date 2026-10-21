const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const result = { fixture: "read-only published campus; remote writes blocked", checks: {}, errors: [], screenshots: [] };

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => result.errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname.endsWith("supabase.co") && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
      const publicReadRpc = request.method() === "POST" && /\/rpc\/(list_event_safe_published_campuses|list_published_campus_version_status|list_coming_soon_campuses)$/.test(url.pathname);
      if (!publicReadRpc) return route.fulfill({ status: 403, body: "Blocked by read-only navigation test" });
    }
    return route.continue();
  });

  const screenshot = async name => {
    await page.screenshot({ path: path.join(__dirname, name), fullPage: false });
    result.screenshots.push(name);
  };

  try {
    await page.goto("http://127.0.0.1:5174/map", { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await page.getByRole("button", { name: "Open directions" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    await dialog.waitFor();
    await dialog.getByTestId("route-endpoint-card-start").getByRole("button", { name: "Choose start" }).click();
    await page.getByRole("option", { name: /Campus Gate/ }).click();
    await dialog.getByTestId("route-endpoint-card-destination").getByRole("button", { name: "Choose destination" }).click();
    await page.getByRole("option", { name: /BUSINESS OFFICE SIMULATION ROOM/ }).click();
    const accessible = dialog.getByRole("button", { name: "Accessible routing" });
    result.checks.accessibleControlAvailable = await accessible.isVisible().catch(() => false);
    await accessible.click();
    await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByText(/Route ready from Campus Gate to BUSINESS OFFICE SIMULATION ROOM/).waitFor({ timeout: 20000 });
    result.checks.accessibleRoutePreview = true;
    await screenshot("accessible-caba-route-preview.png");
    await dialog.getByRole("button", { name: "Start Navigation", exact: true }).click();
    await page.getByTestId("student-map-surface").waitFor();
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.match(/Step \d+ of \d+/)), null, { timeout: 12000 });
    const readMarker = () => page.evaluate(() => {
      const marker = document.querySelector("[data-route-current-position]");
      if (!marker) return null;
      const transform = marker.getAttribute("transform") ?? "";
      return { progress: Number(marker.getAttribute("data-progress")), transform, visible: marker.getBoundingClientRect().width > 0 };
    });
    const previous = page.getByRole("button", { name: "Previous step" });
    result.checks.accessibleActiveMarker = (await readMarker())?.visible === true;
    result.checks.accessibleStepBefore = await page.locator('[data-testid="collapsed-route-card"]').innerText();
    if (await previous.isEnabled().catch(() => false)) {
      await previous.click();
      await page.getByRole("button", { name: "Resume navigation" }).waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
      result.checks.accessibleReverseSeekTarget = await readMarker();
      await screenshot("accessible-caba-route-reverse-seek.png");
    } else result.checks.accessiblePreviousAvailable = false;
    result.checks.accessibleNextAvailable = await page.getByRole("button", { name: "Next step" }).isEnabled().catch(() => false);
    result.checks.errors = result.errors;
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    try { await screenshot("accessible-browser-failure.png"); } catch {}
  } finally {
    result.checks.remoteWritesBlocked = true;
    fs.writeFileSync(path.join(__dirname, "navigation-accessible-results.json"), JSON.stringify(result, null, 2));
    await context.close();
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
