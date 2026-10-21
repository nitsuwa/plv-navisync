const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const out = __dirname;
const base = "http://[::1]:5173/map";
const result = {
  scope: "Read-only MAIN CAMPUS published Student Map; Supabase mutations blocked",
  routeCases: [],
  interactionCase: null,
  viewportCases: [],
  blockedWrites: [],
  errors: [],
};

const routePairs = [
  { from: "CANTEEN", to: "CABA-201", mode: "Standard", preference: "Best" },
  { from: "CANTEEN", to: "CABA-201", mode: "Standard", preference: "Prefer stairs" },
  { from: "CANTEEN", to: "CABA-201", mode: "Standard", preference: "Prefer elevator" },
  { from: "CABA", selectFrom: "COLLEGE OF ACCOUNTANCY AND BUSINESS ADMINISTRATION", to: "CABA-201", mode: "Standard" },
  { from: "CABA", selectFrom: "COLLEGE OF ACCOUNTANCY AND BUSINESS ADMINISTRATION", to: "CABA-101", mode: "Standard" },
  { from: "CABA-101", to: "CABA-201", mode: "Standard", preference: "Prefer stairs" },
  { from: "CABA-201", to: "CABA-101", mode: "Standard", preference: "Prefer elevator" },
  { from: "CABA-201", to: "CABA-405", mode: "Standard", preference: "Prefer stairs" },
  { from: "CABA-405", to: "CABA-201", mode: "Standard", preference: "Prefer elevator" },
  { from: "CABA-405", to: "CABA", selectTo: "COLLEGE OF ACCOUNTANCY AND BUSINESS ADMINISTRATION", mode: "Standard" },
  { from: "CABA-405", to: "CABA-403", mode: "Standard" },
  { from: "CEIT", selectFrom: "COLLEGE OF ENGINEERING AND INFORMATION TECHNOLOGY", to: "CABA", selectTo: "COLLEGE OF ACCOUNTANCY AND BUSINESS ADMINISTRATION", mode: "Standard" },
  { from: "CABA", selectFrom: "COLLEGE OF ACCOUNTANCY AND BUSINESS ADMINISTRATION", to: "CEIT", selectTo: "COLLEGE OF ENGINEERING AND INFORMATION TECHNOLOGY", mode: "Standard" },
  { from: "COED", selectFrom: "COLLEGE OF EDUCATION BUILDING", to: "CABA-201", mode: "Standard" },
  { from: "STUDENT CENTER", selectFrom: "STUDENT CENTER BUILDING", to: "CABA-201", mode: "Standard" },
  { from: "Campus Gate", to: "CABA-201", mode: "Standard" },
  { from: "CABA-201", to: "CANTEEN", mode: "Accessible" },
  { from: "CABA-201", to: "CABA-201", mode: "Standard", sameEndpointExpected: true },
];

async function createPage(browser, viewport = { width: 1440, height: 900 }, colorScheme = "light") {
  const context = await browser.newContext({ viewport, colorScheme, reducedMotion: "no-preference" });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") result.errors.push(`console: ${message.text()}`); });
  page.on("requestfailed", (request) => result.errors.push(`request failed ${request.url()}: ${request.failure()?.errorText}`));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname.endsWith("supabase.co") && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
      const readRpc = request.method() === "POST" && /\/rpc\/(list_event_safe_published_campuses|list_published_campus_version_status|list_coming_soon_campuses)$/.test(url.pathname);
      if (!readRpc) {
        result.blockedWrites.push({ method: request.method(), path: url.pathname });
        return route.fulfill({ status: 403, body: "Blocked by read-only navigation audit" });
      }
    }
    return route.continue();
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  return { context, page };
}

async function waitForMapReady(page) {
  await page.locator("#root").waitFor({ timeout: 12000 });
  await page.getByRole("searchbox", { name: "Search campus map" }).waitFor({ timeout: 12000 });
}

