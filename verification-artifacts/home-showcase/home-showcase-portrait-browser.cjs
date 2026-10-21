// TEST ONLY in-memory 9:16 WebM fixture for intrinsic ratio and fullscreen fit.
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium } = require(path.join(process.env.TEMP || process.env.TMP, "plv-video-acceptance", "node_modules", "playwright"));

const baseUrl = process.env.HOME_SHOWCASE_MEDIA_URL || "http://127.0.0.1:5174/";
const artifactDir = path.join(process.cwd(), "verification-artifacts", "home-showcase");
const chromiumPath = "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";
fs.mkdirSync(artifactDir, { recursive: true });

async function makePortraitFixture(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 640;
    const context = canvas.getContext("2d");
    const stream = canvas.captureStream(12);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const frame = (index) => {
      context.fillStyle = "#071440";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#e6b943";
      context.fillRect(24 + (index % 12) * 12, 200, 36, 240);
      context.fillStyle = "#ffffff";
      context.font = "bold 24px sans-serif";
      context.textAlign = "center";
      context.fillText("9:16 TEST VIDEO", 180, 130);
    };
    frame(0);
    recorder.start();
    const interval = setInterval(() => frame(Date.now() / 100), 100);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    clearInterval(interval);
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: "video/webm" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { base64: btoa(binary), bytes: blob.size, width: canvas.width, height: canvas.height };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  try {
    const generator = await browser.newPage();
    const fixture = await makePortraitFixture(generator);
    const media = Buffer.from(fixture.base64, "base64");
    assert.ok(media.length > 1000, "in-memory portrait fixture contains video data");

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/__test/showcase.mp4") {
        return route.fulfill({ status: 200, body: media, headers: { "content-type": "video/webm", "content-length": String(media.length) } });
      }
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
      return route.abort("blockedbyclient");
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.getByRole("heading", { name: "See PLV NaviSync in Action" }).waitFor({ state: "visible", timeout: 10000 });
    await page.getByRole("button", { name: "Play PLV NaviSync showcase video" }).click();
    const video = page.getByTestId("home-showcase-video");
    await page.waitForFunction(() => {
      const element = document.querySelector("[data-testid='home-showcase-video']");
      return element && element.readyState >= 2 && element.videoWidth > 0 && !element.paused;
    }, null, { timeout: 10000 });
    const display = await video.evaluate((element) => ({
      sourceWidth: element.videoWidth,
      sourceHeight: element.videoHeight,
      objectFit: getComputedStyle(element).objectFit,
      frameRatio: element.parentElement.getBoundingClientRect().width / element.parentElement.getBoundingClientRect().height,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    assert.equal(display.sourceWidth, 360);
    assert.equal(display.sourceHeight, 640);
    assert.equal(display.objectFit, "contain");
    assert.ok(Math.abs(display.frameRatio - 16 / 9) < 0.04);
    assert.ok(display.documentWidth <= 390);
    await page.locator("#landing-showcase").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifactDir, "home-showcase-video-portrait-mobile-390.png") });

    await video.evaluate((element) => element.requestFullscreen());
    await page.waitForFunction(() => Boolean(document.fullscreenElement), null, { timeout: 5000 });
    const fullscreen = await video.evaluate((element) => ({
      objectFit: getComputedStyle(element).objectFit,
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      orientation: screen.orientation?.type ?? "unsupported",
    }));
    assert.equal(fullscreen.objectFit, "contain");
    await page.screenshot({ path: path.join(artifactDir, "home-showcase-video-portrait-fullscreen-390.png") });
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 3000 });
    assert.deepEqual(errors, []);

    fs.writeFileSync(path.join(artifactDir, "home-showcase-portrait-browser-results.json"), JSON.stringify({
      browser: "Chromium portrait rendering using an in-memory TEST ONLY canvas recording",
      fixture: { ...fixture, base64: undefined, mimeType: "video/webm", bytes: media.length },
      display,
      fullscreen,
      orientationLock: "not requested; viewport remained under browser control",
      screenshots: ["home-showcase-video-portrait-mobile-390.png", "home-showcase-video-portrait-fullscreen-390.png"],
      pageErrors: errors,
      productionWrites: 0,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
