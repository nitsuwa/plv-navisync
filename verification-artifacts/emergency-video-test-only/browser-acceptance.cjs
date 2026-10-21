// Test-only browser harness for the real PLV NaviSync Admin and Student components.
// All Supabase-shaped requests are intercepted locally; no network mutation occurs.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { chromium } = require(path.join(process.env.TEMP, "plv-video-acceptance", "node_modules", "playwright"));

const base = "http://127.0.0.1:5173/";
const artifactDir = path.join(process.cwd(), "verification-artifacts", "emergency-video-test-only");
const mp4 = fs.readFileSync("C:\\Users\\user\\Desktop\\PLV_NaviSync_Emergency_Video_TEST_ONLY (1).mp4");
const vtt = fs.readFileSync("C:\\Users\\user\\Desktop\\PLV_NaviSync_Emergency_Video_TEST_ONLY.vtt");
fs.mkdirSync(artifactDir, { recursive: true });

const rows = new Map();
const objects = new Map();
const events = [];
let signedId = 0;

function respond(route, value, status = 200, headers = {}) {
  return route.fulfill({ status, body: JSON.stringify(value), headers: {
    "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...headers,
  } });
}

function objectPath(pathname, marker) {
  return pathname.slice(pathname.indexOf(marker) + marker.length).split("/").map(decodeURIComponent).join("/");
}

