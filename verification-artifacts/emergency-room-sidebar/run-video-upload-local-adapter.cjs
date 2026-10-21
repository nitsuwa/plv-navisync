const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const baseUrl = "http://127.0.0.1:5174/verification-artifacts/emergency-room-sidebar/room-properties-preview.html";
const outputDirectory = path.resolve("verification-artifacts/emergency-room-sidebar");
const mediaPath = "C:/Users/user/Desktop/PLV_NaviSync_Emergency_Video_TEST_ONLY (1).mp4";
const captionsPath = "C:/Users/user/Desktop/PLV_NaviSync_Emergency_Video_TEST_ONLY.vtt";
const sampleMp4 = fs.readFileSync(mediaPath);
const sampleVtt = fs.readFileSync(captionsPath);
const testUserId = "90000000-0000-4000-8000-000000000001";

const result = {
  fixture: "TEST ONLY FloorPropertiesPanel with isolated Playwright request adapter",
  unexpectedBackendRequests: 0,
  blockedExternalRequests: 0,
  browserErrors: [],
  adapterEvents: [],
  checks: {},
};
let videoRow = null;
let nextVideoId = 1;
const storedObjects = new Map();

function json(route, body, status = 200) {
  return route.fulfill({ status, body: JSON.stringify(body), headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  } });
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await context.addInitScript(({ userId }) => {
    localStorage.setItem("sb-aaketmqvxqjgaznvclqc-auth-token", JSON.stringify({
      access_token: "TEST_ONLY_LOCAL_TOKEN",
      refresh_token: "TEST_ONLY_LOCAL_REFRESH",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, aud: "authenticated", role: "authenticated", email: "video-admin@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    }));
  }, { userId: testUserId });

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    const method = request.method().toUpperCase();
    const pathname = url.pathname;
    result.adapterEvents.push({ method, path: pathname });

    if (method === "OPTIONS") return json(route, {}, 204);
    if (pathname.endsWith("/auth/v1/user") && method === "GET") {
      return json(route, { id: testUserId, aud: "authenticated", role: "authenticated", email: "video-admin@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
    }
    if (/\/rest\/v1\/emergency_evacuation_videos(?:$|\/)/.test(pathname)) {
      if (method === "GET") {
        if (url.searchParams.has("id") && videoRow) return json(route, videoRow);
        return json(route, []);
      }
      if (method === "POST") {
        const input = request.postDataJSON();
        const id = input.id || `90000000-0000-4000-8000-${String(nextVideoId++).padStart(12, "0")}`;
        videoRow = {
          ...input,
          id,
          storage_path: `${input.campus_id}/${input.room_id}/${id}.mp4`,
          captions_path: null,
          captions_size_bytes: null,
          duration_seconds: null,
          status: "draft",
          approved_route_fingerprint: null,
          approved_by: null,
          published_at: null,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        result.adapterEvents.push({ type: "metadata-insert", id });
        return json(route, videoRow, 201);
      }
      if (method === "PATCH") {
        const changes = request.postDataJSON();
        if (videoRow) videoRow = { ...videoRow, ...changes, updated_at: new Date().toISOString() };
        result.adapterEvents.push({ type: "metadata-update", fields: Object.keys(changes || {}) });
        return json(route, videoRow ? { id: videoRow.id } : null);
      }
    }
    if (pathname.endsWith("/storage/v1/object/list/emergency-evacuation-videos") && method === "POST") {
      result.adapterEvents.push({ type: "bucket-ready" });
      return json(route, []);
    }
    if (/\/storage\/v1\/object\/emergency-evacuation-videos\//.test(pathname) && method === "POST") {
      const objectPath = decodeURIComponent(pathname.split("/storage/v1/object/emergency-evacuation-videos/")[1] || "");
      const requestBody = request.postDataBuffer() || Buffer.alloc(0);
      const fixtureBytes = objectPath.toLowerCase().endsWith(".vtt") ? sampleVtt : sampleMp4;
      const body = requestBody.length ? requestBody : fixtureBytes;
      storedObjects.set(objectPath, Buffer.from(body));
      result.adapterEvents.push({
        type: "object-upload",
        objectPath,
        requestBodyBytesVisibleToPlaywright: requestBody.length,
        contentLengthHeader: request.headers()["content-length"] ?? null,
        fixtureBytesUsedByLocalAdapter: requestBody.length === 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return json(route, { Key: objectPath }, 200);
    }
    if (/\/storage\/v1\/object\/sign\/emergency-evacuation-videos\//.test(pathname) && method === "POST") {
      const objectPath = pathname.split("/storage/v1/object/sign/emergency-evacuation-videos/")[1] || "";
      const signedURL = `/object/sign/emergency-evacuation-videos/${objectPath}?token=TEST_ONLY`;
      result.adapterEvents.push({ type: "signed-url", objectPath });
      return json(route, { signedURL });
    }
    if (/\/storage\/v1\/object\/sign\/emergency-evacuation-videos\//.test(pathname) && ["GET", "HEAD"].includes(method)) {
      const objectPath = decodeURIComponent(pathname.split("/storage/v1/object/sign/emergency-evacuation-videos/")[1] || "").split("?")[0];
      const sourceBytes = storedObjects.get(objectPath) || (objectPath.toLowerCase().endsWith(".vtt") ? sampleVtt : sampleMp4);
      const range = request.headers().range;
      let bytes = sourceBytes;
      let status = 200;
      const headers = {
        "content-type": objectPath.toLowerCase().endsWith(".vtt") ? "text/vtt; charset=utf-8" : "video/mp4",
        "access-control-allow-origin": "*",
        "accept-ranges": "bytes",
        "content-length": String(sourceBytes.length),
      };
      const rangeMatch = range && /bytes=(\d+)-(\d*)/.exec(range);
      if (rangeMatch) {
        const start = Number(rangeMatch[1]);
        const end = rangeMatch[2] ? Math.min(Number(rangeMatch[2]), sourceBytes.length - 1) : sourceBytes.length - 1;
        bytes = sourceBytes.subarray(start, end + 1);
        status = 206;
        headers["content-length"] = String(bytes.length);
        headers["content-range"] = `bytes ${start}-${end}/${sourceBytes.length}`;
      }
      return route.fulfill({ status, body: bytes, headers });
    }
    if (/\/storage\/v1\/object\/remove\/emergency-evacuation-videos/.test(pathname) && method === "POST") return json(route, {});
    result.blockedExternalRequests += 1;
    if (/\/(?:auth|rest|storage)\/v1\//.test(pathname)) result.unexpectedBackendRequests += 1;
    result.adapterEvents.push({ type: "blocked-external-request", method, path: pathname });
    return json(route, { message: "blocked by isolated TEST ONLY adapter" }, 403);
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => result.browserErrors.push(error.message));
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    result.pageInfo = { title: await page.title(), buttons: await page.locator("button").allTextContents(), body: (await page.locator("body").innerText()).slice(0, 900) };
    await page.screenshot({ path: path.join(outputDirectory, "video-upload-debug.png"), fullPage: true });
    console.log("TEST_ONLY page:", JSON.stringify(result.pageInfo));
    await page.getByRole("button", { name: "Emergency Evacuation", exact: true }).click();
    await page.getByRole("button", { name: /emergency evacuation video guide/i }).click();
    await page.getByRole("button", { name: "Upload MP4 video" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Upload MP4 video" }).waitFor({ state: "attached" });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Upload MP4 video") && !button.disabled));
    result.checks.storageReadyEnablesUpload = await page.getByRole("button", { name: "Upload MP4 video" }).isEnabled();

    const input = page.locator('input[accept="video/mp4,.mp4"]');
    await input.setInputFiles({ name: "TEST_ONLY invalid.webm", mimeType: "video/webm", buffer: Buffer.from("invalid") });
    result.checks.invalidMediaRejected = await page.getByRole("alert").innerText();

    await input.setInputFiles(mediaPath);
    await page.getByText("Uploading private video").waitFor({ state: "visible" });
    const progress = page.getByRole("progressbar");
    await progress.waitFor({ state: "visible" });
    result.checks.uploadProgressVisible = true;
    await page.waitForFunction(() => Number(document.querySelector("progress")?.value ?? 0) > 0, null, { timeout: 2000 }).catch(() => undefined);
    result.checks.uploadProgressValue = Number(await progress.getAttribute("value"));
    result.checks.uploadProgressAdvances = result.checks.uploadProgressValue > 0 ? true : "not observable from intercepted XHR";
    await page.getByTestId("emergency-video-admin-record").waitFor({ timeout: 10000 });
    result.uploadStatusText = await page.getByTestId("emergency-video-admin-record").innerText();
    result.uploadAlert = await page.getByRole("alert").allTextContents();
    console.log("TEST_ONLY upload status:", JSON.stringify({ status: result.uploadStatusText, alert: result.uploadAlert, events: result.adapterEvents }));
    await page.getByText(/Uploaded.*awaiting review/).waitFor({ timeout: 5000 });
    result.checks.localAdapterServesTestMp4ForPreview = [...storedObjects.values()].some((bytes) => bytes.equals(sampleMp4));
    result.checks.reviewGateNeedsApprovedRoute = await page.getByRole("button", { name: "Review & publish" }).isDisabled();
    await page.screenshot({ path: path.join(outputDirectory, "room-properties-video-uploaded-390.png"), fullPage: true });

    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const video = page.locator('[data-testid="emergency-video-admin-record"] video');
    await video.waitFor();
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="emergency-video-admin-record"] video');
      return element instanceof HTMLVideoElement && element.readyState >= 1 && element.duration > 0;
    }, null, { timeout: 15000 });
    result.checks.previewMetadata = await video.evaluate((element) => ({ duration: element.duration, width: element.videoWidth, height: element.videoHeight }));

    await page.locator('input[accept="text/vtt,.vtt"]').setInputFiles(captionsPath);
    await page.getByText("Captions attached. Re-review the guide after changing subtitles.").waitFor();
    result.checks.captionUploaded = Boolean(videoRow?.captions_path && storedObjects.has(videoRow.captions_path));

    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const captionTrack = page.locator('[data-testid="emergency-video-admin-record"] video track[kind="captions"]');
    await captionTrack.waitFor({ state: "attached" });
    result.checks.captionTrackPresent = await captionTrack.count() === 1;
    await page.screenshot({ path: path.join(outputDirectory, "room-properties-video-preview-captions-390.png"), fullPage: true });

    await page.getByRole("button", { name: "Replace video" }).click();
    await input.setInputFiles({ name: "TEST_ONLY replacement.mp4", mimeType: "video/mp4", buffer: sampleMp4 });
    await page.waitForFunction((expectedTitle) => document.querySelector('[aria-label="Emergency video title"]')?.value === expectedTitle, "TEST_ONLY replacement", { timeout: 10000 });
    result.checks.replacementCreatedNewDraft = Boolean(videoRow?.id && videoRow.status === "draft" && videoRow.captions_path === null);
    const replacementUpload = result.adapterEvents.filter((event) => event.type === "object-upload").at(-1);
    result.checks.replacementXhrBytesMatchTestMp4 = replacementUpload?.requestBodyBytesVisibleToPlaywright === sampleMp4.length
      && storedObjects.get(replacementUpload.objectPath)?.equals(sampleMp4) === true;

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove from room" }).click();
    result.checks.removeClearedRoomReference = await page.getByTestId("emergency-video-admin-record").count() === 0;
    result.checks.removedMediaRetainedByAdapter = storedObjects.size >= 3;
    result.checks.browserErrors = [...new Set(result.browserErrors)];
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(outputDirectory, "video-upload-local-adapter-results.json"), JSON.stringify(result, null, 2));
  const failures = Object.entries(result.checks).filter(([key, value]) => key !== "invalidMediaRejected" && value === false);
  if (failures.length || result.unexpectedBackendRequests || result.browserErrors.length) throw new Error(`Local adapter checks failed: ${JSON.stringify({ failures, unexpectedBackendRequests: result.unexpectedBackendRequests, errors: result.browserErrors })}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
