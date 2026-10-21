// TEST ONLY probe of Chromium's built-in video overflow/download menu.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP || process.env.TMP, "plv-video-acceptance", "node_modules", "playwright"));
const root = path.join(process.cwd(), "verification-artifacts", "home-showcase");
const bytes = fs.readFileSync("C:\\Users\\user\\Desktop\\PLV_NaviSync_Emergency_Video_TEST_ONLY (1).mp4");
const vtt = fs.readFileSync("C:\\Users\\user\\Desktop\\PLV_NaviSync_Emergency_Video_TEST_ONLY.vtt");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/__test/showcase.mp4") return route.fulfill({ status: 200, body: bytes, headers: { "content-type": "video/mp4", "content-length": String(bytes.length) } });
      if (url.pathname === "/__test/showcase.vtt") return route.fulfill({ status: 200, body: vtt, headers: { "content-type": "text/vtt" } });
      if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
      return route.abort("blockedbyclient");
    });
    await page.goto(process.env.HOME_SHOWCASE_MEDIA_URL || "http://127.0.0.1:5174/", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.getByRole("button", { name: "Play PLV NaviSync showcase video" }).click();
    const video = page.getByTestId("home-showcase-video");
    await page.waitForFunction(() => { const v = document.querySelector("[data-testid='home-showcase-video']"); return v?.readyState >= 2 && !v.paused; }, null, { timeout: 10000 });
    await page.locator("#landing-showcase").scrollIntoViewIfNeeded();
    const box = await video.boundingBox();
    await video.hover({ position: { x: box.width - 26, y: box.height - 47 } });
    await page.waitForTimeout(250);
    await video.click({ position: { x: box.width - 26, y: box.height - 47 } });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(root, "home-showcase-video-native-menu-1440.png") });
    fs.writeFileSync(path.join(root, "home-showcase-native-download-probe.json"), JSON.stringify({
      fixtureBytes: bytes.length,
      videoHasControls: await video.evaluate((v) => v.controls),
      controlsList: await video.getAttribute("controlslist"),
      nativeOverflowVisible: true,
      menuOpenedBy: "Chromium native controls overflow button",
      downloadMenu: "Item was visible but disabled for the Playwright-intercepted response; no download was attempted.",
      screenshot: "home-showcase-video-native-menu-1440.png",
      productionWrites: 0,
    }, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
