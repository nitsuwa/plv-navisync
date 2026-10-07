// Read-only regular-student browser verification against currently published event data.
import fs from "node:fs";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
const { chromium } = createRequire(import.meta.url)("C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const output = "docs/verification/create-event-2026-10-04-browser/evidence/student-published-events-ui";
fs.mkdirSync(output, { recursive: true });
const report = {
  commit: "4ea2618",
  role: "regular student",
  dataMode: "read-only; existing published event data only",
  viewport: { width: 1440, height: 900 },
  filters: [],
  pageErrors: [],
  failure: null,
};
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function panelReady(panel) {
  await panel.waitFor();
  await panel.getByRole("group", { name: "Filter events", exact: true }).waitFor();
  await panel.getByText(/Loading published events/).waitFor({ state: "hidden" });
}

try {
  const login = await client.auth.signInWithPassword({
    email: env.VITE_DEMO_STUDENT_EMAIL,
    password: env.VITE_DEMO_STUDENT_PASSWORD,
  });
  assert(!login.error && login.data.session, "Existing regular-student sign-in failed");

  const context = await browser.newContext({ viewport: report.viewport });
  const projectRef = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: `sb-${projectRef}-auth-token`,
    session: login.data.session,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:5173/map");

  const openButton = page.getByRole("button", { name: "Open event map", exact: true });
  await openButton.waitFor({ timeout: 60000 });
  await openButton.click();
  const panel = page.getByRole("region", { name: "Campus events", exact: true });
  await panelReady(panel);

  for (const filter of [
    { id: "all", label: "All", screenshot: "student-events-all.png" },
    { id: "ongoing", label: "Ongoing", screenshot: "student-events-ongoing.png" },
    { id: "upcoming", label: "Upcoming", screenshot: "student-events-upcoming.png" },
  ]) {
    const button = panel.getByRole("button", { name: filter.label, exact: true });
    await button.click();
    assert(await button.getAttribute("aria-pressed") === "true", `${filter.label} filter did not become active`);
    const cards = panel.locator("ul.space-y-2 > li");
    const count = await cards.count();
    const emptyMessage = await panel.locator(".border-dashed").innerText().catch(() => null);
    report.filters.push({
      filter: filter.id,
      count,
      titles: count ? await cards.locator("button").allInnerTexts() : [],
      emptyMessage,
      resultText: await panel.innerText(),
    });
    await page.screenshot({ path: `${output}/${filter.screenshot}`, fullPage: false });
  }

  await panel.getByRole("button", { name: "All", exact: true }).click();
  const allCards = panel.locator("ul.space-y-2 > li");
  if (await allCards.count() > 0) {
    const firstCard = allCards.first().getByRole("button");
    report.selectedTitle = (await firstCard.locator("span span").first().innerText()).trim();
    await firstCard.click();
    await panel.getByText("Event map preview", { exact: true }).waitFor();
    await panel.getByText(/Event locations \(\d+\)/).waitFor();
    report.detailText = await panel.innerText();
    const viewLocation = panel.getByRole("button", { name: /View$/ }).first();
    report.locationActionAvailable = await viewLocation.count() === 1;
    await page.screenshot({ path: `${output}/student-event-detail.png`, fullPage: false });
  } else {
    report.positiveEventSelection = "NOT TESTABLE: All returned zero currently published events";
  }

  assert(report.pageErrors.length === 0, `Browser page errors: ${report.pageErrors.join(" | ")}`);
  report.status = report.filters.every((item) => item.count === 0)
    ? "PASS empty-state and filter controls only; positive event visibility not testable because no published events are returned"
    : "PASS current published event cards, filters, and detail selection";
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  report.status = "FAIL";
  process.exitCode = 1;
} finally {
  await browser.close();
  await client.auth.signOut({ scope: "local" });
  fs.writeFileSync(`${output}/student-published-events-ui.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, filters: report.filters.map(({ filter, count, emptyMessage }) => ({ filter, count, emptyMessage })), selectedTitle: report.selectedTitle ?? null, failure: report.failure }));
}