function makeCampus() {
  const room = { id: "TEST_ONLY_ROOM", name: "TEST ONLY · Demo Lecture Hall", type: "classroom", x: 20, y: 20, w: 60, h: 40, buildingId: "TEST_ONLY_BUILDING", floorId: "TEST_ONLY_FLOOR" };
  const floor = { id: room.floorId, buildingId: room.buildingId, number: 2, label: "TEST ONLY Floor 2", rooms: [room] };
  const building = { id: room.buildingId, name: "TEST ONLY Demo Building", code: "TEST", floors: [floor] };
  return { campus: { id: "TEST_ONLY_CAMPUS", name: "TEST ONLY Campus", buildings: [building] }, building, floor, room };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  await context.addInitScript(() => {
    localStorage.setItem("sb-aaketmqvxqjgaznvclqc-auth-token", JSON.stringify({
      access_token: "TEST_ONLY_LOCAL_BROWSER_TOKEN", refresh_token: "TEST_ONLY_LOCAL_BROWSER_REFRESH",
      token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "TEST_ONLY_ADMIN", aud: "authenticated", role: "authenticated", email: "test-admin@example.invalid", app_metadata: {}, user_metadata: {} },
    }));
  });

  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method().toUpperCase();
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();

    if (/\/auth\/v1\/user$/.test(p)) return respond(route, {
      id: "TEST_ONLY_ADMIN", aud: "authenticated", role: "authenticated", email: "test-admin@example.invalid",
      app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
    });

    if (p.includes("/rest/v1/rpc/get_published_emergency_evacuation_video")) {
      const id = String(req.postDataJSON()?.p_video_id);
      const row = rows.get(id);
      events.push({ type: "student-publication-rpc", published: row?.status === "published" });
      return respond(route, row?.status === "published" ? row : null);
    }

    if (/\/rest\/v1\/emergency_evacuation_videos$/.test(p)) {
      const idMatch = url.searchParams.get("id")?.match(/^eq\.(.*)$/);
      const id = idMatch ? decodeURIComponent(idMatch[1]) : null;
      if (method === "GET") return respond(route, id && rows.has(id) ? [structuredClone(rows.get(id))] : [], 200, { "content-range": id && rows.has(id) ? "0-0/1" : "*/0" });
      if (method === "POST") {
        const body = req.postDataJSON() || {};
        const row = { ...body, status: "draft", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), approved_route_fingerprint: null, approved_by: null, published_at: null };
        rows.set(String(row.id), row);
        events.push({ type: "metadata-insert", roomId: row.room_id, campusId: row.campus_id });
        return respond(route, (req.headers().accept || "").includes("application/vnd.pgrst.object+json") ? row : [row], 201, { "content-range": "0-0/1" });
      }
      if (method === "PATCH") {
        const row = id && rows.get(id);
        if (!row) return respond(route, [], 200, { "content-range": "*/0" });
        Object.assign(row, req.postDataJSON() || {}, { updated_at: new Date().toISOString() });
        const fields = (url.searchParams.get("select") || "*").split(",");
        const projection = fields.includes("*") ? row : Object.fromEntries(fields.map((key) => [key, row[key]]));
        events.push({ type: "metadata-update", status: row.status, fields });
        return respond(route, [projection], 200, { "content-range": "0-0/1" });
      }
      return respond(route, { message: "TEST ONLY unsupported method" }, 405);
    }

    if (/\/storage\/v1\/object\/emergency-evacuation-videos\//.test(p) && method === "POST") {
      const key = objectPath(p, "/storage/v1/object/emergency-evacuation-videos/");
      const data = req.postDataBuffer() || Buffer.alloc(0);
      objects.set(key, Buffer.from(data));
      events.push({ type: "object-upload", bytes: data.length, mime: req.headers()["content-type"] });
      await new Promise((resolve) => setTimeout(resolve, 350));
      return respond(route, { Key: "emergency-evacuation-videos/" + key });
    }

    if (/\/storage\/v1\/object\/sign\/emergency-evacuation-videos\//.test(p) && method === "POST") {
      const key = objectPath(p, "/storage/v1/object/sign/emergency-evacuation-videos/");
      if (!objects.has(key)) return respond(route, { message: "TEST ONLY object missing" }, 404);
      events.push({ type: "signed-url", object: key, ttl: req.postDataJSON()?.expiresIn ?? null });
      return respond(route, { signedURL: "/object/sign/emergency-evacuation-videos/" + key.split("/").map(encodeURIComponent).join("/") + "?token=local-test-" + (++signedId) });
    }

    if (/\/storage\/v1\/object\/sign\/emergency-evacuation-videos\//.test(p) && method === "GET") {
      const key = objectPath(p, "/storage/v1/object/sign/emergency-evacuation-videos/");
      const data = objects.get(key);
      events.push({ type: "media-get", object: key, range: req.headers().range ?? null, found: Boolean(data) });
      if (!data) return route.fulfill({ status: 404, body: "TEST ONLY media missing", headers: { "content-type": "text/plain", "access-control-allow-origin": "*" } });
      const caption = key.toLowerCase().endsWith(".vtt");
      const headers = {
        "content-type": caption ? "text/vtt; charset=utf-8" : "video/mp4", "accept-ranges": "bytes",
        "access-control-allow-origin": "*", "access-control-expose-headers": "content-length, content-range, accept-ranges, content-type, content-disposition",
        "cache-control": "private, no-store",
      };
      const downloadName = url.searchParams.get("download");
      if (downloadName) headers["content-disposition"] = "attachment; filename*=UTF-8''" + encodeURIComponent(downloadName);
      const range = req.headers().range;
      if (!caption && range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        const start = match ? Number(match[1]) : 0;
        const end = Math.min(match?.[2] ? Number(match[2]) : data.length - 1, data.length - 1);
        const chunk = data.subarray(start, end + 1);
        return route.fulfill({ status: 206, body: chunk, headers: { ...headers, "content-length": String(chunk.length), "content-range": "bytes " + start + "-" + end + "/" + data.length } });
      }
      return route.fulfill({ status: 200, body: data, headers: { ...headers, "content-length": String(data.length) } });
    }

    if (p.startsWith("/rest/v1/") && method === "GET") return respond(route, [], 200, { "content-range": "*/0" });
    events.push({ type: "blocked-external-request", method, path: p });
    return route.abort("blockedbyclient");
  });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  const fixture = makeCampus();
  const fingerprint = JSON.stringify([["TEST_ONLY_ROUTE_A", "TEST_ONLY_DOOR", "TEST_ONLY_EXIT", "TEST_ONLY_DEST", "TEST_ONLY_SIGNATURE"]]);
  const initialConfiguration = { enabled: true, routes: [], videoGuide: { enabled: true, title: "TEST ONLY · Sample evacuation video guide" } };

  async function mount() {
    await page.evaluate(async ({ fixture, fingerprint, initialConfiguration }) => {
      const [R, D, A, S, O] = await Promise.all([
        import("/node_modules/.vite/deps/react.js"), import("/node_modules/.vite/deps/react-dom_client.js"),
        import("/src/components/map-builder/EmergencyEvacuationVideoAdminSection.tsx"),
        import("/src/components/map/StudentSelectedPlaceCard.tsx"),
        import("/src/components/map/StudentEmergencyVideoOverlay.tsx"),
      ]);
      const React = R.default;
      const h = React.createElement;
      const { useState } = React;
      const host = document.getElementById("__plv-video-acceptance") || document.createElement("div");
      host.id = "__plv-video-acceptance";
      host.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:none";
      if (!host.isConnected) document.body.append(host);
      window.__plvVideoTestModules = { Admin: A.EmergencyEvacuationVideoAdminSection, Student: S.StudentSelectedPlaceCard, Overlay: O.StudentEmergencyVideoOverlay };
      if (window.__plvVideoTestRoot) window.__plvVideoTestRoot.unmount();
      function Harness() {
        const saved = (() => { try { return JSON.parse(localStorage.getItem("plv-video-test-only-room-config") || "null") || initialConfiguration; } catch { return initialConfiguration; } })();
        const [configuration, setConfiguration] = useState(saved);
        const [tab, setTab] = useState("admin");
        const [emergency, setEmergency] = useState(false);
        const [overlay, setOverlay] = useState(false);
        const [playback, setPlayback] = useState({ currentTime: 0, muted: true, loop: true });
        const update = (next) => { setConfiguration(next); localStorage.setItem("plv-video-test-only-room-config", JSON.stringify(next)); };
        const studentGuide = configuration.videoGuide?.videoId ? { ...configuration.videoGuide, enabled: true, reviewStatus: "approved", reviewedRouteFingerprint: fingerprint } : undefined;
        const studentCard = h(window.__plvVideoTestModules.Student, {
          room: { type: "room", buildingId: fixture.building.id, floorNumber: 2, roomId: fixture.room.id, roomName: fixture.room.name, buildingLabel: fixture.building.name, buildingCode: "TEST", floorLabel: fixture.floor.label },
          campusId: fixture.campus.id, floorId: fixture.floor.id, description: "TEST ONLY isolated browser fixture",
          emergencyVideoGuide: studentGuide, emergencyVideoRouteFingerprint: fingerprint, emergencyMode: emergency,
          emergencyVideoPlaybackState: playback, emergencyVideoAutoplayEnabled: !emergency && !overlay,
          onEmergencyVideoPlaybackStateChange: setPlayback, onWatchEmergencyVideo: () => setOverlay(true),
          onDirections: () => {}, onStartHere: () => {}, onReport: () => {}, onClose: () => {},
        });
        return h("div", { style: { position: "absolute", inset: 0, overflow: "auto", pointerEvents: "auto", background: "rgba(248,250,252,.95)", color: "#0f172a", padding: 16 } },
          h("header", { className: "mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm" },
            h("div", { className: "mr-auto" }, h("div", { className: "text-sm font-extrabold" }, "PLV NaviSync · Emergency Video Acceptance"), h("div", { className: "text-[10px] text-muted-foreground" }, "TEST ONLY · local adapter · production network blocked")),
            h("button", { className: "rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground", onClick: () => setTab("admin") }, "Admin Test"),
            h("button", { className: "rounded-lg border px-3 py-2 text-xs font-bold", onClick: () => setTab("student") }, "Student Preview Test"),
            h("button", { className: "rounded-lg border px-3 py-2 text-xs font-bold", onClick: () => localStorage.setItem("plv-video-test-only-room-config", JSON.stringify(configuration)) }, "Save TEST config")
          ),
          h("main", { className: "mx-auto grid max-w-5xl grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]" },
            h("section", { className: "rounded-2xl border border-border bg-card p-4 shadow-sm", style: { pointerEvents: "auto" } },
              tab === "admin" ? h("div", null, h("h2", { className: "mb-2 text-sm font-extrabold" }, "Admin · TEST ONLY Demo Lecture Hall"), h(window.__plvVideoTestModules.Admin, { campus: fixture.campus, buildingId: fixture.building.id, floorId: fixture.floor.id, room: fixture.room, configuration, onChange: update }))
                : h("div", null, h("h2", { className: "mb-2 text-sm font-extrabold" }, "Student selected room · TEST ONLY"), h("div", { className: "mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900" }, "Isolated test publication; not real evacuation guidance."), h("div", { className: "mb-2 flex gap-2" }, h("button", { className: "rounded border px-2 py-1 text-xs", onClick: () => setEmergency(true) }, "Enter Emergency Mode"), h("button", { className: "rounded border px-2 py-1 text-xs", onClick: () => setEmergency(false) }, "Exit Emergency Mode")), studentCard)
            ),
            h("aside", { className: "rounded-2xl border border-border bg-card p-4 shadow-sm", style: { pointerEvents: "auto" } }, h("h2", { className: "text-sm font-extrabold" }, "TEST ONLY adapter status"), h("p", { className: "mt-2 text-xs text-muted-foreground" }, "No real campus map changes. Admin upload/metadata, signed media, and Student RPC are intercepted by this test page."))
          ),
          overlay && studentGuide ? h(window.__plvVideoTestModules.Overlay, { campusId: fixture.campus.id, roomId: fixture.room.id, roomName: fixture.room.name, videoId: studentGuide.videoId, title: studentGuide.title, routeFingerprint: fingerprint, playbackState: playback, routePaused: true, hasActiveRoute: false, onPlaybackStateChange: setPlayback, onClose: () => setOverlay(false), onResumeRoute: () => setOverlay(false) }) : null
        );
      }
      const root = D.default.createRoot(host);
      window.__plvVideoTestRoot = root;
      root.render(h(Harness));
    }, { fixture, fingerprint, initialConfiguration });
  }

  const result = { browser: "Chromium headless against local Vite app", network: "all external requests blocked or handled by in-memory test adapter", fixture: "TEST ONLY", results: {}, filesChangedByTest: [] };
  try {
    await mount();
    await page.getByRole("button", { name: "Emergency Evacuation Video Guide" }).click();
    await page.locator('#__plv-video-acceptance input[accept="video/mp4,.mp4"]').setInputFiles({ name: "PLV_NaviSync_Emergency_Video_TEST_ONLY.mp4", mimeType: "video/mp4", buffer: mp4 });
    await page.getByText("Uploading private video").waitFor({ state: "visible", timeout: 5000 });
    await page.getByTestId("emergency-video-admin-record").waitFor({ state: "visible", timeout: 10000 });
    const row = [...rows.values()][0];
    assert(row && objects.get(row.storage_path).compare(mp4) === 0);
    result.results.adminUpload = "PASS — actual Admin component upload/progress/metadata flow; exact MP4 bytes stored only in local test adapter.";
    await page.locator('#__plv-video-acceptance input[accept="text/vtt,.vtt"]').setInputFiles({ name: "PLV_NaviSync_Emergency_Video_TEST_ONLY.vtt", mimeType: "text/vtt", buffer: vtt });
    await page.getByText("Captions attached. Re-review the guide after changing subtitles.").waitFor({ state: "visible", timeout: 8000 });
    result.results.captionUpload = "PASS — attached supplied VTT via real Admin component.";

    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.waitForFunction(() => { const v = document.querySelector('#__plv-video-acceptance video'); return v && v.readyState >= 1 && Number.isFinite(v.duration) && v.duration > 0; }, { timeout: 15000 });
    const adminMeta = await page.locator('#__plv-video-acceptance video').evaluate((v) => ({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, ready: v.readyState, tracks: v.textTracks.length }));
    assert(adminMeta.width > 0 && adminMeta.height > 0);
    result.results.adminPreview = "PASS — browser decoded sample in actual Admin preview " + adminMeta.width + "×" + adminMeta.height + " (" + adminMeta.duration.toFixed(2) + "s).";
    result.results.adminApprovalInBrowser = "NOT VERIFIED — preview UI is browser-tested; publishing requires current approved route fingerprints. Existing isolated integration tests cover approval/publication with mocked service boundary.";
    result.results.adminReviewGate = await page.getByRole("button", { name: /review & publish/i }).isDisabled()
      ? "PASS — publishing is blocked while the test room has no current Admin-approved route fingerprint."
      : "FAIL — publish control was enabled without a current approved route fingerprint.";

    // Model a published TEST ONLY map snapshot after the Admin-only preview. The UI component and secure-read service still run normally.
    const routeFingerprint = JSON.stringify([["TEST_ONLY_ROUTE_A", "TEST_ONLY_DOOR", "TEST_ONLY_EXIT", "TEST_ONLY_DEST", "TEST_ONLY_SIGNATURE"]]);
    row.status = "published";
    row.approved_route_fingerprint = JSON.parse(routeFingerprint);
    row.approved_by = "TEST_ONLY_ADMIN";
    row.published_at = new Date().toISOString();
    row.updated_at = new Date().toISOString();
    result.results.testPublication = "SIMULATED — Node test adapter seeded a published metadata row; no campus map or real publication was written.";

    await page.getByRole("button", { name: "Save TEST config" }).click();
    await page.getByRole("button", { name: "Student Preview Test" }).click();
    await page.waitForFunction(() => { const v = document.querySelector('[data-testid="student-emergency-video"]'); return v && v.readyState >= 2 && v.videoWidth > 0; }, { timeout: 15000 });
    const student = page.locator('[data-testid="student-emergency-video"]');
    const media = await student.evaluate((v) => ({ width: v.videoWidth, height: v.videoHeight, duration: v.duration, muted: v.muted, loop: v.loop, paused: v.paused, currentTime: v.currentTime, frameCount: v.getVideoPlaybackQuality?.().totalVideoFrames ?? 0, trackCount: v.textTracks.length }));
    assert.equal(media.muted, true); assert.equal(media.loop, true); assert(media.width > 0 && media.frameCount > 0);
    result.results.studentPlayback = "PASS — StudentSelectedPlaceCard decoded and rendered real frames (" + media.width + "×" + media.height + ", " + media.duration.toFixed(2) + "s, " + media.frameCount + " decoded frames).";
    result.results.mutedAutoplay = media.paused ? "FAIL — muted playback remained paused" : "PASS — real Chromium playback began muted.";
    await page.waitForTimeout(700);
    result.results.playbackProgression = await student.evaluate((v) => v.currentTime > 0.25) ? "PASS — media time advanced." : "FAIL — media time did not advance.";

    await page.getByRole("button", { name: "Show video guide controls" }).click();
    await student.evaluate((video) => {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      const source = context.createMediaElementSource(video);
      source.connect(analyser);
      analyser.connect(context.destination);
      const voiceButton = document.querySelector('button[aria-label="Enable video voiceover"]');
      voiceButton?.addEventListener("click", () => { void context.resume(); }, { once: true });
      window.__plvAudioContext = context;
      window.__plvAudioAnalyser = analyser;
    });
    await page.getByRole("button", { name: "Enable video voiceover" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="student-emergency-video"]')?.muted === false, { timeout: 3000 });
    await page.waitForFunction(() => window.__plvAudioContext?.state === "running", null, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    const audioRms = await page.evaluate(() => {
      const analyser = window.__plvAudioAnalyser;
      if (!analyser) return null;
      const values = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(values);
      return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    });
    result.results.voiceover = audioRms === null
      ? "PASS — explicit action unmuted the player; decoded audio signal not measurable in this browser."
      : audioRms > 0.0001
        ? "PASS — explicit action unmuted playback and Chromium produced a non-silent audio signal (RMS " + audioRms.toFixed(5) + "). Actual speaker loudness still needs manual confirmation."
        : "NOT VERIFIED — unmute control changed the media state but the browser audio output measured silent.";
    await page.getByRole("button", { name: "Pause video guide" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="student-emergency-video"]')?.paused === true, { timeout: 3000 });
    await page.getByRole("button", { name: "Play video guide", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="student-emergency-video"]')?.paused === false, { timeout: 3000 });
    result.results.playPause = "PASS — Student Play/Pause controls changed actual media state.";

    await student.evaluate((v) => { if (v.textTracks[0]) v.textTracks[0].mode = "showing"; });
    await page.waitForFunction(() => { const v = document.querySelector('[data-testid="student-emergency-video"]'); return v?.querySelector("track")?.readyState === 2; }, null, { timeout: 6000 });
    await student.evaluate((v) => { v.textTracks[0].mode = "showing"; v.currentTime = 1.3; });
    await page.waitForFunction(() => document.querySelector('[data-testid="student-emergency-video"]')?.textTracks?.[0]?.activeCues?.length > 0, null, { timeout: 4000 });
    const cue = await student.evaluate((v) => v.textTracks[0].activeCues[0].text);
    assert(cue.includes("fictional PLV NaviSync"));
    result.results.captions = "PASS — browser loaded WebVTT and activated expected cue: " + cue;

    const loopStart = await student.evaluate((v) => { v.currentTime = v.duration - 0.2; return v.currentTime; });
    const loopObserved = await page.waitForFunction(() => { const v = document.querySelector('[data-testid="student-emergency-video"]'); return v?.loop && v.currentTime < 1 && !v.paused; }, { timeout: 6000 }).then(() => true).catch(() => false);
    result.results.looping = loopObserved ? "PASS — seeking near end observed natural loop wrap." : "NOT VERIFIED — loop attribute active but wrap not observed from " + loopStart.toFixed(2) + "s.";

    await page.getByRole("button", { name: "Replay video guide" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="student-emergency-video"]')?.currentTime < 0.8, { timeout: 3000 });
    await student.evaluate((v) => { v.currentTime = Math.min(2.5, v.duration / 2); });
    await page.waitForFunction(() => document.querySelector('[data-testid="student-emergency-video"]')?.currentTime > 1, { timeout: 3000 });
    result.results.replayAndSeek = "PASS — Replay reset and media seeking advanced to a new time.";

    await page.getByRole("button", { name: "View video guide fullscreen" }).click();
    await page.waitForFunction(() => document.fullscreenElement?.tagName === "VIDEO", { timeout: 4000 });
    result.results.fullscreen = "PASS — actual video entered browser fullscreen.";
    await page.evaluate(() => document.exitFullscreen());
    const downloadPromise = page.waitForEvent("download", { timeout: 8000 });
    await page.getByRole("button", { name: "Download" }).click();
    const download = await downloadPromise;
    const downloadPath = path.join(process.env.TEMP, "plv-video-acceptance", download.suggestedFilename());
    await download.saveAs(downloadPath);
    const downloaded = fs.readFileSync(downloadPath);
    assert.equal(downloaded.compare(mp4), 0);
    result.results.download = "PASS — downloaded " + downloaded.length + " bytes identical to sample; SHA-256 " + crypto.createHash("sha256").update(downloaded).digest("hex") + ".";

    const desktop = await page.locator('[data-testid="student-room-and-video-stack"]').evaluate((stack) => {
      const room = stack.querySelector('[data-testid="student-selected-place-card"]').getBoundingClientRect();
      const guide = stack.querySelector('[data-testid="student-emergency-video-card"]').getBoundingClientRect();
      return { direction: getComputedStyle(stack).flexDirection, roomTop: room.top, roomBottom: room.bottom, videoTop: guide.top };
    });
    assert.equal(desktop.direction, "column"); assert(desktop.videoTop >= desktop.roomBottom - 2);
    result.results.desktopPosition = "PASS — selected-room component places guide beneath room card at 1440px.";
    await page.screenshot({ path: path.join(artifactDir, "desktop-student-card.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const mobile = await page.locator('[data-testid="student-room-and-video-stack"]').evaluate((stack) => {
      const room = stack.querySelector('[data-testid="student-selected-place-card"]').getBoundingClientRect();
      const guide = stack.querySelector('[data-testid="student-emergency-video-card"]').getBoundingClientRect();
      const rect = stack.getBoundingClientRect();
      return { direction: getComputedStyle(stack).flexDirection, roomTop: room.top, videoTop: guide.top, left: rect.left, right: rect.right, width: innerWidth };
    });
    assert.equal(mobile.direction, "column-reverse"); assert(mobile.videoTop < mobile.roomTop); assert(mobile.left >= 0 && mobile.right <= mobile.width);
    result.results.mobilePosition = "PASS — compact guide appears above room card at 390×844 with no horizontal overflow.";
    await page.screenshot({ path: path.join(artifactDir, "mobile-student-card.png") });

    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole("button", { name: "Enter Emergency Mode" }).evaluate((button) => button.click());
    await page.waitForSelector('[data-testid="watch-emergency-video-compact"]', { timeout: 3000 });
    assert.equal(await page.locator('[data-testid="student-emergency-video"]').count(), 0);
    result.results.emergencyModeCard = "PASS — emergency mode replaces player with compact Watch control and unmounts playback.";
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(artifactDir, "mobile-emergency-compact.png") });
  } catch (error) {
    result.failure = error.stack || String(error);
  } finally {
    result.adapter = { rows: rows.size, objects: objects.size, events, pageErrors: errors, externalRequestsBlocked: events.filter((event) => event.type === "blocked-external-request").length };
    await page.evaluate(() => window.__plvAudioContext?.close?.()).catch(() => {});
    await fs.promises.writeFile(path.join(artifactDir, "browser-results.json"), JSON.stringify(result, null, 2));
    await context.close(); await browser.close();
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.failure) process.exitCode = 1;
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
