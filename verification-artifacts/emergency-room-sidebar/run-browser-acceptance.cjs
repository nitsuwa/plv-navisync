const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const outputDirectory = path.resolve("verification-artifacts/emergency-room-sidebar");
fs.mkdirSync(outputDirectory, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const result = {
    fixture: "TEST ONLY local FloorPropertiesPanel harness; no campus writes",
    storageAdapter: "request interception only; table returns no rows and private bucket reports not found",
    productionWrites: "none",
    requests: [],
    routeFailure: {},
    viewports: [],
    browserErrors: [],
    screenshots: [],
  };
  page.on("pageerror", (error) => result.browserErrors.push(error.message));
  await page.route("**/rest/v1/emergency_evacuation_videos**", async (route) => {
    result.requests.push({ method: route.request().method(), url: new URL(route.request().url()).pathname, adapter: "TEST ONLY empty metadata table" });
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/storage/v1/object/list/emergency-evacuation-videos**", async (route) => {
    result.requests.push({ method: route.request().method(), url: new URL(route.request().url()).pathname, adapter: "TEST ONLY missing private bucket" });
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ statusCode: "404", error: "Bucket not found", message: "Bucket not found" }) });
  });
  await page.goto("http://127.0.0.1:5174/verification-artifacts/emergency-room-sidebar/room-properties-preview.html", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Emergency Evacuation" }).click();
  await page.getByRole("button", { name: "Validate Routes" }).click();
  await page.getByTestId("room-emergency-validation-summary").getByText("Assign one Primary Assembly Point to this Building.").waitFor();
  result.routeFailure.summary = await page.getByTestId("room-emergency-validation-summary").innerText();
  result.routeFailure.routePickerVisible = await page.getByRole("combobox", { name: "Evacuation Route A" }).count() > 0;
  result.routeFailure.issueDetailsInitiallyCollapsed = !(await page.getByTestId("room-emergency-door-statuses").evaluate((node) => node.hasAttribute("open")));
  await page.getByRole("button", { name: "Inspect Connections" }).click();
  result.routeFailure.selectedDoor = await page.getByTestId("test-only-inspected-door").innerText();

  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate(() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, panelWidth: document.querySelector('[data-testid="floor-properties-panel"]')?.getBoundingClientRect().width ?? null }));
    const screenshot = `room-properties-invalid-${viewport.width}.png`;
    await page.screenshot({ path: path.join(outputDirectory, screenshot), fullPage: true });
    result.viewports.push({ ...viewport, ...metrics, noHorizontalOverflow: metrics.documentWidth <= viewport.width });
    result.screenshots.push(screenshot);
  }

  await page.getByText("Connection details").click();
  result.routeFailure.doorDetail = await page.getByTestId("room-emergency-door-statuses").innerText();
  await page.setViewportSize({ width: 390, height: 844 });
  const diagnosticsScreenshot = "room-properties-connection-details-390.png";
  await page.screenshot({ path: path.join(outputDirectory, diagnosticsScreenshot), fullPage: true });
  result.screenshots.push(diagnosticsScreenshot);

  await page.getByRole("button", { name: /emergency evacuation video guide/i }).click();
  await page.getByTestId("emergency-video-storage-setup").waitFor({ timeout: 8000 });
  result.videoSetupNotice = await page.getByTestId("emergency-video-storage-setup").innerText();
  result.uploadDisabled = await page.getByRole("button", { name: "Upload MP4 video" }).isDisabled();
  const videoScreenshot = "room-properties-video-storage-setup-390.png";
  await page.screenshot({ path: path.join(outputDirectory, videoScreenshot), fullPage: true });
  result.screenshots.push(videoScreenshot);
  result.browserErrors = [...new Set(result.browserErrors)];
  fs.writeFileSync(path.join(outputDirectory, "browser-acceptance-results.json"), JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