async function setEndpoint(dialog, endpoint, query, expectedLabel = query) {
  const choose = endpoint === "start" ? "Choose start" : "Choose destination";
  await dialog.getByTestId(`route-endpoint-card-${endpoint}`).getByRole("button", { name: choose }).click();
  const search = dialog.getByRole("searchbox", { name: endpoint === "start" ? "Search start" : "Search destination" });
  await search.waitFor({ state: "visible" });
  try {
    await search.fill(query, { timeout: 7000 });
  } catch {
    await search.click({ timeout: 5000 });
    await search.fill(query, { timeout: 7000 });
  }
  const options = dialog.locator('[role="option"]');
  await options.first().waitFor({ timeout: 5000 });
  const optionData = await options.evaluateAll((elements) => elements.map((element) => ({
    text: element.innerText,
    label: element.getAttribute("aria-label") ?? "",
    disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
  })));
  const exactIndex = optionData.findIndex((option) => option.text.split("\n")[0].trim().toLocaleLowerCase() === expectedLabel.toLocaleLowerCase());
  const optionIndex = exactIndex >= 0 ? exactIndex : optionData.findIndex((option) => option.label.toLocaleLowerCase().startsWith(expectedLabel.toLocaleLowerCase()));
  if (optionIndex < 0) throw new Error(`No search result matched ${expectedLabel}; got ${optionData.map((option) => option.text).join(" | ")}`);
  if (optionData[optionIndex].disabled) return { options: optionData.map((option) => option.text), selectionBlocked: true, blockedOption: optionData[optionIndex] };
  await options.nth(optionIndex).click();
  return { options: optionData.map((option) => option.text), selectionBlocked: false };
}

