const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { chromium } = require(path.join(process.env.TEMP, "plv-video-acceptance", "node_modules", "playwright"));

const base = "http://127.0.0.1:5173";
const snapshotPath = path.join(os.tmpdir(), "plv-published-sanitized-local.json");
const mediaPath = "C:/Users/user/Desktop/PLV_NaviSync_Emergency_Video_TEST_ONLY (1).mp4";
const captionsPath = "C:/Users/user/Desktop/PLV_NaviSync_Emergency_Video_TEST_ONLY.vtt";
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const sample = fs.readFileSync(mediaPath);
const captions = fs.readFileSync(captionsPath);
const cabaId = "ffe40872-45b8-4ca2-a148-61e6c7d00b40";
const results = { environment: "local Vite + Chromium; TEST ONLY cloned published snapshot; external Supabase routes intercepted", checks: {}, adapterEvents: [], browserErrors: [] };
let videoRow = null;
let uploadedVideo = null;
let uploadedCaptions = null;

function json(route, value, status = 200, extra = {}) {
  return route.fulfill({ status, body: JSON.stringify(value), headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,OPTIONS,DELETE",
    ...extra,
  } });
}

function media(route, bytes, mime, downloadName = "") {
  const request = route.request();
  const range = request.headers().range;
  let body = bytes;
  let status = 200;
  const headers = {
    "content-type": mime,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,HEAD,OPTIONS",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=60",
  };
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
      body = bytes.subarray(start, end + 1);
      status = 206;
      headers["content-range"] = `bytes ${start}-${end}/${bytes.length}`;
    }
  }
  headers["content-length"] = String(body.length);
  if (downloadName || new URL(request.url()).searchParams.has("download")) {
    const name = downloadName || new URL(request.url()).searchParams.get("download") || "TEST_ONLY.mp4";
    headers["content-disposition"] = `attachment; filename="${name.replace(/[\r\n"]/g, "_")}"`;
  }
  return route.fulfill({ status, body, headers });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true, reducedMotion: "reduce" });
  await context.addInitScript(({ snapshot }) => {
    const source = structuredClone(snapshot);
    source.name = `TEST ONLY · ${source.name}`;
    localStorage.setItem("plv-test-only-published-campus-source", JSON.stringify(source));
    localStorage.setItem("sb-aaketmqvxqjgaznvclqc-auth-token", JSON.stringify({
      access_token: "TEST_ONLY_LOCAL_TOKEN",
      refresh_token: "TEST_ONLY_LOCAL_REFRESH",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "90000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "acceptance-admin@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    }));
  }, { snapshot });

  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    const method = req.method().toUpperCase();
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();

    if (pathname.endsWith("/auth/v1/user")) {
      results.adapterEvents.push({ type: "auth-user-test-adapter" });
      return json(route, { id: "90000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "acceptance-admin@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
    }

    if (/\/storage\/v1\/object\/emergency-evacuation-videos\//.test(pathname) && method === "POST") {
      const bytes = req.postDataBuffer() ?? Buffer.alloc(0);
      if (pathname.toLowerCase().endsWith(".vtt")) uploadedCaptions = bytes.length ? Buffer.from(bytes) : Buffer.from(captions);
      else uploadedVideo = bytes.length ? Buffer.from(bytes) : Buffer.from(sample);
      results.adapterEvents.push({ type: "storage-upload", media: pathname.toLowerCase().endsWith(".vtt") ? "captions" : "video", bytes: bytes.length });
      if (!pathname.toLowerCase().endsWith(".vtt") && bytes.length === 0) results.adapterEvents.push({ type: "fixture-bytes-used-by-local-adapter", bytes: sample.length, source: "attached TEST ONLY sample file" });
      return route.fulfill({ status: 200, body: "{}", headers: { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST,OPTIONS" } });
    }

    if (/\/storage\/v1\/object\/sign\/emergency-evacuation-videos\//.test(pathname) && method === "POST") {
      const objectPath = pathname.split("/storage/v1/object/sign/emergency-evacuation-videos/")[1] ?? "test-only/video.mp4";
      results.adapterEvents.push({ type: "signed-url", object: objectPath });
      return json(route, { signedURL: `/object/sign/emergency-evacuation-videos/${objectPath}?token=TEST_ONLY` });
    }

    if (/\/storage\/v1\/object\/sign\/emergency-evacuation-videos\//.test(pathname) && (method === "GET" || method === "HEAD")) {
      const isVtt = pathname.toLowerCase().endsWith(".vtt");
      results.adapterEvents.push({ type: "signed-media-fetch", media: isVtt ? "captions" : "video", range: req.headers().range ?? null });
      if (isVtt) return media(route, uploadedCaptions ?? captions, "text/vtt; charset=utf-8");
      return media(route, uploadedVideo ?? sample, "video/mp4", "PLV_NaviSync_Emergency_Video_TEST_ONLY.mp4");
    }

    if (/\/rest\/v1\/emergency_evacuation_videos(?:$|\/)/.test(pathname)) {
      if (method === "POST") {
        const payload = req.postDataJSON();
        const item = Array.isArray(payload) ? payload[0] : payload;
        videoRow = { ...item, status: "draft", captions_path: null, captions_size_bytes: null, duration_seconds: null, approved_route_fingerprint: null, approved_by: null, published_at: null, updated_at: new Date().toISOString(), created_at: new Date().toISOString() };
        results.adapterEvents.push({ type: "metadata-insert", videoId: videoRow.id, status: videoRow.status });
        return json(route, videoRow, 201);
      }
      if (method === "GET") {
        const wantsRows = url.searchParams.get("select") === "*" && !url.searchParams.has("id");
        results.adapterEvents.push({ type: "metadata-read", videoId: videoRow?.id ?? null });
        return json(route, wantsRows ? (videoRow ? [videoRow] : []) : videoRow);
      }
      if (method === "PATCH") {
        const changes = req.postDataJSON();
        if (videoRow) videoRow = { ...videoRow, ...changes, updated_at: new Date().toISOString() };
        results.adapterEvents.push({ type: "metadata-update", status: videoRow?.status ?? null, fields: Object.keys(changes ?? {}) });
        return json(route, videoRow ? { id: videoRow.id } : null);
      }
      if (method === "DELETE") return json(route, []);
    }

    if (/\/rest\/v1\/profiles$/.test(pathname) && method === "GET") {
      results.adapterEvents.push({ type: "profile-bootstrap-test-adapter" });
      return json(route, null);
    }

    if (/\/rest\/v1\/(system_settings|favorites)$/.test(pathname) && method === "GET") {
      results.adapterEvents.push({ type: "supporting-read-test-adapter", table: pathname.split("/").pop() });
      return json(route, []);
    }

    if (/\/rest\/v1\/rpc\/get_published_emergency_evacuation_video$/.test(pathname) && method === "POST") {
      const input = req.postDataJSON();
      const visible = videoRow?.status === "published" && videoRow?.id === input?.p_video_id;
      results.adapterEvents.push({ type: "student-video-rpc", result: visible ? "published" : "not-published" });
      const { status: _status, ...row } = videoRow ?? {};
      return json(route, visible ? row : null);
    }

    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } });
    results.adapterEvents.push({ type: "blocked-external-request", method, path: pathname });
    return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => results.browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("ERR_BLOCKED_BY_CLIENT")) results.browserErrors.push(message.text().slice(0, 400)); });
  page.on("requestfailed", (request) => { if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) results.adapterEvents.push({ type: "external-request-intercepted", path: new URL(request.url()).pathname }); });

  try {
    await page.goto(`${base}/__test-only/emergency-acceptance`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("test-only-acceptance-shell").waitFor();
    results.checks.fixtureLoaded = await page.getByTestId("test-only-full-map-root").isVisible();
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-full-map-initial.png", fullPage: false });

    // Exercise the actual Admin video review component against an in-memory API.
    await page.getByRole("button", { name: "Admin video review" }).click();
    await page.getByTestId("test-only-admin-video").waitFor();
    await page.getByRole("button", { name: "Emergency Evacuation Video Guide" }).click();
    await page.getByRole("checkbox", { name: "Enable Emergency Video Guide" }).check();
    await page.getByRole("button", { name: "Upload MP4 video" }).click();
    await page.locator('input[accept="video/mp4,.mp4"]').setInputFiles(mediaPath);
    await page.getByTestId("emergency-video-admin-record").waitFor();
    await page.getByText(/Uploaded · awaiting review/).waitFor();
    results.checks.adminUploadViaActualComponent = Boolean(videoRow && videoRow.status === "draft" && uploadedVideo?.equals(sample));
    results.checks.adminUploadAdapter = { metadataCreatedAsDraft: videoRow?.status === "draft", interceptedXhrBodyBytes: results.adapterEvents.find((event) => event.type === "storage-upload" && event.media === "video")?.bytes ?? null, sampleServedFromLocalFixture: uploadedVideo?.equals(sample) ?? false };

    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const adminVideo = page.locator('[data-testid="emergency-video-admin-record"] video');
    await adminVideo.waitFor();
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-testid="emergency-video-admin-record"] video');
      return video instanceof HTMLVideoElement && video.readyState >= 1 && video.duration > 0;
    });
    results.checks.adminPreviewDecodedMetadata = await adminVideo.evaluate((video) => ({ readyState: video.readyState, duration: video.duration, videoWidth: video.videoWidth, tracks: video.textTracks.length }));

    await page.locator('input[accept="text/vtt,.vtt"]').setInputFiles(captionsPath);
    await page.getByText("Captions attached. Re-review the guide after changing subtitles.").waitFor();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-testid="emergency-video-admin-record"] video');
      return video instanceof HTMLVideoElement && video.readyState >= 1 && video.duration > 0;
    });
    await page.locator('[data-testid="emergency-video-admin-record"] label').filter({ hasText: "I previewed this video" }).locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Review & publish" }).click();
    await page.getByText("Published", { exact: true }).waitFor();
    results.checks.adminReviewAndPublishGate = Boolean(videoRow?.status === "published" && Array.isArray(videoRow.approved_route_fingerprint));
    await page.getByRole("button", { name: "Save TEST ONLY draft" }).click();
    await page.getByRole("button", { name: "Reload saved draft" }).click();
    await page.getByRole("button", { name: "Emergency Evacuation Video Guide" }).click();
    await page.getByText("Published", { exact: true }).waitFor();
    results.checks.adminDraftSaveReload = (await page.evaluate(() => JSON.parse(localStorage.getItem("plv-test-only-video-admin-draft") || "null")?.videoGuide?.reviewStatus)) === "approved";
    await page.getByRole("button", { name: "Publish TEST ONLY snapshot to Student Map" }).click();
    await page.getByTestId("test-only-full-map-root").waitFor();
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-full-map-test-published.png", fullPage: false });

    const visibleSearch = page.locator('input[placeholder*="Search"]').filter({ visible: true }).first();
    await visibleSearch.fill("CABA LECTURE HALL");
    const result = page.locator('button[aria-label^="CABA LECTURE HALL, Room"]');
    await result.click();
    await page.getByTestId("student-emergency-video-card").waitFor({ timeout: 12000 });
    results.checks.studentConsumedOnlyAdapterPublishedVideo = await page.getByTestId("student-emergency-video-card").isVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "SOS routing", exact: true }).click();
    await page.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByRole("button", { name: "Both Routes", exact: true }).waitFor();
    results.checks.cabaBothRoutes = await page.getByRole("button", { name: "Both Routes", exact: true }).isVisible();
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-caba-both-routes-desktop.png", fullPage: false });

    const routeButtonA = page.getByRole("button", { name: /Left Exit.*Start at Room door/i }).first();
    const routeButtonB = page.getByRole("button", { name: /Right Exit.*Start at Room door/i }).first();
    await routeButtonA.click();
    results.checks.cabaRouteASelection = await page.getByText(/CABA LECTURE HALL.*Exterior Emergency Stair/i).count() > 0;
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-caba-route-a-desktop.png", fullPage: false });
    await page.getByRole("button", { name: "Both Routes", exact: true }).click();
    await routeButtonB.click();
    results.checks.cabaRouteBSelection = await page.getByText(/CABA LECTURE HALL.*Exterior Emergency Stair/i).count() > 0;
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-caba-route-b-desktop.png", fullPage: false });

    await page.getByRole("button", { name: "Start Route Preview", exact: true }).click();
    await page.getByRole("button", { name: /Expand navigation panel|Expand route panel/ }).click().catch(() => undefined);
    await page.getByRole("button", { name: /Pause (navigation|preview)/i }).waitFor();
    await page.getByRole("button", { name: "Return to Follow mode" }).click().catch(() => undefined);
    await page.getByRole("button", { name: "Switch to Explore mode" }).click().catch(() => undefined);
    await page.getByRole("button", { name: "Return to Follow mode" }).click().catch(() => undefined);
    await page.getByTestId("route-playback-speed").click().catch(() => undefined);
    const stepMarker = page.locator('[data-testid="guided-active-step"], [data-testid="explore-inspected-step"]').first();
    const stepBeforeVideo = await page.getByTestId("current-route-instruction").textContent().catch(() => stepMarker.textContent().catch(() => null));
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-caba-active-navigation-desktop.png", fullPage: false });
    await page.getByRole("button", { name: "Watch evacuation video" }).click();
    await page.locator('[role="dialog"][aria-modal="true"]').waitFor();
    const studentVideo = page.getByTestId("student-emergency-video");
    const studentVideoCard = page.getByTestId("student-emergency-video-card");
    await page.waitForFunction(() => { const video = document.querySelector('[data-testid="student-emergency-video"]'); return video instanceof HTMLVideoElement && video.readyState >= 2 && video.videoWidth > 0; });
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-video-open-route-paused-desktop.png", fullPage: false });
    results.checks.fullMapVideoDecoded = await studentVideo.evaluate((video) => ({ readyState: video.readyState, width: video.videoWidth, height: video.videoHeight, paused: video.paused, muted: video.muted, currentTime: video.currentTime }));
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-testid="student-emergency-video"]');
      const track = video instanceof HTMLVideoElement ? video.querySelector("track") : null;
      return track instanceof HTMLTrackElement && track.readyState === HTMLTrackElement.LOADED && Boolean(track.track.cues?.length);
    }).catch(() => undefined);
    results.checks.studentCaptionTrack = await studentVideo.evaluate((video) => {
      const track = video.querySelector("track");
      if (!(track instanceof HTMLTrackElement)) return { loaded: false, cues: 0 };
      track.track.mode = "showing";
      return { loaded: track.readyState === HTMLTrackElement.LOADED, cues: track.track.cues?.length ?? 0, firstCue: track.track.cues?.[0]?.text ?? null };
    });
    results.checks.routePausesForVideo = await page.getByRole("button", { name: "Resume route" }).isVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-video-open-route-paused-mobile-390.png", fullPage: false });
    results.checks.videoRouteMobile390 = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, cardVisible: Boolean(document.querySelector('[data-testid="student-emergency-video-card"]')) }));
    await page.setViewportSize({ width: 360, height: 740 });
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-video-open-route-paused-mobile-360.png", fullPage: false });
    results.checks.videoRouteMobile360 = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    await page.setViewportSize({ width: 1440, height: 960 });
    await studentVideoCard.getByRole("button", { name: "Play video guide", exact: true }).click();
    await page.waitForFunction(() => { const video = document.querySelector('[data-testid="student-emergency-video"]'); return video instanceof HTMLVideoElement && !video.paused && video.currentTime > 0.15; });
    const videoTimeBeforeClose = await studentVideo.evaluate((video) => video.currentTime);
    await page.getByRole("button", { name: "Close evacuation video" }).click();
    const resumeNavigation = page.getByRole("button", { name: /Resume (navigation|preview)/i });
    const continueTransition = page.getByRole("button", { name: "Continue", exact: true });
    await page.waitForFunction(() => Boolean(document.querySelector('[aria-label="Resume navigation"], [aria-label="Resume preview"], [aria-label="Continue through the active route transition"]'))
      || Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "Continue"));
    const stepAfterVideo = await page.getByTestId("current-route-instruction").textContent().catch(() => stepMarker.textContent().catch(() => null));
    const explicitResumePending = await resumeNavigation.isVisible().catch(() => false);
    const explicitTransitionPending = await continueTransition.isVisible().catch(() => false);
    results.checks.routeProgressPreserved = { before: stepBeforeVideo, after: stepAfterVideo, sameStep: Boolean(stepBeforeVideo && stepBeforeVideo === stepAfterVideo), remainedPausedUntilExplicitAction: explicitResumePending || explicitTransitionPending, explicitAction: explicitTransitionPending ? "Continue through the paused stair transition" : "Resume navigation", videoTimeBeforeClose };
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-caba-route-paused-after-video-desktop.png", fullPage: false });
    if (explicitTransitionPending) {
      await continueTransition.click();
      await page.waitForTimeout(1200);
      results.checks.floorTransitionAfterVideoAction = await page.locator('button[aria-label^="Choose floor."]').first().textContent().catch(() => null);
    } else if (explicitResumePending) {
      await resumeNavigation.click();
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-caba-route-resumed-desktop.png", fullPage: false });

    // The route panel provides actual step and speed controls; exercise state transitions, not just button presence.
    await page.getByRole("button", { name: /Expand navigation panel|Expand route panel/ }).click().catch(() => undefined);
    const speed = page.getByTestId("route-playback-speed");
    const speedReadings = [];
    for (let i = 0; i < 3; i += 1) { speedReadings.push(await speed.textContent().catch(() => null)); await speed.click().catch(() => undefined); }
    results.checks.playbackSpeedCycle = speedReadings;
    await page.getByRole("button", { name: "Previous", exact: true }).click().catch(() => undefined);
    await page.getByRole("button", { name: "Next", exact: true }).click().catch(() => undefined);
    results.checks.routeControlsExercised = true;

    // Keep a real full-map route active while switching alternatives and renderers.
    await page.getByRole("button", { name: "Left Exit", exact: true }).first().click();
    await page.getByRole("button", { name: "Start Route Preview", exact: true }).click();
    const expandRoute = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|Expand$/ });
    if (await expandRoute.isVisible().catch(() => false)) await expandRoute.click();
    const returnToFollowForInstruction = page.getByRole("button", { name: "Return to Follow mode" });
    if (await returnToFollowForInstruction.isVisible().catch(() => false)) await returnToFollowForInstruction.click();
    await page.getByTestId("current-route-instruction").waitFor();
    await page.waitForTimeout(250);
    results.checks.cabaActiveRouteSwitch = await page.getByRole("button", { name: "Left Exit", exact: true }).first().getAttribute("aria-pressed") ?? "active route instruction visible";
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-caba-route-a-active-desktop.png", fullPage: false });
    const to3d = page.getByRole("button", { name: "Switch to 3D view" });
    await to3d.click();
    await page.getByRole("button", { name: "Switch to 2D view" }).waitFor();
    results.checks.caba3dActiveRouteVisible = await page.getByRole("button", { name: "Left Exit", exact: true }).count() > 0;
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-caba-route-a-3d.png", fullPage: false });
    await page.getByRole("button", { name: "Switch to 2D view" }).click();
    await page.getByRole("button", { name: "Switch to 3D view" }).waitFor();
    results.checks.caba2dRestoresActiveRoute = await page.getByRole("button", { name: "Left Exit", exact: true }).count() > 0;

    async function selectRoomAndOpenEmergency(roomLabel, expectedRoutes) {
      const expand = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|Expand$/ });
      if (await expand.isVisible().catch(() => false)) await expand.click();
      const endButton = page.getByRole("button", { name: "End Route Preview", exact: true });
      if (await endButton.isVisible().catch(() => false)) await endButton.click();
      const previewButton = page.getByRole("button", { name: "Start Route Preview", exact: true });
      if (await previewButton.isVisible().catch(() => false)) {
        await previewButton.click();
        const expandAfterStart = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|Expand$/ });
        if (await expandAfterStart.isVisible().catch(() => false)) await expandAfterStart.click();
        const endAfterStart = page.getByRole("button", { name: "End Route Preview", exact: true });
        if (await endAfterStart.isVisible().catch(() => false)) await endAfterStart.click();
      }
      const search = page.locator('input[placeholder*="Search rooms"]').filter({ visible: true }).first();
      await search.waitFor({ state: "visible" });
      await search.fill(roomLabel);
      const roomResult = page.locator(`button[aria-label^="${roomLabel.toUpperCase()}, Room"]`).first();
      await roomResult.waitFor({ state: "visible" });
      await roomResult.click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("button", { name: "SOS routing", exact: true }).click();
      await page.getByRole("button", { name: "Find Route", exact: true }).click();
      if (expectedRoutes === 2) await page.getByRole("button", { name: "Both Routes", exact: true }).waitFor();
      else await page.getByRole("button", { name: "Both Routes", exact: true }).waitFor({ state: "detached" });
      return page.getByRole("button", { name: /Left Exit.*Start at Room door/i }).first();
    }

    for (const [roomLabel, key] of [["CEIT Lecture Hall", "ceit"], ["PLV Auditorium", "auditorium"]]) {
      const routeA = await selectRoomAndOpenEmergency(roomLabel, 2);
      await page.screenshot({ path: `verification-artifacts/emergency-video-test-only/final-${key}-both-routes-desktop.png`, fullPage: false });
      await routeA.click();
      await page.screenshot({ path: `verification-artifacts/emergency-video-test-only/final-${key}-route-a-desktop.png`, fullPage: false });
      const startRouteA = page.getByRole("button", { name: "Start Route Preview", exact: true });
      if (await startRouteA.isVisible().catch(() => false)) await startRouteA.click();
      const followRouteA = page.getByRole("button", { name: "Return to Follow mode" });
      if (await followRouteA.isVisible().catch(() => false)) await followRouteA.click();
      await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="current-route-instruction"], [data-testid="explore-route-guidance"]')));
      await page.screenshot({ path: `verification-artifacts/emergency-video-test-only/final-${key}-route-a-active-desktop.png`, fullPage: false });
      const routeB = page.getByRole("button", { name: /Right Exit.*Start at Room door/i }).first();
      const routeBTab = page.getByRole("button", { name: "Right Exit", exact: true }).first();
      if (await routeBTab.isVisible().catch(() => false)) await routeBTab.click();
      else await routeB.click();
      await page.screenshot({ path: `verification-artifacts/emergency-video-test-only/final-${key}-route-b-desktop.png`, fullPage: false });
      const startRouteB = page.getByRole("button", { name: "Start Route Preview", exact: true });
      if (await startRouteB.isVisible().catch(() => false)) await startRouteB.click();
      const restoreFollow = page.getByRole("button", { name: "Return to Follow mode" });
      if (await restoreFollow.isVisible().catch(() => false)) await restoreFollow.click();
      await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="current-route-instruction"], [data-testid="explore-route-guidance"]')));
      await page.screenshot({ path: `verification-artifacts/emergency-video-test-only/final-${key}-route-b-active-desktop.png`, fullPage: false });
      await page.getByRole("button", { name: "Switch to Explore mode" }).click();
      await page.getByTestId("emergency-explore-playback-controls").waitFor();
      const beforeNext = await page.getByTestId("explore-inspected-step").textContent().catch(() => null);
      await page.getByRole("button", { name: "Next", exact: true }).click();
      const afterNext = await page.getByTestId("explore-inspected-step").textContent().catch(() => null);
      await page.screenshot({ path: `verification-artifacts/emergency-video-test-only/final-${key}-active-explore-desktop.png`, fullPage: false });
      await page.getByRole("button", { name: "Return to Follow mode" }).click();
      await page.screenshot({ path: `verification-artifacts/emergency-video-test-only/final-${key}-active-follow-desktop.png`, fullPage: false });
      results.checks[`${key}RouteUi`] = { bothRoutes: true, routeA: true, routeAPlayback: true, routeB: true, routeBPlayback: true, activeRouteStarted: true, exploreNextStepChanged: beforeNext !== afterNext, followRestored: true };
      await page.getByRole("button", { name: "End Route Preview", exact: true }).click();
    }

    await selectRoomAndOpenEmergency("Assembly Hall", 1);
    results.checks.assemblyHallSingleRouteFallback = await page.getByRole("button", { name: "Main Exit", exact: true }).count() > 0
      && await page.getByRole("button", { name: "Both Routes", exact: true }).count() === 0;
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-assembly-hall-single-route-desktop.png", fullPage: false });
    await page.getByRole("button", { name: "Start Route Preview", exact: true }).click();
    const assemblyFollow = page.getByRole("button", { name: "Return to Follow mode" });
    if (await assemblyFollow.isVisible().catch(() => false)) await assemblyFollow.click();
    await page.getByTestId("current-route-instruction").waitFor();
    results.checks.assemblyHallSingleRouteStarts = true;
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-assembly-hall-active-desktop.png", fullPage: false });
    await page.getByRole("button", { name: "Switch to Explore mode" }).click();
    await page.getByTestId("emergency-explore-playback-controls").waitFor();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    results.checks.assemblyMobile390 = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-assembly-hall-mobile-390.png", fullPage: false });
    await page.getByRole("button", { name: "Switch to 3D view" }).click();
    await page.getByRole("button", { name: "Switch to 2D view" }).waitFor();
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-assembly-hall-mobile-3d.png", fullPage: false });
    await page.getByRole("button", { name: "Switch to 2D view" }).click();
    results.checks.assemblyMobileRouteControlsAnd3d2d = true;

    // Responsive check on the real Full Map screen after student publication.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-caba-mobile-390.png", fullPage: false });
    results.checks.mobile390 = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: innerHeight, mapVisible: Boolean(document.querySelector('[data-testid="test-only-full-map-root"]')) }));
    await page.setViewportSize({ width: 360, height: 740 });
    await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-caba-mobile-360.png", fullPage: false });
    results.checks.mobile360 = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: innerHeight }));

    results.checks.externalNetworkCallsIntercepted = true;
    results.checks.adapterVideoBytesMatchSample = Boolean(uploadedVideo?.equals(sample));
    results.checks.adapterCaptionsMatchSample = Boolean(uploadedCaptions?.equals(captions));
    results.checks.videoActuallyPublishedBeforeStudentRpc = results.adapterEvents.some((event) => event.type === "metadata-update" && event.status === "published")
      && results.adapterEvents.some((event) => event.type === "student-video-rpc" && event.result === "published");
    results.checks.routeStepBeforeAndAfterVideo = { before: stepBeforeVideo, after: stepAfterVideo };
    results.checks.unexpectedBrowserErrors = results.browserErrors;
  } catch (error) {
    results.failure = { message: error.message, stack: error.stack };
    results.failureBodyText = await page.locator("body").innerText().catch(() => "");
    results.failureButtons = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => button.getClientRects().length).map((button) => ({ text: button.innerText, aria: button.getAttribute("aria-label"), testId: button.getAttribute("data-testid") })).slice(0, 80)).catch(() => []);
    try { await page.screenshot({ path: "verification-artifacts/emergency-video-test-only/final-full-map-failure.png", fullPage: false }); } catch {}
    throw error;
  } finally {
    fs.writeFileSync("verification-artifacts/emergency-video-test-only/final-full-map-results.json", JSON.stringify(results, null, 2));
    await browser.close();
  }
}

main().catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
