const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const outputDirectory = path.resolve("verification-artifacts/room-video-admin-polish-20261018");
const appOrigin = "http://localhost:5175";
const backendOrigin = "https://test-room-video.supabase.co";
const testMediaPath = path.resolve("public/videos/plv-navisync-showcase.mp4");
const testUserId = "90000000-0000-4000-8000-000000000001";
const videoRow = {
  id: "test-video-room-welcome",
  campus_id: "test-campus-only",
  building_id: "test-building-1",
  floor_id: "test-floor-1",
  room_id: "test-room-101",
  storage_path: "test-campus-only/test-room-101/room-welcome.mp4",
  captions_path: null,
  original_filename: "TEST_ONLY_room-welcome.mp4",
  mime_type: "video/mp4",
  file_size_bytes: 25773122,
  title: "TEST ONLY Room welcome",
  status: "draft",
  created_at: "2026-10-18T00:00:00.000Z",
  updated_at: "2026-10-18T00:00:00.000Z",
};

const result = {
  environment: "TEST ONLY local Room Properties harness with intercepted Supabase calls; no production or Storage writes",
  routeAdapter: backendOrigin,
  viewports: [],
  screenshots: [],
  checks: {},
  adapterRequests: [],
  unexpectedRequests: [],
  mediaResponses: [],
  mediaRequestFailures: [],
  mediaState: null,
  pageErrors: [],
};
let browser;

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    },
  });
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(outputDirectory, name), animations: "disabled" });
  result.screenshots.push(name);
}

