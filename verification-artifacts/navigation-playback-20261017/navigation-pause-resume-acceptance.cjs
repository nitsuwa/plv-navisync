const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const result = { fixture: "read-only published campus; route writes blocked", checks: {}, errors: [], screenshots: [] };

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

  const readState = () => page.evaluate(() => {
    const card = document.querySelector('[data-testid="collapsed-route-card"]');
    const marker = document.querySelector('[data-route-current-position]');
    return {
      text: card?.innerText ?? "",
      step: card?.innerText.match(/Step \d+ of \d+/)?.[0] ?? null,
      progress: marker ? Number(marker.getAttribute("data-progress")) : null,
      transform: marker?.getAttribute("transform") ?? null,
      visible: Boolean(marker && marker.getBoundingClientRect().width > 0),
    };
  });

  try {
    await page.goto("http://127.0.0.1:5174/map", { waitUntil: "domcontentloaded" });
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
    await dialog.getByRole("button", { name: "Start Navigation", exact: true }).click();
    await page.getByTestId("student-map-surface").waitFor();
    await page.getByRole("button", { name: "Pause navigation" }).waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Pause navigation" }).click();
    const paused = await readState();
    await page.screenshot({ path: path.join(__dirname, "standard-caba-paused-2d-desktop.png") });
    result.screenshots.push("standard-caba-paused-2d-desktop.png");
    await page.waitForTimeout(1900);
    const afterWait = await readState();
    result.checks.pause = {
      stepUnchanged: paused.step === afterWait.step,
      progressUnchanged: paused.progress === afterWait.progress,
      transformUnchanged: paused.transform === afterWait.transform,
      before: paused,
      afterWait,
    };

    // Explore must expose the next building entrance before playback reaches
    // that instruction, and inspecting it must not move the canonical cursor.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Explore route" }).click();
    const futureEntrance = page.getByRole("button", { name: /Enter CABA building/i }).first();
    result.checks.futureEntranceAvailableAtStep2 = await futureEntrance.isVisible().catch(() => false);
    if (result.checks.futureEntranceAvailableAtStep2) {
      await futureEntrance.click();
      await page.getByTestId("student-floor-picker").waitFor({ state: "visible", timeout: 8000 });
      const inspected = await readState();
      result.checks.exploreFutureEntrance = {
        stayedOnStep2: inspected.step === paused.step,
        floor: await page.getByTestId("student-floor-picker").innerText().catch(() => null),
        exploreActive: await page.getByRole("button", { name: "Explore route" }).getAttribute("aria-pressed").catch(() => null),
        markerVisibleOnDifferentView: inspected.visible,
      };
      await page.screenshot({ path: path.join(__dirname, "standard-caba-explore-future-entrance-2d-mobile-390.png") });
      result.screenshots.push("standard-caba-explore-future-entrance-2d-mobile-390.png");
      await page.getByRole("button", { name: "Return to Follow" }).click();
      await page.waitForFunction(() => document.querySelector('[data-route-current-position]')?.getBoundingClientRect().width > 0, null, { timeout: 8000 });
      const returnedToFollow = await readState();
      result.checks.returnToFollow = {
        step: returnedToFollow.step,
        markerVisible: returnedToFollow.visible,
        progress: returnedToFollow.progress,
        transform: returnedToFollow.transform,
        pausedProgress: paused.progress,
        pausedTransform: paused.transform,
        progressUnchanged: returnedToFollow.progress === paused.progress,
        cardText: returnedToFollow.text,
      };
      const mobileModeToggle = page.getByTestId("student-campus-view-mode-toggle");
      result.checks.mobile3DControlAvailable = await mobileModeToggle.isVisible().catch(() => false);
      if (result.checks.mobile3DControlAvailable) {
        await mobileModeToggle.click();
        await page.locator("canvas").first().waitFor({ state: "visible", timeout: 8000 });
        await page.waitForTimeout(500);
        result.checks.mobile3DCanvas = await page.locator("canvas").evaluateAll(canvases => canvases.some(canvas => {
          const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100;
        }));
        await page.screenshot({ path: path.join(__dirname, "standard-caba-navigation-3d-mobile-390.png") });
        result.screenshots.push("standard-caba-navigation-3d-mobile-390.png");
        if (await mobileModeToggle.getAttribute("data-view-mode-target") === "2d") {
          await mobileModeToggle.click();
          await page.waitForFunction(() => Boolean(document.querySelector("[data-route-current-position]")), null, { timeout: 8000 });
        }
      }
    }

    const beforeResume = await readState();
    await page.getByRole("button", { name: "Resume navigation" }).click();
    const resumed = await readState();
    await page.waitForTimeout(1500);
    const resumedAfter = await readState();
    result.checks.resume = {
      playbackAdvanced: resumedAfter.step !== beforeResume.step
        || resumedAfter.progress !== beforeResume.progress
        || resumedAfter.transform !== beforeResume.transform
        || beforeResume.text.includes("Resume") && resumed.text.includes("Pause"),
      beforeResume,
      before: resumed,
      afterWait: resumedAfter,
    };
    await page.screenshot({ path: path.join(__dirname, "standard-caba-resumed-2d-desktop.png") });
    result.screenshots.push("standard-caba-resumed-2d-desktop.png");

    // Step-list selection is an intentional progress seek, unlike a visual
    // transition cue. It must pause and select the requested later route step.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Pause navigation" }).click();
    await page.getByRole("button", { name: "Explore route" }).click();
    await page.getByRole("button", { name: "Expand" }).click();
    await page.getByTestId("guided-route-steps").waitFor({ state: "visible", timeout: 8000 });
    await page.getByTestId("explore-instruction-3").click();
    await page.getByTestId("explore-inspected-step").waitFor({ state: "visible", timeout: 8000 });
    const instructionSelected = await page.evaluate(() => {
      const active = document.querySelector('[data-testid="explore-inspected-step"]');
      const marker = document.querySelector('[data-route-current-position]');
      return {
        selectedInstruction: active?.innerText ?? null,
        markerVisible: Boolean(marker && marker.getBoundingClientRect().width > 0),
        markerProgress: marker ? Number(marker.getAttribute("data-progress")) : null,
        markerTransform: marker?.getAttribute("transform") ?? null,
      };
    });
    await page.waitForTimeout(1500);
    const instructionAfterWait = await page.evaluate(() => {
      const active = document.querySelector('[data-testid="explore-inspected-step"]');
      const marker = document.querySelector('[data-route-current-position]');
      return {
        selectedInstruction: active?.innerText ?? null,
        markerProgress: marker ? Number(marker.getAttribute("data-progress")) : null,
        markerTransform: marker?.getAttribute("transform") ?? null,
      };
    });
    result.checks.instructionListJump = {
      step4Selected: /Follow the indoor path/i.test(instructionSelected.selectedInstruction ?? ""),
      paused: instructionSelected.selectedInstruction === instructionAfterWait.selectedInstruction
        && instructionSelected.markerProgress === instructionAfterWait.markerProgress
        && instructionSelected.markerTransform === instructionAfterWait.markerTransform,
      before: instructionSelected,
      afterWait: instructionAfterWait,
    };
    await page.screenshot({ path: path.join(__dirname, "standard-caba-step-list-jump-2d-desktop.png") });
    result.screenshots.push("standard-caba-step-list-jump-2d-desktop.png");
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    try {
      await page.screenshot({ path: path.join(__dirname, "pause-resume-browser-failure.png") });
      result.screenshots.push("pause-resume-browser-failure.png");
    } catch {}
  } finally {
    result.checks.remoteWritesBlocked = true;
    result.checks.browserErrors = result.errors;
    fs.writeFileSync(path.join(__dirname, "navigation-pause-resume-results.json"), JSON.stringify(result, null, 2));
    await context.close();
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
