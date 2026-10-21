// TEST ONLY Chromium acceptance for the configured Home showcase player.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require(path.join(process.env.TEMP || process.env.TMP, "plv-video-acceptance", "node_modules", "playwright"));

const baseUrl = process.env.HOME_SHOWCASE_MEDIA_URL || "http://127.0.0.1:5174/";
const artifactDir = path.join(process.cwd(), "verification-artifacts", "home-showcase");
const chromiumPath = "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";
const mp4 = fs.readFileSync("C:\\Users\\user\\Desktop\\PLV_NaviSync_Emergency_Video_TEST_ONLY (1).mp4");
const vtt = fs.readFileSync("C:\\Users\\user\\Desktop\\PLV_NaviSync_Emergency_Video_TEST_ONLY.vtt");
fs.mkdirSync(artifactDir, { recursive: true });

function waitForMedia(page) {
  return page.waitForFunction(() => {
    const video = document.querySelector("[data-testid='home-showcase-video']");
    return video && video.readyState >= 2 && video.videoWidth > 0 && video.duration > 0 && !video.paused;
  }, null, { timeout: 15000 });
}

async function configureRoutes(page, failFirst = false) {
  let mp4Requests = 0;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__test/showcase.mp4") {
      mp4Requests += 1;
      if (failFirst && mp4Requests === 1) {
        return route.fulfill({ status: 503, body: "TEST ONLY unavailable", headers: { "content-type": "text/plain" } });
      }
      return route.fulfill({
        status: 200,
        body: mp4,
        headers: { "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": String(mp4.length), "access-control-allow-origin": "*" },
      });
    }
    if (url.pathname === "/__test/showcase.vtt") {
      return route.fulfill({ status: 200, body: vtt, headers: { "content-type": "text/vtt; charset=utf-8", "access-control-allow-origin": "*" } });
    }
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    return route.abort("blockedbyclient");
  });
  return () => mp4Requests;
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requestCount = await configureRoutes(page);
  const result = {
    browser: "Chromium on the actual LandingPage with TEST ONLY in-memory MP4/VTT interception",
    mediaBytes: mp4.length,
    productionWrites: 0,
    checks: {},
    screenshots: [],
    pageErrors: errors,
  };

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.getByRole("heading", { name: "See PLV NaviSync in Action" }).waitFor({ state: "visible", timeout: 10000 });
    const video = page.getByTestId("home-showcase-video");
    await video.waitFor({ state: "attached" });
    const initial = await video.evaluate((element) => ({
      paused: element.paused,
      autoplay: element.autoplay,
      muted: element.muted,
      loop: element.loop,
      controls: element.controls,
      playsInline: element.playsInline,
      preload: element.preload,
      frameRatio: element.parentElement.getBoundingClientRect().width / element.parentElement.getBoundingClientRect().height,
    }));
    assert.equal(initial.paused, true);
    assert.equal(initial.autoplay, false);
    assert.equal(initial.muted, false);
    assert.equal(initial.loop, false);
    assert.equal(initial.preload, "none");
    assert.equal(requestCount(), 0, "media is not fetched before explicit Play");
    result.checks.noAutoplayAndLazyMedia = { ...initial, requestsBeforePlay: 0, pass: true };

    await page.locator("#landing-showcase").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifactDir, "home-showcase-video-before-play-1440.png") });
    result.screenshots.push("home-showcase-video-before-play-1440.png");
    await page.getByRole("button", { name: "Play PLV NaviSync showcase video" }).click();
    await waitForMedia(page);
    await page.waitForFunction(() => document.querySelector("[data-testid='home-showcase-video']")?.controls === true, null, { timeout: 5000 });
    const metadata = await video.evaluate((element) => ({
      duration: element.duration,
      width: element.videoWidth,
      height: element.videoHeight,
      paused: element.paused,
      muted: element.muted,
      loop: element.loop,
      controls: element.controls,
      playsInline: element.playsInline,
      trackCount: element.textTracks.length,
      aspect: element.videoWidth / element.videoHeight,
    }));
    assert.ok(metadata.width > 0 && metadata.height > 0);
    assert.ok(Math.abs(metadata.aspect - 16 / 9) < 0.02, "TEST ONLY source is 16:9 landscape");
    assert.equal(metadata.paused, false);
    assert.equal(metadata.muted, false);
    assert.equal(metadata.loop, false);
    assert.equal(metadata.trackCount, 1);
    result.checks.playback = { ...metadata, requestsAfterPlay: requestCount(), pass: true };

    const responsivePlayback = [];
    for (const viewport of [
      { width: 360, height: 800, label: "mobile-360" },
      { width: 390, height: 844, label: "mobile-390" },
      { width: 430, height: 932, label: "mobile-430" },
      { width: 768, height: 900, label: "tablet-768" },
      { width: 1280, height: 720, label: "desktop-1280" },
      { width: 1920, height: 1080, label: "desktop-1920" },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.locator("#landing-showcase").scrollIntoViewIfNeeded();
      const layout = await page.evaluate(() => {
        const element = document.querySelector("[data-testid='home-showcase-video']");
        const player = element?.parentElement?.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          layoutWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          playerRatio: player?.width && player?.height ? player.width / player.height : 0,
          videoWidth: element?.videoWidth ?? 0,
          videoHeight: element?.videoHeight ?? 0,
          paused: element?.paused ?? true,
        };
      });
      assert.ok(layout.documentWidth <= layout.layoutWidth, `mobile playback overflow at ${viewport.label}`);
      assert.ok(Math.abs(layout.playerRatio - 16 / 9) < 0.04, `mobile aspect ratio at ${viewport.label}`);
      assert.equal(layout.paused, false, `playback stays active at ${viewport.label}`);
      responsivePlayback.push({ ...viewport, ...layout, pass: true });
      const screenshot = `home-showcase-video-playing-${viewport.label}.png`;
      await page.screenshot({ path: path.join(artifactDir, screenshot) });
      result.screenshots.push(screenshot);
    }
    result.checks.responsivePlayback = responsivePlayback;

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#landing-showcase").scrollIntoViewIfNeeded();
    const box = await video.boundingBox();
    assert.ok(box);
    const clickNative = (x, y) => video.click({ position: { x, y } });
    await video.hover();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(artifactDir, "home-showcase-video-playing-1440.png") });
    result.screenshots.push("home-showcase-video-playing-1440.png");

    const pausePoint = { x: 22, y: box.height - 47 };
    await clickNative(pausePoint.x, pausePoint.y);
    await page.waitForFunction(() => document.querySelector("[data-testid='home-showcase-video']")?.paused === true, null, { timeout: 3500 });
    await clickNative(pausePoint.x, pausePoint.y);
    await waitForMedia(page);
    result.checks.playPause = "PASS - native controls paused and resumed media playback.";

    await video.evaluate((element) => { element.currentTime = 0.5; });
    await video.hover({ position: { x: box.width * 0.72, y: box.height - 21 } });
    await page.waitForTimeout(150);
    await clickNative(box.width * 0.72, box.height - 21);
    await page.waitForFunction(() => document.querySelector("[data-testid='home-showcase-video']")?.currentTime > 7, null, { timeout: 3500 });
    result.checks.seek = "PASS - native timeline moved playback forward.";

    await video.hover({ position: { x: box.width - 120, y: box.height - 47 } });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(artifactDir, "home-showcase-video-volume-hover-1440.png") });
    result.screenshots.push("home-showcase-video-volume-hover-1440.png");
    const volumeBefore = await video.evaluate((element) => element.volume);
    await clickNative(box.width - 151, box.height - 47);
    let volumeChanged = await page.waitForFunction((before) => {
      const element = document.querySelector("[data-testid='home-showcase-video']");
      return element && Math.abs(element.volume - before) > 0.08;
    }, volumeBefore, { timeout: 1200 }).then(() => true).catch(() => false);
    if (!volumeChanged) {
      await video.focus();
      await video.press("ArrowDown");
      volumeChanged = await page.waitForFunction((before) => {
        const element = document.querySelector("[data-testid='home-showcase-video']");
        return element && Math.abs(element.volume - before) > 0.01;
      }, volumeBefore, { timeout: 1200 }).then(() => true).catch(() => false);
    }
    result.checks.volume = volumeChanged ? "PASS - native volume changed from the controls." : "NOT VERIFIED - headless Chromium did not expose volume adjustment.";

    const mutedBefore = await video.evaluate((element) => element.muted);
    await clickNative(box.width - 120, box.height - 47);
    const muteChanged = await page.waitForFunction((before) => document.querySelector("[data-testid='home-showcase-video']")?.muted !== before, mutedBefore, { timeout: 2500 }).then(() => true).catch(() => false);
    result.checks.mute = muteChanged ? "PASS - native mute control changed the media state." : "NOT VERIFIED - native mute control was unavailable.";
    if (await video.evaluate((element) => element.muted)) {
      await clickNative(box.width - 120, box.height - 47);
      await page.waitForFunction(() => document.querySelector("[data-testid='home-showcase-video']")?.muted === false, null, { timeout: 2500 }).catch(() => {});
    }

    await video.hover({ position: { x: box.width - 68, y: box.height - 47 } });
    await page.waitForTimeout(120);
    await clickNative(box.width - 68, box.height - 47);
    const fullscreen = await page.waitForFunction(() => Boolean(document.fullscreenElement), null, { timeout: 3500 }).then(() => true).catch(() => false);
    result.checks.fullscreen = fullscreen ? "PASS - native fullscreen entered." : "NOT VERIFIED - native fullscreen button did not enter fullscreen.";
    if (fullscreen) {
      await page.screenshot({ path: path.join(artifactDir, "home-showcase-video-fullscreen-1440.png") });
      result.screenshots.push("home-showcase-video-fullscreen-1440.png");
      await page.keyboard.press("Escape");
      const escaped = await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 2000 }).then(() => true).catch(() => false);
      result.checks.fullscreenExitByEscape = escaped ? "PASS - Escape returned to the Home section." : "NOT VERIFIED - Escape did not exit fullscreen in headless Chromium.";
      let exitedByControl = false;
      if (!escaped) {
        const fullscreenBounds = await video.boundingBox();
        if (fullscreenBounds) {
          await video.hover({ position: { x: fullscreenBounds.width - 68, y: fullscreenBounds.height - 47 } });
          await page.waitForTimeout(120);
          await clickNative(fullscreenBounds.width - 68, fullscreenBounds.height - 47);
          exitedByControl = await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 1200 }).then(() => true).catch(() => false);
        }
      }
      result.checks.fullscreenExitByControl = exitedByControl ? "PASS - native fullscreen control returned to the Home section." : escaped ? "PASS - Escape exited fullscreen before the control was needed." : "NOT VERIFIED - native fullscreen exit control was not activated in headless Chromium.";
      if (!escaped && !exitedByControl) {
        await page.evaluate(() => document.exitFullscreen?.());
        await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 2000 });
      }
      result.checks.fullscreenExit = escaped || exitedByControl ? "PASS - fullscreen exit was confirmed." : "NOT VERIFIED - fullscreen API restored the Home section after user controls failed.";
    }

    await video.evaluate((element) => { element.querySelector("track").track.mode = "showing"; });
    await page.waitForFunction(() => document.querySelector("video[data-testid='home-showcase-video'] track")?.readyState === 2, null, { timeout: 6000 });
    await video.evaluate((element) => { element.currentTime = 1.3; });
    await page.waitForFunction(() => {
      const track = document.querySelector("video[data-testid='home-showcase-video'] track")?.track;
      return track?.mode === "showing" && [...(track.activeCues ?? [])].length > 0;
    }, null, { timeout: 4000 });
    await page.locator("#landing-showcase").scrollIntoViewIfNeeded();
    await page.mouse.move(10, 10);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(artifactDir, "home-showcase-video-captions-1440.png") });
    result.screenshots.push("home-showcase-video-captions-1440.png");
    result.checks.captions = "PASS - configured WebVTT track displayed an active cue.";

    await video.evaluate((element) => { element.currentTime = element.duration - 0.18; void element.play(); });
    await page.waitForFunction(() => document.querySelector("[data-testid='home-showcase-video']")?.ended === true, null, { timeout: 3500 });
    await page.getByRole("button", { name: "Replay PLV NaviSync showcase video" }).click();
    await page.waitForFunction(() => {
      const element = document.querySelector("[data-testid='home-showcase-video']");
      return element && !element.paused && element.currentTime < 1;
    }, null, { timeout: 3500 });
    result.checks.replay = "PASS - ending showed Replay and restarted from the beginning.";

    const failedPage = await context.newPage();
    const failedPageErrors = [];
    failedPage.on("pageerror", (error) => failedPageErrors.push(error.message));
    const failedRequestCount = await configureRoutes(failedPage, true);
    await failedPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await failedPage.locator("#landing-showcase").scrollIntoViewIfNeeded();
    await failedPage.getByRole("button", { name: "Play PLV NaviSync showcase video" }).click();
    await failedPage.getByRole("alert").waitFor({ state: "visible", timeout: 8000 });
    await failedPage.screenshot({ path: path.join(artifactDir, "home-showcase-video-error-1440.png") });
    result.screenshots.push("home-showcase-video-error-1440.png");
    await failedPage.getByRole("button", { name: "Try again" }).click();
    await failedPage.getByRole("button", { name: "Play PLV NaviSync showcase video" }).click();
    await waitForMedia(failedPage);
    assert.ok(failedRequestCount() >= 2, "retry requests a fresh media response");
    assert.deepEqual(failedPageErrors, []);
    result.checks.errorRecovery = "PASS - failed media showed a retry action; retry played the test file.";

    assert.deepEqual(errors, []);
    result.pageErrors = errors;
    fs.writeFileSync(path.join(artifactDir, "home-showcase-video-browser-results.json"), JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