async function planCase(browser, routeCase) {
  const { context, page } = await createPage(browser);
  const data = {
    from: routeCase.from,
    ...(routeCase.selectFrom ? { selectFrom: routeCase.selectFrom } : {}),
    to: routeCase.to,
    ...(routeCase.selectTo ? { selectTo: routeCase.selectTo } : {}),
    mode: routeCase.mode,
    ...(routeCase.preference ? { preference: routeCase.preference } : {}),
    ...(routeCase.sameEndpointExpected ? { sameEndpointExpected: true } : {}),
    optionTexts: {},
    status: "NOT VERIFIED",
  };
  try {
    await waitForMapReady(page);
    await page.getByRole("button", { name: "Open directions" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    await dialog.waitFor();
    const modeButton = dialog.getByRole("button", { name: `${routeCase.mode} routing`, exact: true });
    await modeButton.click();
    data.modePressedAfterSelect = await modeButton.getAttribute("aria-pressed");
    if (routeCase.preference) {
      const preferenceGroup = dialog.getByRole("group", { name: "Standard route preference" });
      await preferenceGroup.getByRole("button", { name: routeCase.preference, exact: true }).click();
      data.preferencePressedAfterSelect = await preferenceGroup.getByRole("button", { name: routeCase.preference, exact: true }).getAttribute("aria-pressed");
    }
    const startSelection = await setEndpoint(dialog, "start", routeCase.from, routeCase.selectFrom ?? routeCase.from);
    data.optionTexts.start = startSelection.options;
    const destinationSelection = await setEndpoint(dialog, "destination", routeCase.to, routeCase.selectTo ?? routeCase.to);
    data.optionTexts.destination = destinationSelection.options;
    if (routeCase.sameEndpointExpected && destinationSelection.selectionBlocked) {
      data.sameEndpointPrevented = true;
      data.status = "PASS — same endpoint prevented";
    } else {
      await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
      await page.waitForTimeout(500);
      data.preview = await dialog.innerText();
      data.routeReady = /Route ready from/i.test(data.preview) && !/No route|unavailable/i.test(data.preview);
      data.preference = routeCase.preference ?? routeCase.mode;
      data.modeSelected = data.modePressedAfterSelect === "true";
      data.preferenceSelected = routeCase.preference ? data.preferencePressedAfterSelect === "true" : null;
      data.modeMatchesPreview = routeCase.mode === "Accessible"
        ? /ACCESSIBLE ROUTE/i.test(data.preview)
        : /STANDARD ROUTE/i.test(data.preview);
      data.preferenceMatchesPreview = routeCase.preference === "Best"
        ? true
        : routeCase.preference === "Prefer stairs"
          ? /stairs/i.test(data.preview)
          : routeCase.preference === "Prefer elevator"
            ? /elevator/i.test(data.preview)
            : true;
      data.normalAlternativeSelectorCount = await page.getByTestId("automatic-route-selector").count();
      data.routeGeometry = await page.evaluate(() => [...document.querySelectorAll('[data-testid="remaining-route-line"]')]
        .map((line) => line.getAttribute("points")));
      data.routeGeometryCount = data.routeGeometry.length;
      data.routeGeometryObservation = data.routeGeometry.length
        ? "Rendered route line captured"
        : "No route polyline is rendered in this planner map context; geometry not independently verified here";
      data.routeGeometryFinite = data.routeGeometry.every((points) => points && points.split(/\s+/).length >= 2 && points.split(/\s+/).every((pair) => pair.split(",").length === 2 && pair.split(",").every((value) => Number.isFinite(Number(value)))));
      data.status = !data.routeReady ? "BLOCKED BY CAMPUS DATA"
        : !data.modeSelected || (routeCase.preference && !data.preferenceSelected) || !data.modeMatchesPreview
          || !data.preferenceMatchesPreview || !data.routeGeometryFinite || data.normalAlternativeSelectorCount > 0 ? "FAIL"
          : "PASS";
      if (routeCase.from === "CANTEEN" && routeCase.to === "CABA-201" && (routeCase.preference ?? "Best") === "Best") await page.screenshot({ path: path.join(out, "canteen-caba201-preview.png") });
      if (routeCase.from === "CABA-405" && routeCase.to === "CABA-403") await page.screenshot({ path: path.join(out, "caba405-caba403-preview.png") });
      if (routeCase.from === "CABA" && routeCase.to === "CABA-201") await page.screenshot({ path: path.join(out, "caba-building-to-room-preview.png") });
    }
  } catch (error) {
    data.error = String(error.stack ?? error);
    result.errors.push(`${routeCase.from} -> ${routeCase.to}: ${error.message}`);
  } finally {
    await context.close();
  }
  result.routeCases.push(data);
  fs.writeFileSync(path.join(out, "browser-audit-results.json"), JSON.stringify(result, null, 2));
  return data;
}

async function readPlayback(page) {
  return page.evaluate(() => {
    const summary = document.querySelector('[data-testid="guided-navigation-summary"]');
    const marker = document.querySelector("[data-route-current-position]");
    const scenes = [...document.querySelectorAll('[data-testid="student-floor-scene"]')];
    const activeScene = scenes.find((scene) => Number(getComputedStyle(scene).opacity) > 0.5);
    const rect = (element) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      summary: summary?.innerText ?? null,
      markerCount: document.querySelectorAll("[data-route-current-position]").length,
      markerTransform: marker?.getAttribute("transform") ?? null,
      markerProgress: marker?.getAttribute("data-progress") ?? null,
      floor: activeScene?.getAttribute("data-floor-number")
        ?? document.querySelector('[data-testid="student-floor-current-label"]')?.textContent?.trim()
        ?? null,
      visibleRouteLineCount: [...document.querySelectorAll('[data-testid="remaining-route-line"]')].filter((line) => getComputedStyle(line).opacity !== "0").length,
      header: rect(document.querySelector("[data-testid=\"guided-navigation-header\"]")),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
}

async function holdAndExpandNavigation(page) {
  const pause = page.getByRole("button", { name: "Pause navigation" }).first();
  await pause.waitFor({ state: "visible", timeout: 7000 });
  if (await pause.isEnabled()) await pause.click();
  const expand = page.getByRole("button", { name: /Expand navigation panel|Expand route panel/ }).first();
  if (await expand.count() && await expand.isVisible()) await expand.click();
  await page.getByTestId("guided-navigation-summary").waitFor({ timeout: 5000 });
}

async function interactionAudit(browser) {
  const { context, page } = await createPage(browser, { width: 1440, height: 900 }, "dark");
  const data = { route: "CANTEEN -> CABA-201", sequence: [], status: "NOT VERIFIED" };
  try {
    await waitForMapReady(page);
    await page.getByRole("button", { name: "Open directions" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    await setEndpoint(dialog, "start", "CANTEEN");
    await setEndpoint(dialog, "destination", "CABA-201");
    await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByTestId("route-summary").waitFor();
    await dialog.getByRole("button", { name: "Start Navigation", exact: true }).click();
    await holdAndExpandNavigation(page);
    await page.waitForTimeout(120);
    data.sequence.push({ action: "start then pause", state: await readPlayback(page) });

    const next = page.locator('button[aria-label="Next step"],button[aria-label="Next"],button').filter({ hasText: /^Next$/ }).first();
    const previous = page.locator('button[aria-label="Previous step"],button[aria-label="Previous"],button').filter({ hasText: /^Previous$/ }).first();
    const before = await readPlayback(page);
    if (await next.count() && await next.isEnabled()) await next.click();
    const duringSeek = await readPlayback(page);
    const nextDisabledDuringSeek = await next.count() ? !(await next.isEnabled()) : null;
    if (await next.count()) await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find((element) => ["Next", "Next step"].includes(element.getAttribute("aria-label")) || element.innerText.trim() === "Next");
      return !button || !button.disabled;
    }, null, { timeout: 3500 }).catch(() => undefined);
    const beforePrevious = await readPlayback(page);
    const previousEnabledAtTransition = await previous.count() ? await previous.isEnabled() : false;
    if (previousEnabledAtTransition) await previous.click();
    const reverseSamples = [];
    for (const waitMs of [0, 120, 300, 650, 1100, 1800, 2800]) {
      if (waitMs) await page.waitForTimeout(waitMs - (reverseSamples.at(-1)?.tMs ?? 0));
      reverseSamples.push({ tMs: waitMs, state: await readPlayback(page), nextDisabled: await next.count() ? !(await next.isEnabled()) : null });
    }
    const afterBackward = await readPlayback(page);
    const returnedToPriorStep = before.summary?.match(/Step \d+ of \d+/i)?.[0] !== beforePrevious.summary?.match(/Step \d+ of \d+/i)?.[0]
      && before.summary?.match(/Step \d+ of \d+/i)?.[0] === afterBackward.summary?.match(/Step \d+ of \d+/i)?.[0];
    if (await next.count() && await next.isEnabled()) await next.click();
    const continueButton = page.getByRole("button", { name: /Continue/ }).first();
    await continueButton.waitFor({ state: "visible", timeout: 6000 }).catch(() => undefined);
    if (await continueButton.count() && await continueButton.isEnabled()) await continueButton.click();
    await page.waitForFunction(() => /Step 4 of 7/i.test(document.querySelector('[data-testid="guided-navigation-summary"]')?.innerText ?? ""), null, { timeout: 5000 }).catch(() => undefined);
    const afterContinue = await readPlayback(page);
    data.sequence.push({ action: "rapid Next, backward seek, then one Continue", before, duringSeek, nextDisabledDuringSeek,
      beforePrevious, previousEnabledAtTransition, reverseSamples, afterBackward, returnedToPriorStep, afterContinue,
      continueAdvancedSequentially: /Step 4 of 7/i.test(afterContinue.summary ?? "") });

    const playButton = page.getByRole("button", { name: "Resume navigation" });
    if (await playButton.count()) await playButton.click();
    await page.waitForTimeout(260);
    const pauseAgain = page.getByRole("button", { name: "Pause navigation" });
    if (await pauseAgain.count()) await pauseAgain.click();
    const beforeExplore = await readPlayback(page);
    await page.getByRole("button", { name: "Switch to Explore mode" }).click();
    const exploreState = await readPlayback(page);
    await page.getByRole("button", { name: "Switch to 3D view" }).click();
    await page.waitForTimeout(450);
    const threeD = await readPlayback(page);
    await page.getByRole("button", { name: "Switch to 2D view" }).click();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: "Return to Follow mode" }).click();
    const restored = await readPlayback(page);
    data.sequence.push({ action: "resume, pause, Explore, 2D/3D round trip, Follow", beforeExplore, exploreState, threeD, restored,
      exploreKeptStep: beforeExplore.summary?.match(/Step \d+ of \d+/)?.[0] === exploreState.summary?.match(/Step \d+ of \d+/)?.[0],
      followRestoredStep: beforeExplore.summary?.match(/Step \d+ of \d+/)?.[0] === restored.summary?.match(/Step \d+ of \d+/)?.[0] });

    const collapse = page.getByRole("button", { name: /Collapse navigation panel|Collapse route panel/ }).first();
    if (await collapse.count()) await collapse.click();
    const collapsedState = await readPlayback(page);
    const expand = page.getByRole("button", { name: /Expand navigation panel|Expand route panel/ }).first();
    if (await expand.count()) await expand.click();
    const expandedState = await readPlayback(page);
    data.sequence.push({ action: "collapse and expand panel", collapsedState, expandedState });

    await page.screenshot({ path: path.join(out, "canteen-caba201-playback-follow-2d.png") });
    const markersValid = data.sequence.every((entry) => !entry.after || entry.after.markerCount <= 1);
    const viewOnlyStateValid = data.sequence.some((entry) => entry.exploreKeptStep && entry.followRestoredStep);
    const sequenceValid = data.sequence.some((entry) => entry.returnedToPriorStep && entry.continueAdvancedSequentially);
    data.status = markersValid && viewOnlyStateValid && sequenceValid ? "PASS" : "FAIL";
  } catch (error) {
    data.error = String(error.stack ?? error);
    result.errors.push(`interaction audit: ${error.message}`);
    try { await page.screenshot({ path: path.join(out, "interaction-audit-failure.png") }); } catch {}
  } finally {
    await context.close();
  }
  result.interactionCase = data;
  fs.writeFileSync(path.join(out, "browser-audit-results.json"), JSON.stringify(result, null, 2));
}

async function buildingStartPlaybackAudit(browser) {
  const cases = [
    { label: "CABA building -> CABA-201", from: "CABA", selectFrom: "COLLEGE OF ACCOUNTANCY AND BUSINESS ADMINISTRATION", to: "CABA-201" },
    { label: "CABA-101 -> CABA-201", from: "CABA-101", to: "CABA-201" },
  ];
  const results = [];
  for (const routeCase of cases) {
    const { context, page } = await createPage(browser, { width: 1440, height: 900 }, "light");
    const data = { ...routeCase, status: "NOT VERIFIED" };
    try {
      await waitForMapReady(page);
      await page.getByRole("button", { name: "Open directions" }).click();
      const dialog = page.getByRole("dialog", { name: "Route planner" });
      await setEndpoint(dialog, "start", routeCase.from, routeCase.selectFrom ?? routeCase.from);
      await setEndpoint(dialog, "destination", routeCase.to);
      await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
      await page.getByTestId("route-summary").waitFor();
      data.preview = await dialog.innerText();
      data.routeReady = /Route ready from/i.test(data.preview);
      await dialog.getByRole("button", { name: "Start Navigation", exact: true }).click();
      const collapsedRoute = page.getByTestId("collapsed-route-card");
      data.collapsedPanelText = await collapsedRoute.count() ? await collapsedRoute.innerText() : null;
      const initialStep = data.collapsedPanelText?.match(/Step \d+ of \d+/i)?.[0] ?? null;
      data.initialStep = initialStep;
      data.startsAtFirstInstruction = /^Step 1 of \d+$/i.test(initialStep ?? "");
      if (routeCase.from === "CABA") {
        // A building origin should wait at its authored entrance for one real
        // Enter Building handoff before opening the indoor floor.
        const expand = page.getByRole("button", { name: /Expand navigation panel|Expand route panel/ }).first();
        if (await expand.count() && await expand.isVisible()) await expand.click();
      } else {
        // A room origin may have an informational zero-distance "Start at
        // door" row. Let that row settle, then pause on the first walking leg.
        await page.waitForTimeout(350);
        const pause = page.getByRole("button", { name: "Pause navigation" }).first();
        if (await pause.count() && await pause.isVisible() && await pause.isEnabled()) await pause.click();
        const expand = page.getByRole("button", { name: /Expand navigation panel|Expand route panel/ }).first();
        if (await expand.count() && await expand.isVisible()) await expand.click();
      }
      await page.getByTestId("guided-navigation-summary").waitFor();
      data.immediate = await readPlayback(page);
      await page.waitForTimeout(350);
      data.settled = await readPlayback(page);
      const immediateStep = data.immediate.summary?.match(/STEP \d+ OF \d+/i)?.[0] ?? null;
      const settledStep = data.settled.summary?.match(/STEP \d+ OF \d+/i)?.[0] ?? null;
      data.stepStayedStableBeforeInput = Boolean(immediateStep && immediateStep === settledStep);
      data.instruction = data.immediate.summary?.split("\n").map((line) => line.trim()).filter(Boolean).slice(-5) ?? [];
      if (routeCase.from === "CABA") {
        await page.screenshot({ path: path.join(out, "caba-building-start-step-1.png") });
        const continueButton = page.getByRole("button", { name: /^Continue$/ }).first();
        data.entryContinueAvailable = await continueButton.count() > 0;
        if (data.entryContinueAvailable && await continueButton.isEnabled()) {
          await continueButton.click();
          await page.waitForFunction(() => /STEP 2 OF/i.test(document.querySelector('[data-testid="guided-navigation-summary"]')?.innerText ?? ""), null, { timeout: 7000 }).catch(() => undefined);
        }
        data.afterEntryHandoff = await readPlayback(page);
        data.entryHandoffAdvancedOneStep = /STEP 2 OF/i.test(data.afterEntryHandoff.summary ?? "");
        data.indoorFloorOpened = data.afterEntryHandoff.floor !== null;
        await page.screenshot({ path: path.join(out, "caba-building-after-entry-step-2.png") });
        data.status = data.routeReady && data.startsAtFirstInstruction && data.stepStayedStableBeforeInput
          && data.entryContinueAvailable && data.entryHandoffAdvancedOneStep && data.indoorFloorOpened ? "PASS" : "FAIL";
      } else {
        data.originInstructionIsInformational = /Start at the door of CABA-101/i.test(data.collapsedPanelText ?? "");
        data.advancedToFirstWalkingInstruction = /Follow the indoor path to the Right Stair/i.test(data.settled.summary ?? "");
        data.status = data.routeReady && data.startsAtFirstInstruction && data.originInstructionIsInformational
          && data.advancedToFirstWalkingInstruction && data.settled.markerCount === 1 && data.settled.visibleRouteLineCount > 0
          && data.settled.floor !== null ? "PASS" : "FAIL";
        await page.screenshot({ path: path.join(out, "caba-room-to-room-first-walking-step.png") });
      }
    } catch (error) {
      data.error = String(error.stack ?? error);
      result.errors.push(`building start playback ${routeCase.label}: ${error.message}`);
    } finally {
      await context.close();
    }
    results.push(data);
  }
  result.buildingStartPlaybackCases = results;
  fs.writeFileSync(path.join(out, "browser-audit-results.json"), JSON.stringify(result, null, 2));
}

async function sosAudit(browser) {
  const { context, page } = await createPage(browser, { width: 1440, height: 900 }, "dark");
  const data = { origin: "CANTEEN building", expectedPublishedDestination: "Campus Gate fallback when no Assembly Point is assigned", status: "NOT VERIFIED" };
  try {
    await waitForMapReady(page);
    await page.getByRole("button", { name: "Open directions" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    const modeButton = dialog.getByRole("button", { name: "SOS routing", exact: true });
    await modeButton.click();
    data.sosModeSelected = await modeButton.getAttribute("aria-pressed") === "true";
    data.startOptionTexts = (await setEndpoint(dialog, "start", "CANTEEN")).options;
    await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByTestId("route-summary").waitFor({ timeout: 15000 }).catch(() => undefined);
    data.preview = await dialog.innerText();
    data.routeReady = await page.getByTestId("route-summary").count() > 0;
    data.fallbackNamed = /Campus Gate\s*[·|]\s*Fallback/i.test(data.preview);
    data.emergencyAlternatives = await page.getByTestId("emergency-route-selector").count();
    const blocker = page.getByTestId("emergency-route-status");
    data.blocker = await blocker.count() ? await blocker.first().innerText() : null;
    data.routeGeometry = await page.evaluate(() => [...document.querySelectorAll('[data-testid="remaining-route-line"]')].map((line) => line.getAttribute("points")));
    data.routeGeometryFinite = data.routeGeometry.every((points) => points && points.split(/\s+/).length >= 2 && points.split(/\s+/).every((pair) => pair.split(",").length === 2 && pair.split(",").every((value) => Number.isFinite(Number(value)))));
    if (data.routeReady) {
      await page.screenshot({ path: path.join(out, "sos-main-campus-preview.png") });
      data.status = data.fallbackNamed && data.routeGeometry.length > 0 && data.routeGeometryFinite
        ? "PASS — permitted Campus Gate fallback shown" : "FAIL";
    } else {
      data.status = data.blocker ? "BLOCKED BY CAMPUS DATA — honest unavailable state shown" : "NOT VERIFIED";
    }
  } catch (error) {
    data.error = String(error.stack ?? error);
    result.errors.push(`SOS audit: ${error.message}`);
    try { await page.screenshot({ path: path.join(out, "sos-audit-failure.png") }); } catch {}
  } finally {
    await context.close();
  }
  result.sosCase = data;
  fs.writeFileSync(path.join(out, "browser-audit-results.json"), JSON.stringify(result, null, 2));
}

async function viewportAudit(browser) {
  for (const width of [360, 390, 768, 1440]) {
    const { context, page } = await createPage(browser, { width, height: width < 500 ? 800 : 900 }, width === 390 ? "dark" : "light");
    const item = { width, status: "NOT VERIFIED" };
    try {
      await waitForMapReady(page);
      await page.getByRole("button", { name: "Open directions" }).click();
      const dialog = page.getByRole("dialog", { name: "Route planner" });
      await setEndpoint(dialog, "start", "CANTEEN");
      await setEndpoint(dialog, "destination", "CABA-201");
      await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
      await page.getByTestId("route-summary").waitFor();
      const expandPreview = page.getByRole("button", { name: "Expand route panel" });
      if (await expandPreview.count() && await expandPreview.isVisible()) await expandPreview.click();
      const startNavigation = dialog.getByRole("button", { name: "Start Navigation", exact: true }).first();
      await startNavigation.waitFor({ state: "visible" });
      await startNavigation.click();
      await holdAndExpandNavigation(page);
      await page.waitForTimeout(250);
      item.state = await readPlayback(page);
      item.floorControlCount = await page.getByRole("button", { name: /Floor|Ground Floor|G\/F/i }).count();
      item.modeToggleCount = await page.locator('button[aria-label="Switch to 2D view"],button[aria-label="Switch to 3D view"]').count();
      item.touchTargets = await page.evaluate(() => [...document.querySelectorAll('[data-testid="guided-navigation-summary"] button')].map((button) => {
        const r = button.getBoundingClientRect(); return { label: button.getAttribute("aria-label") ?? button.innerText.trim(), width: r.width, height: r.height };
      }));
      item.horizontalOverflow = item.state.documentWidth > item.state.viewportWidth;
      item.status = item.horizontalOverflow ? "FAIL" : "PASS";
      await page.screenshot({ path: path.join(out, `navigation-${width}-${width === 390 ? "dark" : "light"}.png`) });
    } catch (error) {
      item.error = String(error.stack ?? error);
      result.errors.push(`viewport ${width}: ${error.message}`);
      try { await page.screenshot({ path: path.join(out, `navigation-${width}-failure.png`) }); } catch {}
    } finally {
      await context.close();
    }
    result.viewportCases.push(item);
    fs.writeFileSync(path.join(out, "browser-audit-results.json"), JSON.stringify(result, null, 2));
  }
}

async function main() {
  const uiOnly = process.argv.includes("--ui-only");
  const interactionOnly = process.argv.includes("--interaction-only");
  const routesOnly = process.argv.includes("--routes-only");
  const retryCeit = process.argv.includes("--retry-ceit");
  const retryFailed = process.argv.includes("--retry-failed");
  const buildingStartPreview = process.argv.includes("--building-start-preview");
  const buildingStartPlayback = process.argv.includes("--building-start-playback");
  if (uiOnly || interactionOnly || retryCeit || routesOnly || retryFailed || buildingStartPreview || buildingStartPlayback) {
    const prior = JSON.parse(fs.readFileSync(path.join(out, "browser-audit-results.json"), "utf8"));
    result.routeCases = routesOnly ? [] : prior.routeCases ?? [];
    // Route cases are reused in these focused reruns, but browser/runtime
    // errors belong to one invocation. Keep the old list visible as history
    // instead of carrying a stale locator failure into a successful rerun.
    result.priorRunErrors = [...(prior.priorRunErrors ?? []), ...(prior.errors ?? [])];
    result.errors = [];
    if (routesOnly || retryFailed || buildingStartPreview || buildingStartPlayback) {
      result.interactionCase = prior.interactionCase ?? null;
      result.viewportCases = prior.viewportCases ?? [];
      result.sosCase = prior.sosCase ?? null;
      result.blockedWrites = prior.blockedWrites ?? [];
    }
    if (retryCeit) result.routeCases = result.routeCases.filter((item) => !(item.from === "CEIT" && item.to === "CABA"));
  }
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  try {
    if (buildingStartPlayback) {
      await buildingStartPlaybackAudit(browser);
    } else if (buildingStartPreview) {
      const targetCases = routePairs.filter((item) => item.from === "CABA" && ["CABA-201", "CABA-101"].includes(item.to));
      for (const routeCase of targetCases) {
        result.routeCases = result.routeCases.filter((item) => !(
          item.from === routeCase.from && item.to === routeCase.to && item.mode === routeCase.mode
          && item.selectFrom === routeCase.selectFrom && item.selectTo === routeCase.selectTo
        ));
        await planCase(browser, routeCase);
      }
    } else if (retryFailed) {
      const failedCases = result.routeCases.filter((item) => item.status === "FAIL" || item.status === "NOT VERIFIED");
      for (const routeCase of failedCases) {
        result.routeCases = result.routeCases.filter((item) => !(
          item.from === routeCase.from && item.to === routeCase.to && item.mode === routeCase.mode
          && item.preference === routeCase.preference && item.selectFrom === routeCase.selectFrom && item.selectTo === routeCase.selectTo
        ));
        const routeDefinition = routePairs.find((item) =>
          item.from === routeCase.from && item.to === routeCase.to && item.mode === routeCase.mode
          && (item.preference ?? item.mode) === (routeCase.preference ?? routeCase.mode)
          && item.selectFrom === routeCase.selectFrom && item.selectTo === routeCase.selectTo
        );
        await planCase(browser, routeDefinition ?? routeCase);
      }
    } else if (retryCeit) {
      const ceitRoute = routePairs.find((item) => item.from === "CEIT" && item.to === "CABA");
      if (ceitRoute) await planCase(browser, ceitRoute);
    } else if (!uiOnly && !interactionOnly) for (const routeCase of routePairs) await planCase(browser, routeCase);
    if (!routesOnly && !retryCeit && !retryFailed && !buildingStartPreview && !buildingStartPlayback) await interactionAudit(browser);
    if (!routesOnly && !interactionOnly && !retryCeit && !retryFailed && !buildingStartPreview && !buildingStartPlayback) {
      await sosAudit(browser);
      await viewportAudit(browser);
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, "browser-audit-results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
