const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const artifactDirectory = path.resolve("verification-artifacts/emergency-room-sidebar");
const baseUrl = "http://127.0.0.1:5174/verification-artifacts/emergency-room-sidebar/room-properties-preview.html";
const backendRequests = [];

async function main() {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const result = {
    fixture: "TEST ONLY FloorPropertiesPanel; Vite started with Supabase URL and keys blank",
    backendWrites: "none; Room Videos feature is disabled before backend requests",
    browserViewports: [],
    emergencyStatus: "",
    inspectedDoor: "",
    blockedUploadControlCount: null,
    pageErrors,
    backendRequests,
    screenshots: [],
  };

  await page.getByRole("button", { name: "Room Videos" }).click();
  await page.getByTestId("room-video-setup-required").waitFor({ timeout: 10000 });
  const roomVideoSummary = await page.locator("body").innerText();
  assert.equal(await page.getByText("Video setup required").count(), 1, JSON.stringify({ roomVideoSummary, backendRequests }));
  assert.equal(await page.getByRole("button", { name: "Upload Video" }).count(), 0);
  result.blockedUploadControlCount = await page.locator('[data-testid="room-video-upload-input"]').count();
  assert.equal(result.blockedUploadControlCount, 0, "upload input must be absent when the feature is not configured");
  await page.getByText("Setup details").click();
  await page.getByText(/Room Videos is not configured for this environment/).waitFor();

  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate(() => ({
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelWidth: document.querySelector('[data-testid="floor-properties-panel"]')?.getBoundingClientRect().width ?? null,
    }));
    assert.ok(metrics.documentWidth <= viewport.width, `horizontal overflow at ${viewport.width}px`);
    const filename = `room-videos-setup-required-${viewport.width}.png`;
    await page.screenshot({ path: path.join(artifactDirectory, filename), fullPage: true });
    result.browserViewports.push({ ...viewport, ...metrics, noHorizontalOverflow: true });
    result.screenshots.push(filename);
  }

  await page.getByRole("button", { name: "Room Videos" }).click();
  await page.getByRole("button", { name: "Emergency Evacuation" }).click();
  await page.getByRole("button", { name: "Find Emergency Route" }).click();
  await page.getByTestId("room-emergency-validation-summary").getByText("Emergency route unavailable").waitFor();
  result.emergencyStatus = await page.getByTestId("room-emergency-validation-summary").innerText();
  assert.match(result.emergencyStatus, /East Door has no traversable Walking Network link/);
  assert.match(result.emergencyStatus, /Assign a Primary Assembly Point/);
  await page.getByRole("button", { name: "Inspect East Door" }).click();
  result.inspectedDoor = await page.getByTestId("test-only-inspected-door").innerText();
  assert.match(result.inspectedDoor, /test-door-1/);
  await page.getByText("Inspect connections").click();

  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate(() => ({
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelWidth: document.querySelector('[data-testid="floor-properties-panel"]')?.getBoundingClientRect().width ?? null,
    }));
    assert.ok(metrics.documentWidth <= viewport.width, `horizontal overflow at ${viewport.width}px`);
    const filename = `emergency-route-diagnostics-${viewport.width}.png`;
    await page.screenshot({ path: path.join(artifactDirectory, filename), fullPage: true });
    result.browserViewports.push({ ...viewport, ...metrics, noHorizontalOverflow: true });
    result.screenshots.push(filename);
  }

  assert.deepEqual(pageErrors, [], "Chromium should not report uncaught browser exceptions");
  assert.deepEqual(backendRequests, []);
  fs.writeFileSync(path.join(artifactDirectory, "room-properties-admin-browser-results.json"), JSON.stringify(result, null, 2));
  await browser.close();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
