const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const out = __dirname;
const result = { fixture: "read-only published campus; remote writes blocked", screenshots: [], errors: [], checks: {} };

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
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

  const read = () => page.evaluate(() => {
    const marker = document.querySelector("[data-route-current-position]");
    const card = document.querySelector('[data-testid="collapsed-route-card"]');
    return {
      step: card?.innerText.match(/Step \d+ of \d+/)?.[0] ?? null,
      progress: marker?.getAttribute("data-progress") ?? null,
      transform: marker?.getAttribute("transform") ?? null,
      visible: Boolean(marker && marker.getBoundingClientRect().width > 0),
    };
  });
  const sampleSeek = async (direction) => {
    const samples = [];
    const end = Date.now() + 2200;
    while (Date.now() < end) {
      samples.push(await read());
      await page.waitForTimeout(24);
    }
    const positions = [...new Set(samples.map(sample => sample.transform).filter(Boolean))];
    const progress = samples.map(sample => Number(sample.progress)).filter(Number.isFinite);
    return {
      samples: samples.length,
      uniquePositions: positions.length,
      startProgress: progress[0] ?? null,
      endProgress: progress.at(-1) ?? null,
      moved: positions.length > 2,
      samplesVisible: samples.every(sample => sample.visible),
      finalStep: samples.at(-1)?.step ?? null,
      direction,
    };
  };
  const screenshot = async name => {
    await page.screenshot({ path: path.join(out, name), fullPage: false });
    result.screenshots.push(name);
  };

  try {
    await page.goto("http://127.0.0.1:5174/map", { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await page.getByRole("button", { name: "Open directions" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    await dialog.getByTestId("route-endpoint-card-start").getByRole("button", { name: "Choose start" }).click();
    await page.getByRole("option", { name: /Campus Gate/ }).click();
    await dialog.getByTestId("route-endpoint-card-destination").getByRole("button", { name: "Choose destination" }).click();
    await page.getByRole("option", { name: /BUSINESS OFFICE SIMULATION ROOM/ }).click();
    const accessible = dialog.getByRole("button", { name: "Accessible routing" });
    await accessible.click();
    result.checks.accessibleModeSelected = await accessible.getAttribute("aria-pressed") === "true";
    await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByText(/Route ready from Campus Gate to BUSINESS OFFICE SIMULATION ROOM/).waitFor();
    result.checks.previewLabel = await dialog.locator("text=Accessible").count() > 0;
    await screenshot("accessible-route-preview-current.png");
    await dialog.getByRole("button", { name: "Start Navigation", exact: true }).click();
    await page.waitForFunction(() => {
      const card = document.querySelector('[data-testid="collapsed-route-card"]')?.innerText ?? "";
      return card.includes("Enter CABA building") || card.includes("Step 3 of 5");
    }, null, { timeout: 20000 });
    result.checks.initial = await read();

    const previous = page.getByRole("button", { name: "Previous step" });
    result.checks.previousEnabled = await previous.isEnabled();
    await previous.click();
    result.checks.reverseSeek = await sampleSeek("reverse");
    result.checks.pausedAfterPrevious = await page.getByRole("button", { name: "Resume navigation" }).isVisible().catch(() => false);
    result.checks.afterPrevious = await read();
    await screenshot("accessible-reverse-seek-2d.png");

    const next = page.getByRole("button", { name: "Next step" });
    result.checks.nextEnabled = await next.isEnabled();
    await next.click();
    result.checks.forwardSeek = await sampleSeek("forward");
    result.checks.nextPausedAtTransition = await page.getByRole("button", { name: "Continue through the active route transition" }).isVisible().catch(() => false);
    result.checks.pausedAfterNext = result.checks.nextPausedAtTransition
      || await page.getByRole("button", { name: "Resume navigation" }).isVisible().catch(() => false);
    result.checks.afterNext = await read();
    result.checks.errors = result.errors;
    await screenshot("accessible-forward-seek-2d.png");

    await page.getByRole("button", { name: "Previous step" }).click();
    const pauseDuringSeek = page.getByRole("button", { name: "Pause navigation" });
    await pauseDuringSeek.waitFor({ state: "visible" });
    await page.waitForTimeout(120);
    const pauseDuringSeekBefore = await read();
    await pauseDuringSeek.click();
    const pauseDuringSeekAtClick = await read();
    await page.waitForTimeout(700);
    const pauseDuringSeekAfter = await read();
    result.checks.pauseDuringSeek = {
      resumeAvailable: await page.getByRole("button", { name: "Resume navigation" }).isVisible().catch(() => false),
      heldPosition: pauseDuringSeekAtClick.progress === pauseDuringSeekAfter.progress
        && pauseDuringSeekAtClick.transform === pauseDuringSeekAfter.transform,
      before: pauseDuringSeekBefore,
      atClick: pauseDuringSeekAtClick,
      after: pauseDuringSeekAfter,
    };

    await page.getByRole("button", { name: "Next step" }).click();
    await page.waitForTimeout(120);
    await page.getByRole("button", { name: "Previous step" }).click();
    await page.waitForTimeout(2200);
    result.checks.rapidRetarget = {
      final: await read(),
      paused: await page.getByRole("button", { name: "Resume navigation" }).isVisible().catch(() => false),
    };
    await screenshot("accessible-rapid-retarget-paused.png");
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    try { await screenshot("accessible-seek-browser-failure.png"); } catch {}
  } finally {
    result.checks.remoteWritesBlocked = true;
    fs.writeFileSync(path.join(out, "navigation-accessible-seek-results.json"), JSON.stringify(result, null, 2));
    await context.close();
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
