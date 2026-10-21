const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const base = "http://127.0.0.1:5174";
const out = __dirname;
const result = { fixture: "read-only published campus; no geometry or route data writes", screenshots: [], errors: [], checks: {} };

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => result.errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname.endsWith("supabase.co") && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
      const publicReadRpc = request.method() === "POST" && /\/rpc\/(list_event_safe_published_campuses|list_published_campus_version_status|list_coming_soon_campuses)$/.test(url.pathname);
      if (!publicReadRpc) return route.fulfill({ status: 403, body: "Blocked by read-only navigation test" });
    }
    return route.continue();
  });

  const screenshot = async name => {
    const file = path.join(out, name);
    await page.screenshot({ path: file, fullPage: false });
    result.screenshots.push(name);
  };
  const readMarkers = () => page.evaluate(() => {
    const instruction = [...document.querySelectorAll("[data-testid='collapsed-route-card'], [data-testid='route-planner-dialog']")]
      .find(element => element.getClientRects().length)?.innerText ?? "";
    return [...document.querySelectorAll("[data-route-current-position]")].map((marker, index) => {
      const transform = marker.getAttribute("transform") ?? "";
      const match = transform.match(/translate\(([-\d.]+),?\s*([-\d.]+)\)/);
      const screen = marker.getScreenCTM();
      const bounds = marker.getBoundingClientRect();
      return {
        index,
        progress: Number(marker.getAttribute("data-progress")),
        transform,
        world: match ? { x: Number(match[1]), y: Number(match[2]) } : null,
        screen: screen ? { x: screen.e, y: screen.f } : null,
        step: instruction.match(/Step \d+ of \d+/)?.[0] ?? null,
        markerVisible: bounds.width > 0 && bounds.height > 0,
      };
    });
  });
  const readMarker = async () => (await readMarkers())[0] ?? null;
  const sampleSeek = async (direction, duration = 1900) => {
    const samples = [];
    const end = Date.now() + duration;
    while (Date.now() < end) {
      samples.push(await readMarkers());
      await page.waitForTimeout(32);
    }
    const tracks = new Map();
    for (const frame of samples) for (const marker of frame) {
      const track = tracks.get(marker.index) ?? [];
      track.push(marker);
      tracks.set(marker.index, track);
    }
    const markerTracks = [...tracks].map(([index, track]) => {
      const positions = track.map(item => item.transform);
      const uniquePositions = new Set(positions).size;
      const progressValues = track.map(item => item.progress);
      return { index, samples: track.length, uniquePositions,
        uniqueProgressValues: new Set(progressValues.map(value => Number(value.toFixed(3)))).size,
        firstProgress: progressValues[0] ?? null, lastProgress: progressValues.at(-1) ?? null,
        firstTransform: positions[0] ?? null, lastTransform: positions.at(-1) ?? null };
    });
    const best = markerTracks.sort((a, b) => b.uniquePositions - a.uniquePositions)[0] ?? null;
    return { markerTracks, best, moved: Boolean(best && best.uniquePositions > 2) };
  };

  try {
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await page.getByRole("button", { name: "Open directions" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    await dialog.waitFor();
    await dialog.getByTestId("route-endpoint-card-start").getByRole("button", { name: "Choose start" }).click();
    await page.getByRole("option", { name: /Campus Gate/ }).click();
    await dialog.getByTestId("route-endpoint-card-destination").getByRole("button", { name: "Choose destination" }).click();
    await page.getByRole("option", { name: /BUSINESS OFFICE SIMULATION ROOM/ }).click();
    await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByText(/Route ready from Campus Gate to BUSINESS OFFICE SIMULATION ROOM/).waitFor();
    result.checks.standardRoutePreview = true;
    await dialog.getByRole("button", { name: "Start Navigation", exact: true }).click();
    await page.getByTestId("student-map-surface").waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.includes("Enter CABA building")
      || document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.includes("Step 3 of 5"), null, { timeout: 20000 });
    await page.getByRole("button", { name: "Pause navigation" }).waitFor({ state: "visible", timeout: 1500 }).catch(() => undefined);
    const atEntrance = await readMarker();
    result.checks.active2DProgressMarker = atEntrance?.markerVisible === true;
    result.checks.initialStep = atEntrance?.step;
    await screenshot("standard-caba-follow-2d-desktop.png");

    const previous = page.getByRole("button", { name: "Previous step" });
    if (await previous.isVisible().catch(() => false) && await previous.isEnabled().catch(() => false)) {
      await previous.click();
      result.checks.reverseSeek = await sampleSeek("reverse");
      await page.getByRole("button", { name: "Resume navigation" }).waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
      await screenshot("standard-caba-reverse-seek-2d-desktop.png");
    } else result.checks.reverseSeek = { blocked: true, reason: "Previous step unavailable before CABA entrance transition" };

    const next = page.getByRole("button", { name: "Next step" });
    if (await next.isVisible().catch(() => false) && await next.isEnabled().catch(() => false)) {
      await next.click();
      result.checks.forwardSeek = await sampleSeek("forward");
      await screenshot("standard-caba-forward-seek-2d-desktop.png");
    } else result.checks.forwardSeek = { blocked: true, reason: "Next step unavailable" };

    result.checks.playbackStepBeforeExplore = await page.locator('[data-testid="collapsed-route-card"]')
      .innerText().catch(() => null);
    await page.getByRole("button", { name: "Explore route" }).click();
    const beforeExploreTransition = await page.evaluate(() => ({
      step: document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.match(/Step \d+ of \d+/)?.[0] ?? null,
      floor: document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-floor-label") ?? null,
    }));
    result.checks.exploreTransitionLabels = await page.locator('[data-testid="student-active-transition-marker"]')
      .evaluateAll(nodes => nodes.map(node => node.querySelector('[role="button"]')?.getAttribute("aria-label") ?? null));
    result.checks.markerVisibleInExploreSourceContext = (await readMarker())?.markerVisible === true;
    const entrance = page.getByRole("button", { name: /Enter CABA building/i }).filter({ visible: true }).first();
    result.checks.exploreEntranceVisible = await entrance.isVisible().catch(() => false);
    if (result.checks.exploreEntranceVisible) {
      await entrance.click();
      await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="student-floor-picker"]'))
        || document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-floor-mode") === "true"
        || document.querySelector("[data-testid='floor-plan-surface']"), null, { timeout: 8000 }).catch(() => undefined);
    }
    result.checks.exploreEntrance = await page.evaluate(before => ({
      stepBefore: before.step,
      stepAfter: document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.match(/Step \d+ of \d+/)?.[0] ?? null,
      explorePressed: [...document.querySelectorAll('button[aria-pressed="true"]')].some(button => /EXPLORE/i.test(button.innerText)),
      floorPicker: document.querySelector('[data-testid="student-floor-picker"]')?.innerText ?? null,
      floorMode: document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-floor-mode") ?? null,
      activeTransitionLabels: [...document.querySelectorAll('[data-testid="student-active-transition-marker"]')].map(element => element.getAttribute("aria-label")),
    }), beforeExploreTransition);
    await page.waitForTimeout(1200);
    result.checks.exploreFloorScene = await page.locator('[data-testid="readonly-floor-plan-scene"]').first()
      .evaluate(scene => {
        const rect = scene.getBoundingClientRect();
        return { width: rect.width, height: rect.height, childCount: scene.children.length,
          visible: rect.width > 0 && rect.height > 0 };
      }).catch(() => null);
    await screenshot("standard-caba-explore-floor-settled-2d-desktop.png");
    await screenshot("standard-caba-explore-entrance-inspected-floor.png");
    await page.getByRole("button", { name: "Return to Follow" }).click().catch(() => undefined);
    await page.waitForFunction(() => document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.includes("Step 3 of 5"), null, { timeout: 6000 }).catch(() => undefined);
    result.checks.exploreDidNotChangePlayback = {
      expectedStep: "Step 3 of 5",
      restoredStep: await page.locator('[data-testid="collapsed-route-card"]').innerText().then(text => text.match(/Step \d+ of \d+/)?.[0] ?? null).catch(() => null),
      marker: await readMarker(),
    };
    await screenshot("standard-caba-explore-entrance.png");

    // Re-enter Explore at the same pending entrance and activate its 3D route cue.
    await page.getByRole("button", { name: "Explore route" }).click();
    const desktopModeToggle = page.getByTestId("student-campus-view-mode-toggle");
    result.checks.desktopModeToggle = await desktopModeToggle.isVisible().catch(() => false);
    if (result.checks.desktopModeToggle) {
      await desktopModeToggle.click();
      await page.locator("canvas").first().waitFor({ state: "visible", timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(600);
      result.checks.desktop3DCanvas = await page.locator("canvas").evaluateAll(canvases => canvases.some(canvas => {
        const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100;
      }));
      result.checks.threeDEntranceButtonVisible = await page.getByRole("button", { name: "Enter CABA building." }).isVisible().catch(() => false);
      await screenshot("standard-caba-explore-entrance-3d-desktop.png");
      if (result.checks.threeDEntranceButtonVisible) {
        await page.getByRole("button", { name: "Enter CABA building." }).click();
        await page.getByTestId("student-floor-picker").waitFor({ state: "visible", timeout: 8000 }).catch(() => undefined);
        result.checks.explore3DEntranceInspection = {
          floorPicker: await page.getByTestId("student-floor-picker").innerText().catch(() => null),
          explorePressed: await page.getByRole("button", { name: "Explore route" }).getAttribute("aria-pressed").catch(() => null),
        };
        await screenshot("standard-caba-explore-entrance-3d-inspected-floor.png");
      }
      await page.getByRole("button", { name: "Return to Follow" }).click().catch(() => undefined);
      await page.waitForFunction(() => document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.includes("Step 3 of 5"), null, { timeout: 6000 }).catch(() => undefined);
      result.checks.threeDStepBeforeReverseSeek = await page.locator('[data-testid="collapsed-route-card"]')
        .innerText().then(text => text.match(/Step \d+ of \d+/)?.[0] ?? null).catch(() => null);
      const threeDPrevious = page.getByRole("button", { name: "Previous step" });
      result.checks.threeDPreviousEnabled = await threeDPrevious.isEnabled().catch(() => false);
      if (result.checks.threeDPreviousEnabled) {
        await threeDPrevious.click();
        await page.waitForFunction(() => document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.includes("Step 2 of 5"), null, { timeout: 6000 });
        await page.getByRole("button", { name: "Resume navigation" }).waitFor({ state: "visible", timeout: 6000 });
        result.checks.threeDReverseSeekStep = await page.locator('[data-testid="collapsed-route-card"]')
          .innerText().then(text => text.match(/Step \d+ of \d+/)?.[0] ?? null);
        await screenshot("standard-caba-reverse-seek-3d-desktop.png");
        await page.getByRole("button", { name: "Next step" }).click();
        await page.waitForFunction(() => document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.includes("Step 3 of 5"), null, { timeout: 6000 });
        await page.getByRole("button", { name: /Continue through the active route transition|Continue/ }).waitFor({ state: "visible", timeout: 6000 });
        result.checks.threeDForwardSeekStep = await page.locator('[data-testid="collapsed-route-card"]')
          .innerText().then(text => text.match(/Step \d+ of \d+/)?.[0] ?? null);
        await screenshot("standard-caba-forward-seek-3d-desktop.png");
      }
      await desktopModeToggle.click().catch(() => undefined);
    }

    // The mobile utility layout reserves a strip above the active navigation sheet.
    // Confirm the renderer control remains visible and clickable at both requested widths.
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot("standard-caba-explore-entrance-mobile-390.png");
    const modeToggle = page.getByTestId("student-campus-view-mode-toggle");
    result.checks.modeToggleAt390 = { visible: await modeToggle.isVisible().catch(() => false), box: await modeToggle.boundingBox().catch(() => null) };
    if (result.checks.modeToggleAt390.visible) {
      await modeToggle.click();
      await page.waitForTimeout(1200);
      result.checks.modeAfterToggleAt390 = await modeToggle.getAttribute("data-view-mode-target");
      result.checks.threeDCanvasAt390 = await page.locator("canvas").evaluateAll(canvases => canvases.some(canvas => {
        const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100;
      }));
      await screenshot("standard-caba-navigation-3d-mobile-390.png");
      await modeToggle.click();
      await modeToggle.waitFor({ state: "visible" });
      result.checks.rendererRoundTripProgress = await readMarker();
    }
    await page.setViewportSize({ width: 360, height: 780 });
    const modeToggle360 = page.getByTestId("student-campus-view-mode-toggle");
    result.checks.modeToggleAt360 = { visible: await modeToggle360.isVisible().catch(() => false), box: await modeToggle360.boundingBox().catch(() => null) };
    if (result.checks.modeToggleAt360.visible) {
      await modeToggle360.click();
      await page.waitForTimeout(700);
      result.checks.modeAfterToggleAt360 = await modeToggle360.getAttribute("data-view-mode-target");
      await screenshot("standard-caba-navigation-3d-mobile-360.png");
      await modeToggle360.click();
      result.checks.markerAfter360RoundTrip = await readMarker();
    }
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    try { await screenshot("browser-failure.png"); } catch {}
  } finally {
    result.checks.remoteWritesBlocked = true;
    result.checks.browserErrors = result.errors;
    fs.writeFileSync(path.join(out, "navigation-playback-results.json"), JSON.stringify(result, null, 2));
    await context.close();
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