async function main() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await context.addInitScript(({ userId }) => {
    localStorage.setItem("sb-test-room-video-auth-token", JSON.stringify({
      access_token: "TEST_ONLY_LOCAL_TOKEN",
      refresh_token: "TEST_ONLY_LOCAL_REFRESH",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, aud: "authenticated", role: "authenticated", email: "room-video-admin@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    }));
  }, { userId: testUserId });

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === appOrigin) return route.continue();
    // Ignore a browser-installed Kaspersky helper request. Google Fonts is a
    // styling dependency of the page and may load from its normal public CDN.
    if (url.hostname === "gc.kis.v2.scr.kaspersky-labs.com") return route.abort();
    if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return route.continue();
    if (url.origin !== backendOrigin) {
      result.unexpectedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }

    const { pathname } = url;
    const method = request.method().toUpperCase();
    result.adapterRequests.push({ method, path: pathname });
    if (method === "OPTIONS") return json(route, {}, 204);
    if (pathname.endsWith("/auth/v1/user") && method === "GET") {
      return json(route, { id: testUserId, aud: "authenticated", role: "authenticated", email: "room-video-admin@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
    }
    if (pathname.endsWith("/rest/v1/rpc/is_admin") && method === "POST") return json(route, true);
    if (/\/rest\/v1\/(?:room_videos|emergency_evacuation_videos)(?:$|\/)/.test(pathname)) {
      if (method === "GET") {
        if (pathname.includes("emergency_evacuation_videos")) return json(route, []);
        if (url.searchParams.has("limit") && url.searchParams.get("select") === "id") return json(route, []);
        if (url.searchParams.has("id")) return json(route, { storage_path: videoRow.storage_path });
        return json(route, [videoRow]);
      }
      if (method === "PATCH") {
        Object.assign(videoRow, request.postDataJSON(), { updated_at: new Date().toISOString() });
        return json(route, { id: videoRow.id });
      }
      if (method === "POST") return json(route, videoRow, 201);
      if (method === "DELETE") return json(route, { id: videoRow.id });
    }
    if (/\/storage\/v1\/object\/sign\/emergency-evacuation-videos\//.test(pathname) && method === "GET") {
      const bytes = fs.readFileSync(testMediaPath);
      const range = request.headers().range;
      const cors = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,HEAD,OPTIONS",
        "accept-ranges": "bytes",
        "content-type": "video/mp4",
      };
      if (range && /^bytes=\d+-\d*$/.test(range)) {
        const [startText, endText] = range.slice(6).split("-");
        const start = Number(startText);
        const end = Math.min(endText ? Number(endText) : bytes.length - 1, bytes.length - 1);
        return route.fulfill({ status: 206, body: bytes.subarray(start, end + 1), headers: { ...cors, "content-range": `bytes ${start}-${end}/${bytes.length}`, "content-length": String(end - start + 1) } });
      }
      return route.fulfill({ status: 200, body: bytes, headers: { ...cors, "content-length": String(bytes.length) } });
    }
    if (pathname.endsWith("/storage/v1/object/list/emergency-evacuation-videos") && method === "POST") return json(route, []);
    if (/\/storage\/v1\/object\/sign\/emergency-evacuation-videos\//.test(pathname) && method === "POST") {
      return json(route, { signedURL: `/object/sign/emergency-evacuation-videos/${videoRow.storage_path}?token=TEST_ONLY` });
    }
    return json(route, { message: "Blocked by the isolated TEST ONLY adapter." }, 403);
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => result.pageErrors.push(error.message));
  page.on("response", (response) => {
    if (/\.mp4(?:\?|$)/i.test(response.url())) result.mediaResponses.push({ url: response.url(), status: response.status(), contentType: response.headers()["content-type"] ?? null });
  });
  page.on("requestfailed", (request) => {
    if (/\.mp4(?:\?|$)/i.test(request.url())) result.mediaRequestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" });
  });
  await page.goto(`${appOrigin}/verification-artifacts/emergency-room-sidebar/room-properties-preview.html`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Room Videos" }).click();
  await page.getByTestId(`room-video-row-${videoRow.id}`).waitFor();
  result.checks.roomEmergencyStatusOmitted = await page.getByTestId("room-emergency-evacuation-section").count() === 0;
  result.checks.emergencyVideoGuideRetained = await page.getByRole("button", { name: "Emergency Evacuation Video Guide" }).count() === 1;
  result.checks.draftStateShown = await page.getByTestId(`room-video-row-${videoRow.id}`).getByText("Draft").count() === 1;

  for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.getByTestId(`room-video-row-${videoRow.id}`).scrollIntoViewIfNeeded();
    const metrics = await page.evaluate(() => ({
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelWidth: document.querySelector('[data-testid="floor-properties-panel"]')?.getBoundingClientRect().width ?? null,
    }));
    result.viewports.push({ ...viewport, ...metrics, noHorizontalOverflow: metrics.documentWidth <= viewport.width });
    assert.ok(metrics.documentWidth <= viewport.width, `horizontal overflow at ${viewport.width}px`);
    if (viewport.width === 320) await capture(page, "room-properties-320-light.png");
  }

  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const inlinePlayer = page.getByTestId(`room-video-preview-${videoRow.id}-frame`);
  await inlinePlayer.waitFor();
  await page.waitForFunction(() => {
    const video = document.querySelector('[data-testid="room-video-preview-test-video-room-welcome"]');
    return Boolean(video && video.readyState >= 1);
  }, { timeout: 20000 }).catch(() => undefined);
  result.mediaState = await page.locator("video").evaluate((video) => ({
    src: video.getAttribute("src"), currentSrc: video.currentSrc, readyState: video.readyState,
    networkState: video.networkState, error: video.error ? { code: video.error.code, message: video.error.message } : null,
    duration: video.duration, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
  }));
  if (result.mediaState.error) {
    fs.writeFileSync(path.join(outputDirectory, "room-video-admin-browser-results.json"), `${JSON.stringify(result, null, 2)}\n`);
    throw new Error(`Test media failed to load: ${JSON.stringify(result.mediaState)}; see browser results JSON`);
  }
  const inlineDimensions = await inlinePlayer.locator(".aspect-video").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, ratio: rect.width / rect.height };
  });
  result.checks.inlinePlayerUses16x9 = Math.abs(inlineDimensions.ratio - 16 / 9) < 0.04;
  result.checks.pausedPlayerHasSinglePlayControl = await inlinePlayer.getByRole("button", { name: `Play ${videoRow.title}` }).count() === 1;
  result.checks.noDuplicateCenterPlayOverlay = await inlinePlayer.getByRole("button", { name: `Start ${videoRow.title} playback` }).count() === 0;
  const inlineVideo = page.getByTestId(`room-video-preview-${videoRow.id}`);
  const seekSlider = inlinePlayer.getByRole("slider", { name: `Seek ${videoRow.title}` });
  await seekSlider.focus();
  await seekSlider.press("ArrowRight");
  await page.waitForFunction(() => (document.querySelector("video")?.currentTime ?? 0) > 0);
  result.checks.inlineSeekingWorks = await inlineVideo.evaluate((video) => video.currentTime > 0);
  const volumeSlider = inlinePlayer.getByRole("slider", { name: "Room video volume" });
  await volumeSlider.focus();
  await volumeSlider.press("ArrowLeft");
  result.checks.inlineVolumeWorks = await inlineVideo.evaluate((video) => video.volume < 0.8 && video.volume > 0.7);
  await page.getByTestId(`room-video-row-${videoRow.id}`).scrollIntoViewIfNeeded();
  await capture(page, "room-video-inline-390-dark.png");

  const expandButton = page.getByRole("button", { name: "Expand Preview" });
  await expandButton.click();
  const previewDialog = page.getByTestId("room-video-expanded-preview");
  await previewDialog.waitFor();
  result.checks.onlyOneVideoInstanceInDialog = await previewDialog.locator("video").count() === 1
    && await page.locator("video").count() === 1;
  const dialogDimensions = await previewDialog.locator(".aspect-video").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, ratio: rect.width / rect.height };
  });
  result.checks.expandedPlayerUses16x9 = Math.abs(dialogDimensions.ratio - 16 / 9) < 0.04;
  await page.evaluate(() => { window.__roomVideoTestElement = document.querySelector("video"); });
  await page.getByRole("button", { name: `Play ${videoRow.title}` }).click();
  await page.waitForFunction(() => document.querySelector("video")?.paused === false);
  await page.getByRole("button", { name: "Close expanded preview" }).click();
  await previewDialog.waitFor({ state: "detached" });
  result.checks.expandedCloseStopsPlayback = await page.evaluate(() => !window.__roomVideoTestElement || window.__roomVideoTestElement.paused);
  result.checks.focusReturnsToExpandAction = await expandButton.evaluate((button) => document.activeElement === button);
  await page.getByRole("button", { name: "Hide preview" }).click();
  await expandButton.click();
  await previewDialog.waitFor();
  await capture(page, "room-video-expanded-390-dark.png");
  await page.keyboard.press("Escape");
  await previewDialog.waitFor({ state: "detached" });
  result.checks.escapeClosesExpandedPreview = true;
  result.checks.escapeReturnsFocusToExpandAction = await expandButton.evaluate((button) => document.activeElement === button);
  if (await page.getByRole("button", { name: "Hide preview" }).count()) {
    await page.getByRole("button", { name: "Hide preview" }).click();
  }

  await page.getByRole("button", { name: `More actions for ${videoRow.title}` }).click();
  result.checks.secondaryActionsInMenu = await page.getByRole("menuitem", { name: "Edit title" }).count() === 1
    && await page.getByRole("menuitem", { name: "Replace video" }).count() === 1
    && await page.getByRole("menuitem", { name: "Captions" }).count() === 1;
  await page.getByRole("menuitem", { name: "Remove" }).click();
  result.checks.removeRequiresConfirmation = await page.getByRole("alertdialog").isVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  result.checks.removeCancelPreservesRecord = await page.getByTestId(`room-video-row-${videoRow.id}`).count() === 1;

  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("button", { name: "Unpublish" }).waitFor();
  result.checks.testOnlyPublishAction = videoRow.status === "published";
  result.adapterRequests.push({ action: "Test-only publish", status: videoRow.status });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const videoElement = page.getByTestId(`room-video-preview-${videoRow.id}`);
  await videoElement.waitFor();
  await videoElement.evaluate((video) => video.readyState >= 1 ? true : new Promise((resolve) => video.addEventListener("loadedmetadata", () => resolve(true), { once: true })));
  result.checks.publishedVideoPreviewLoads = await videoElement.evaluate((video) => video.readyState >= 1 && video.error === null);
  await capture(page, "room-video-published-390-dark.png");
  await page.getByRole("button", { name: "Hide preview" }).click();
  await page.getByRole("button", { name: "Unpublish" }).click();
  await page.getByRole("button", { name: "Publish" }).waitFor();
  result.checks.testOnlyUnpublishAction = videoRow.status === "draft";
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const draftVideoElement = page.getByTestId(`room-video-preview-${videoRow.id}`);
  await draftVideoElement.waitFor();
  await draftVideoElement.evaluate((video) => video.readyState >= 1 ? true : new Promise((resolve) => video.addEventListener("loadedmetadata", () => resolve(true), { once: true })));
  result.checks.draftVideoPreviewLoads = await draftVideoElement.evaluate((video) => video.readyState >= 1 && video.error === null);
  await capture(page, "room-video-draft-390-dark.png");

  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId(`room-video-row-${videoRow.id}`).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Expand Preview" }).click();
  await previewDialog.waitFor();
  const desktopMetrics = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    dialogWidth: document.querySelector('[data-testid="room-video-expanded-preview"]')?.getBoundingClientRect().width ?? null,
  }));
  result.viewports.push({ width: 1440, height: 900, ...desktopMetrics, noHorizontalOverflow: desktopMetrics.documentWidth <= 1440 });
  result.checks.desktopDialogIsLarge = desktopMetrics.dialogWidth > 900;
  await capture(page, "room-video-expanded-1440-light.png");
  await page.getByRole("button", { name: "Close expanded preview" }).click();
  await previewDialog.waitFor({ state: "detached" });

  result.checks.noBrowserErrors = result.pageErrors.length === 0;
  result.checks.noUnexpectedRequests = result.unexpectedRequests.length === 0;
  result.checks.noProductionStorageWrites = result.adapterRequests.every(({ method, path: requestPath }) =>
    !["POST", "PATCH", "PUT", "DELETE"].includes(method)
      || requestPath.endsWith("/auth/v1/user")
      || requestPath.endsWith("/rest/v1/rpc/is_admin")
      || requestPath.endsWith("/rest/v1/room_videos")
      || requestPath.includes("/storage/v1/object/list/")
      || requestPath.includes("/storage/v1/object/sign/"));
  assert.deepEqual(result.unexpectedRequests, []);
  assert.deepEqual(result.pageErrors, []);
  assert.equal(result.checks.inlinePlayerUses16x9, true);
  assert.equal(result.checks.expandedPlayerUses16x9, true);
  assert.equal(result.checks.onlyOneVideoInstanceInDialog, true);
  assert.equal(result.checks.expandedCloseStopsPlayback, true);
  assert.equal(result.checks.roomEmergencyStatusOmitted, true);
  assert.equal(result.checks.emergencyVideoGuideRetained, true);
  fs.writeFileSync(path.join(outputDirectory, "room-video-admin-browser-results.json"), `${JSON.stringify(result, null, 2)}\n`);
  await browser.close();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(async (error) => {
  console.error(error);
  try { fs.writeFileSync(path.join(outputDirectory, "room-video-admin-browser-results.json"), `${JSON.stringify(result, null, 2)}\n`); } catch {}
  if (browser) await browser.close();
  process.exitCode = 1;
});
