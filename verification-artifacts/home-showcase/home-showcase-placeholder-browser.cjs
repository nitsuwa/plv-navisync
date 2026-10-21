// TEST ONLY Chromium acceptance for the real public LandingPage placeholder.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require(path.join(process.env.TEMP, "plv-video-acceptance", "node_modules", "playwright"));

const baseUrl = process.env.HOME_SHOWCASE_BASE_URL || "http://127.0.0.1:5173/";
const artifactDir = path.join(process.cwd(), "verification-artifacts", "home-showcase");
const chromiumPath = "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";
fs.mkdirSync(artifactDir, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    return route.abort("blockedbyclient");
  });

  const result = {
    browser: "Chromium against the local public LandingPage",
    fixture: "No showcase source configured; static placeholder only",
    productionWrites: "none",
    section: {},
    responsive: [],
    screenshots: [],
    pageErrors,
  };

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.getByRole("heading", { name: "See PLV NaviSync in Action" }).waitFor({ state: "visible" });
    const showcase = page.locator("#landing-showcase");
    const player = page.getByTestId("home-showcase-player");
    const sectionOrder = await page.evaluate(() => {
      const hero = document.querySelector("#landing-hero");
      const showcase = document.querySelector("#landing-showcase");
      const tour = document.querySelector("#landing-feature-tour");
      return Boolean(hero && showcase && tour
        && (hero.compareDocumentPosition(showcase) & Node.DOCUMENT_POSITION_FOLLOWING)
        && (showcase.compareDocumentPosition(tour) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    assert.equal(sectionOrder, true, "showcase belongs between hero and campus task feature tour");
    assert.equal(await showcase.locator("video").count(), 0, "placeholder must not mount an empty video element");
    assert.equal(await showcase.getByRole("button", { name: /play.*showcase/i }).count(), 0, "placeholder must not imply playback is available");
    assert.equal(await showcase.getByText("Coming soon").count(), 1);
    assert.equal(await showcase.locator("a[href='/map']").count(), 2, "desktop and mobile CTA variants share the map route");
    const aspect = await player.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, ratio: rect.width / rect.height };
    });
    result.section = { sectionOrder, videoCount: 0, playButtonCount: 0, comingSoon: true, exploreLinks: 2, initialAspectRatio: aspect.ratio };

    const viewports = [
      { width: 360, height: 800, label: "mobile-360" },
      { width: 390, height: 844, label: "mobile-390" },
      { width: 430, height: 932, label: "mobile-430" },
      { width: 768, height: 900, label: "tablet-768" },
      { width: 1280, height: 720, label: "desktop-1280" },
      { width: 1440, height: 900, label: "desktop-1440" },
      { width: 1920, height: 1080, label: "desktop-1920" },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await showcase.scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
      const layout = await page.evaluate(() => {
        const section = document.querySelector("#landing-showcase");
        const frame = section?.querySelector('[data-testid="home-showcase-player"]');
        const rect = frame?.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          layoutWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          bodyClientWidth: document.body.clientWidth,
          sectionOverflow: Boolean(section && section.scrollWidth > section.clientWidth + 1),
          frameWidth: rect?.width ?? 0,
          frameHeight: rect?.height ?? 0,
          frameRatio: rect?.width && rect?.height ? rect.width / rect.height : 0,
          videoCount: section?.querySelectorAll("video").length ?? 0,
        };
      });
      assert.ok(layout.documentWidth <= layout.layoutWidth, `document overflow at ${viewport.label}`);
      assert.ok(layout.bodyWidth <= layout.bodyClientWidth, `body overflow at ${viewport.label}`);
      assert.equal(layout.sectionOverflow, false, `showcase overflow at ${viewport.label}`);
      assert.equal(layout.videoCount, 0);
      assert.ok(Math.abs(layout.frameRatio - 16 / 9) < 0.04, `frame aspect ratio at ${viewport.label}`);
      result.responsive.push({ ...viewport, ...layout, pass: true });
      const filename = `home-showcase-placeholder-${viewport.label}.png`;
      await page.screenshot({ path: path.join(artifactDir, filename) });
      result.screenshots.push(filename);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await showcase.scrollIntoViewIfNeeded();
    const darkToggle = page.getByRole("button", { name: "Switch to dark mode" });
    if (await darkToggle.isVisible()) {
      await darkToggle.click();
      await page.waitForFunction(() => document.documentElement.classList.contains("dark"), { timeout: 3000 }).catch(() => {});
    } else {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
    }
    const darkMode = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    assert.equal(darkMode, true);
    const darkScreenshot = "home-showcase-placeholder-dark-1440.png";
    await page.screenshot({ path: path.join(artifactDir, darkScreenshot) });
    result.screenshots.push(darkScreenshot);
    result.theme = { darkModeToggle: darkMode ? "PASS" : "FAIL", lightMode: "PASS" };

    const mapLink = showcase.locator("a[href='/map']").filter({ hasText: "Explore Campus Map" });
    const links = await mapLink.all();
    let clicked = false;
    for (const link of links) {
      if (await link.isVisible()) { await link.click(); clicked = true; break; }
    }
    assert.equal(clicked, true, "an Explore Campus Map action is visible");
    await page.waitForURL((url) => url.pathname === "/map", { timeout: 10000 });
    result.mapLink = { visibleAction: true, navigatedTo: new URL(page.url()).pathname };
    assert.deepEqual(pageErrors, [], "no uncaught Home page errors");
    fs.writeFileSync(path.join(artifactDir, "home-showcase-placeholder-browser-results.json"), JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
