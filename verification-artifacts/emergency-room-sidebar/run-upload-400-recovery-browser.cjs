const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const outputDirectory = path.resolve("verification-artifacts/emergency-room-sidebar");
const baseUrl = "http://127.0.0.1:5174/verification-artifacts/emergency-room-sidebar/room-properties-preview.html";
const testUserId = "90000000-0000-4000-8000-000000000001";
const result = { fixture: "TEST ONLY local Storage/PostgREST adapter", productionWrites: "none", storageRequests: [], metadataRows: [], checks: {}, browserErrors: [] };

function fulfill(route, body, status = 200) {
  return route.fulfill({ status, body: JSON.stringify(body), headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  } });
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ userId }) => {
    localStorage.setItem("sb-aaketmqvxqjgaznvclqc-auth-token", JSON.stringify({
      access_token: "TEST_ONLY_LOCAL_TOKEN",
      refresh_token: "TEST_ONLY_LOCAL_REFRESH",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, aud: "authenticated", role: "authenticated", email: "upload-test@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    }));
  }, { userId: testUserId });

  let storageAttempt = 0;
  let nextId = 1;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    const { pathname } = url;
    if (request.method() === "OPTIONS") return fulfill(route, {}, 204);
    if (pathname.endsWith("/auth/v1/user") && request.method() === "GET") {
      return fulfill(route, { id: testUserId, aud: "authenticated", role: "authenticated", email: "upload-test@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
    }
    if (/\/rest\/v1\/emergency_evacuation_videos(?:$|\/)/.test(pathname)) {
      if (request.method() === "GET") {
        const requestedId = url.searchParams.get("id")?.replace(/^eq\./, "");
        if (requestedId) {
          const row = result.metadataRows.find((candidate) => candidate.id === requestedId);
          return row ? fulfill(route, row) : fulfill(route, { message: "TEST_ONLY row not found" }, 406);
        }
        return fulfill(route, result.metadataRows.map(({ id }) => ({ id })));
      }
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        const row = { ...input, captions_path: null, captions_size_bytes: null, duration_seconds: null, status: "draft", approved_route_fingerprint: null, approved_by: null, published_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        result.metadataRows.push(row);
        return fulfill(route, row, 201);
      }
    }
    if (pathname.endsWith("/storage/v1/object/list/emergency-evacuation-videos") && request.method() === "POST") return fulfill(route, []);
    if (/\/storage\/v1\/object\/emergency-evacuation-videos\//.test(pathname) && request.method() === "POST") {
      storageAttempt += 1;
      result.storageRequests.push({ method: request.method(), path: pathname, contentType: request.headers()["content-type"], attempt: storageAttempt });
      if (storageAttempt === 1) return fulfill(route, { statusCode: "InvalidMimeType", message: "TEST_ONLY simulated private Storage 400" }, 400);
      return fulfill(route, { Key: pathname.split("/storage/v1/object/emergency-evacuation-videos/")[1] }, 200);
    }
    return fulfill(route, { message: "blocked by isolated TEST ONLY adapter" }, 403);
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => result.browserErrors.push(error.message));
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Emergency Evacuation", exact: true }).click();
    await page.getByRole("button", { name: /emergency evacuation video guide/i }).click();
    await page.getByRole("button", { name: "Upload MP4 video" }).waitFor({ state: "visible" });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Upload MP4 video") && !button.disabled));
    const input = page.locator('input[accept="video/mp4,.mp4"]');
    const testMp4 = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const file = { name: "TEST_ONLY retry.mp4", mimeType: "video/mp4", buffer: testMp4 };

    await input.setInputFiles(file);
    await page.getByRole("alert").getByText("Upload failed. Please retry.").waitFor();
    const diagnostics = page.getByTestId("emergency-video-upload-diagnostics");
    result.checks.conciseError = await page.getByRole("alert").innerText() === "Upload failed. Please retry.";
    result.checks.diagnosticsInitiallyCollapsed = !(await diagnostics.evaluate((node) => node.hasAttribute("open")));
    await page.getByText("Upload diagnostics", { exact: true }).click();
    const diagnosticText = await diagnostics.innerText();
    result.checks.storage400IsIdentified = diagnosticText.includes("HTTP") && diagnosticText.includes("400") && diagnosticText.includes("Storage object upload") && diagnosticText.includes("InvalidMimeType");
    result.checks.pathAndMimeAreVisible = diagnosticText.includes("emergency-evacuation-videos/test-campus-only/test-room-101/") && diagnosticText.includes("video/mp4");
    await page.screenshot({ path: path.join(outputDirectory, "upload-400-diagnostics-390.png"), fullPage: true });

    await input.setInputFiles(file);
    await page.getByTestId("emergency-video-admin-record").waitFor({ timeout: 10000 });
    result.checks.retryCreatesOneMetadataRow = result.metadataRows.length === 1;
    result.checks.retryUsesFreshCanonicalObjectPath = result.storageRequests.length === 2 && result.storageRequests[1].path.includes(`/test-campus-only/test-room-101/${result.metadataRows[0].id}.mp4`);
    result.checks.uploadedDraftRendersAfterReloadingMetadata = await page.getByText("Uploaded · awaiting review").count() === 1;
    result.checks.failureDiagnosticClearsOnSuccess = await page.getByTestId("emergency-video-upload-diagnostics").count() === 0;
    result.checks.noBrowserErrors = result.browserErrors.length === 0;
    await page.screenshot({ path: path.join(outputDirectory, "upload-400-recovered-390.png"), fullPage: true });
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(outputDirectory, "upload-400-recovery-browser-results.json"), JSON.stringify(result, null, 2));
  const failures = Object.entries(result.checks).filter(([, passed]) => passed !== true);
  if (failures.length) throw new Error(`TEST ONLY upload recovery checks failed: ${JSON.stringify(failures)}`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
