const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const base = "http://127.0.0.1:5174";
const out = __dirname;
const result = { fixture: "read-only published route: Campus Gate to BUSINESS OFFICE SIMULATION ROOM", errors: [], checks: {} };

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
    result.checks.routePreview = true;
    result.checks.previewText = (await dialog.innerText()).slice(0, 1400);

    await dialog.getByRole("button", { name: "Start Navigation", exact: true }).click();
    const card = page.getByTestId("collapsed-route-card");
    await card.waitFor();
    await page.waitForFunction(() => /Step \d+ of \d+/.test(document.querySelector('[data-testid="collapsed-route-card"]')?.innerText ?? ""));
    const initialText = await card.innerText();
    const initialStep = initialText.match(/Step \d+ of \d+/)?.[0] ?? null;
    const initialInstruction = initialText.split("\n").map(line => line.trim()).find(line => line === "Start at Campus Gate.") ?? "";
    result.checks.initial = { step: initialStep, instruction: initialInstruction, text: initialText };
    result.checks.incorrectAlreadyAtEntrance = /Already at (?:the )?(?:Primary )?Entrance/i.test(initialText);
    result.checks.firstStepIsMeaningful = initialStep === "Step 1 of 5" && initialInstruction === "Start at Campus Gate.";
    await page.waitForFunction(() => {
      const text = document.querySelector('[data-testid="collapsed-route-card"]')?.innerText ?? "";
      return text.includes("Enter CABA building.") && /Step \d+ of \d+/.test(text);
    }, null, { timeout: 15000 });
    const beforeContinueText = await card.innerText();
    result.checks.beforeContinue = { step: beforeContinueText.match(/Step \d+ of \d+/)?.[0] ?? null, instruction: beforeContinueText.includes("Enter CABA building."), text: beforeContinueText };
    await page.screenshot({ path: path.join(out, "recorded-case-before-continue.png") });
    const continueButton = page.getByRole("button", { name: /Continue through the active route transition|Continue/ }).first();
    await continueButton.waitFor({ state: "visible" });
    await continueButton.click();
    await page.waitForFunction(() => /Step 4 of 5/.test(document.querySelector('[data-testid="collapsed-route-card"]')?.innerText ?? ""), null, { timeout: 8000 });
    const afterContinueText = await card.innerText();
    result.checks.afterContinue = { changed: afterContinueText !== beforeContinueText, step: afterContinueText.match(/Step \d+ of \d+/)?.[0] ?? null, instruction: afterContinueText, text: afterContinueText };
    const pause = page.getByRole("button", { name: "Pause navigation" });
    if (await pause.isVisible().catch(() => false)) await pause.click();
    await page.waitForTimeout(300);
    result.checks.pausedAfterContinue = await page.getByRole("button", { name: "Resume navigation" }).isVisible().catch(() => false);
    const pausedContinueText = await card.innerText();
    await page.screenshot({ path: path.join(out, "recorded-case-after-continue.png") });
    result.checks.progressMarker2d = await page.evaluate(() => [...document.querySelectorAll("[data-route-current-position]")].map(marker => {
      const box = marker.getBoundingClientRect();
      return { progress: Number(marker.getAttribute("data-progress")), transform: marker.getAttribute("transform"), visible: box.width > 0 && box.height > 0 };
    }));

    const stepBeforeRenderer = pausedContinueText.match(/Step \d+ of \d+/)?.[0] ?? null;
    await page.getByRole("button", { name: "Switch to 3D view" }).click();
    await page.getByTestId("student-map-surface").waitFor();
    await page.waitForTimeout(700);
    result.checks.renderer3d = await page.evaluate(() => ({
      isThreeD: Boolean(document.querySelector("canvas")),
      routeCard: document.querySelector('[data-testid="collapsed-route-card"]')?.innerText ?? "",
      canvasCount: document.querySelectorAll("canvas").length,
    }));
    await page.screenshot({ path: path.join(out, "recorded-case-after-continue-3d.png") });
    await page.getByRole("button", { name: "Switch to 2D view" }).click();
    await page.waitForTimeout(700);
    result.checks.rendererRoundTrip = await page.evaluate(() => ({
      step: document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.match(/Step \d+ of \d+/)?.[0] ?? null,
      markers: [...document.querySelectorAll("[data-route-current-position]")].map(marker => {
        const box = marker.getBoundingClientRect();
        return { progress: Number(marker.getAttribute("data-progress")), transform: marker.getAttribute("transform"), visible: box.width > 0 && box.height > 0 };
      }),
    }));
    result.checks.stepPreservedAcrossRenderers = result.checks.rendererRoundTrip.step === stepBeforeRenderer;
    await page.screenshot({ path: path.join(out, "recorded-case-after-continue-2d.png") });
  } catch (error) {
    result.errors.push(error.stack ?? String(error));
    try { await page.screenshot({ path: path.join(out, "recorded-case-failure.png") }); } catch {}
  } finally {
    await context.close();
    await browser.close();
    fs.writeFileSync(path.join(out, "recorded-case-continue-results.json"), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}

main();
