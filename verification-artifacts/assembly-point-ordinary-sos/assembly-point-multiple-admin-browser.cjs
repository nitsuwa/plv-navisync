const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const base = "http://127.0.0.1:5174";
const out = path.resolve(process.env.AP_OUTPUT_DIR || "verification-artifacts/emergency-video-test-only");
const adminScenario = process.env.AP_ADMIN_SCENARIO || "midpoint";
const result = { isolation: "TEST ONLY in-memory editor copy; all remote writes denied", checks: {}, screenshots: [], browserErrors: [] };
const envText = fs.readFileSync(path.resolve(".env.local"), "utf8");
const envValue = (name) => {
  const line = envText.split(/\r?\n/).find((entry) => entry.trimStart().startsWith(`${name}=`));
  if (!line) throw new Error(`Missing ${name}`);
  return line.slice(line.indexOf("=") + 1).trim().replace(/^(\")(.*)\1$/, "$2").replace(/^'(.*)'$/, "$1");
};
const supabaseUrl = envValue("VITE_SUPABASE_URL");
const publishableKey = envValue("VITE_SUPABASE_PUBLISHABLE_KEY");
const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
const testAdmin = {
  id: "90000000-0000-4000-8000-000000000199",
  email: "test-admin@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "TEST ONLY Admin" },
  created_at: "2026-10-15T00:00:00.000Z",
};
const testSession = {
  access_token: "test-only-editor-token",
  refresh_token: "test-only-editor-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: testAdmin,
};

function json(route, value, status = 200) {
  return route.fulfill({ status, body: JSON.stringify(value), headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  } });
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const snapshotResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/list_event_safe_published_campuses`, {
    method: "POST", headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, "content-type": "application/json" }, body: "{}",
  });
  if (!snapshotResponse.ok) throw new Error(`Read-only snapshot request failed: ${snapshotResponse.status}`);
  const rows = await snapshotResponse.json();
  const originalRow = rows.find((row) => row?.snapshot?.campus?.code === "MAIN" && /MAIN CAMPUS - PLV/i.test(row.snapshot.campus.name));
  if (!originalRow) throw new Error("Read-only published MAIN CAMPUS - PLV snapshot not found");

  let testCampus = structuredClone(originalRow.snapshot.campus);
  const sourceCampusId = testCampus.id;
  const testCampusId = "90000000-0000-4000-8000-000000000198";
  const replaceCampusIds = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "campusId" && child === sourceCampusId) value[key] = testCampusId;
      else replaceCampusIds(child);
    }
  };
  replaceCampusIds(testCampus);
  testCampus.id = testCampusId;
  testCampus.name = "TEST ONLY - Isolated Assembly Point Editor";
  testCampus.code = "PLV-EDITOR-TEST";
  // The campus source is a read-only published snapshot, but this isolated
  // browser-local working copy must remain an unpublished draft throughout
  // Admin placement, review, save and reload checks.
  testCampus.publishStatus = "draft";
  testCampus.lifecycleStatus = "draft";
  testCampus.visibleToStudents = false;
  delete testCampus.publishedAt;
  testCampus.assemblyPoints = [];
  testCampus = JSON.parse(JSON.stringify(testCampus));
  const testBaseline = structuredClone(testCampus);

  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: storageKey, session: testSession });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    const pathname = url.pathname;
    const method = request.method().toUpperCase();
    if (pathname.endsWith("/auth/v1/user")) return json(route, testAdmin);
    if (/\/rest\/v1\/profiles(?:\?|$)/.test(pathname)) return json(route, { ...testAdmin, role: "admin", is_active: true });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } });
    if (pathname.endsWith("/rpc/list_event_safe_published_campuses") && method === "POST") return json(route, [{ snapshot: { campus: testCampus }, published_at: "2026-10-15T00:00:00.000Z" }]);
    if (pathname.endsWith("/rpc/list_published_campus_version_status") && method === "POST") return json(route, [{ campus_id: testCampus.id, latest_published_version_id: "TEST_ONLY", published_at: "2026-10-15T00:00:00.000Z" }]);
    if (pathname.endsWith("/rpc/list_coming_soon_campuses") && method === "POST") return json(route, []);
    // Keep every other remote read inside this browser fixture. The admin UI
    // may request unrelated campus/event lists while mounting; none should
    // escape to production data during this isolated acceptance run.
    if (pathname.includes("/rpc/")) return json(route, []);
    if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") return json(route, { message: "TEST ONLY write blocked by browser adapter" }, 403);
    return json(route, []);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => result.browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("ERR_BLOCKED_BY_CLIENT")) result.browserErrors.push(message.text().slice(0, 300)); });

  const mountEditor = async (campus, baseline, savedSnapshot = campus) => page.evaluate(async ({ campus, baseline, savedSnapshot }) => {
    const reactModule = await import("/node_modules/.vite/deps/react.js");
    const React = reactModule.default ?? reactModule;
    const reactDomModule = await import("/node_modules/.vite/deps/react-dom_client.js");
    const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
    if (typeof createRoot !== "function") throw new Error(`React createRoot unavailable: ${Object.keys(reactDomModule).join(",")}`);
    const { CampusEditor } = await import("/src/components/map-builder/CampusEditor.tsx");
    const { AuthProvider } = await import("/src/contexts/StudentAuthContext.tsx");
    const { UnsavedChangesProvider } = await import("/src/components/map-builder/UnsavedChangesContext.tsx");
    const draftStore = await import("/src/lib/campusDraftPersistence.ts");
    const rootElement = document.getElementById("test-admin-editor-root") ?? document.createElement("div");
    rootElement.id = "test-admin-editor-root";
    // Keep the real portaled ConfirmDialog above the editor canvas in this
    // isolated harness (the application dialog itself uses z-60).
    Object.assign(rootElement.style, { position: "fixed", inset: "0", zIndex: "50", background: "white", display: "flex", flexDirection: "column" });
    if (!rootElement.isConnected) document.body.append(rootElement);
    let saved = savedSnapshot;
    function Harness() {
      const [current, setCurrent] = React.useState(campus);
      React.useEffect(() => { window.__adminAcceptance = { campus: current, saved }; }, [current]);
      const update = (next, options) => {
        setCurrent(next);
        window.__adminAcceptance = { campus: next, saved: options?.persistAsBaseline ? next : saved };
        if (options?.persistAsBaseline) saved = next;
        draftStore.writeCampusDraft(next, baseline);
      };
      const save = async (next) => {
        sessionStorage.setItem("plv-test-only-admin-saved-campus", JSON.stringify(next));
        saved = next;
        return next;
      };
      return React.createElement(CampusEditor, {
        campus: current,
        onBack: () => {},
        onOpenFloor: () => {},
        onAddBuilding: () => {},
        onUpdate: update,
        onSave: save,
        onPublish: async () => current,
        onPreviewStudent: () => {},
        savedSnapshot: JSON.stringify(saved),
        publishedSnapshot: JSON.stringify(baseline),
      });
    }
    const root = createRoot(rootElement);
    window.__adminAcceptanceRoot?.unmount?.();
    window.__adminAcceptanceRoot = root;
    root.render(React.createElement(AuthProvider, null,
      React.createElement(UnsavedChangesProvider, null, React.createElement(Harness))));
    return true;
  }, { campus, baseline, savedSnapshot });

  try {
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.locator("#root").waitFor({ state: "attached" });
    // Choose a real, unowned, outdoor graph waypoint with a traversable authored edge.
    const selection = await page.evaluate(async ({ campus, scenario }) => {
      const nav = await import("/src/lib/navigationGraph.ts");
      const assembly = await import("/src/lib/emergencyAssemblyPoints.ts");
      const placement = await import("/src/lib/editorPlacement.ts");
      const nodes = nav.outdoorNavNodes(campus.navNodes ?? []);
      const edges = nav.outdoorNavEdges(campus.navEdges ?? [], nodes).filter((edge) => !edge.closed && edge.emergencySafe !== false && edge.type !== "room_door_transition" && edge.type !== "entrance_transition" && edge.type !== "floor_transition");
      const candidates = nodes.filter((node) => assembly.isOutdoorAssemblyGraphNode(node, campus.id)
        && !node.assemblyPointId && !node.gateId && !node.entranceId && !node.doorId && !node.floorId && !node.buildingId
        && !campus.buildings.some((building) => placement.pointInBuilding(building, node))
        && edges.some((edge) => edge.startNodeId === node.id || edge.endNodeId === node.id));
      const candidate = candidates[0];
      if (!candidate) throw new Error("No eligible existing outdoor waypoint/path edge in test snapshot");
      const edge = edges.find((item) => item.startNodeId === candidate.id || item.endNodeId === candidate.id);
      const edgeStart = nodes.find((node) => node.id === edge.startNodeId);
      const edgeEnd = nodes.find((node) => node.id === edge.endNodeId);
      const geometry = [edgeStart, ...(edge.bendPoints ?? []), edgeEnd].filter(Boolean);
      const segment = geometry.slice(1).map((to, index) => ({ from: geometry[index], to }))
        .sort((a, b) => Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) - Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y))[0];
      let target = scenario === "waypoint"
        ? { x: candidate.x, y: candidate.y }
        : segment ? { x: (segment.from.x + segment.to.x) / 2, y: (segment.from.y + segment.to.y) / 2 } : { x: candidate.x, y: candidate.y };
      if (scenario === "disconnected") {
        const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
        const nearbyOffsets = [
          [35, 0], [-35, 0], [0, 35], [0, -35], [35, 35], [35, -35], [-35, 35], [-35, -35],
          [50, 0], [-50, 0], [0, 50], [0, -50], [50, 50], [50, -50], [-50, 50], [-50, -50],
        ];
        const freePoint = nearbyOffsets.map(([dx, dy]) => ({ x: Math.round(candidate.x + dx), y: Math.round(candidate.y + dy) }))
          .find((point) => point.x >= 0 && point.y >= 0 && point.x <= campus.canvasW && point.y <= campus.canvasH
            && !campus.buildings.some((building) => placement.pointInBuilding(building, point))
            && !nav.findNavNodeAtPoint(nodes, point, 6)
            && !nav.findNavEdgeAtPoint(edges, nodeMap, point));
        if (!freePoint) throw new Error("No clear disconnected placement coordinate found beside the authored outdoor path");
        target = freePoint;
      }
      const pathId = candidate.generatedFromPathVertices?.[0]?.pathId;
      const sourcePath = campus.paths.find((path) => path.id === pathId);
      return {
        nodeId: candidate.id, x: target.x, y: target.y,
        sourceWaypoint: { x: candidate.x, y: candidate.y }, name: candidate.name,
        pathId: sourcePath?.id ?? null,
        sourcePathAttributes: sourcePath ? { type: sourcePath.type, color: sourcePath.color, width: sourcePath.width, locked: sourcePath.locked, pathNetworkId: sourcePath.pathNetworkId, pointCount: sourcePath.points.length, vertexCount: sourcePath.navigationVertexIds?.length ?? 0 } : null,
        sourceEdgeAttributes: { bidirectional: edge.bidirectional, accessible: edge.accessible, emergencySafe: edge.emergencySafe, closed: edge.closed, type: edge.type },
        incidentEdgeIds: edges.filter((item) => item.startNodeId === candidate.id || item.endNodeId === candidate.id).map((item) => item.id),
      };
    }, { campus: testCampus, scenario: adminScenario });
    result.selectedOutdoorAnchor = selection;
    await mountEditor(testCampus, testCampus);
    await page.getByRole("button", { name: "Assets", exact: true }).click();
    await page.getByTestId("asset-emergency-assembly-point").waitFor({ state: "visible" });
    result.checks.toolInObjectLibrary = await page.getByTestId("asset-emergency-assembly-point").isVisible();
    const libraryFile = path.join(out, "assembly-point-admin-object-library-1440.png");
    await page.screenshot({ path: libraryFile, fullPage: false }); result.screenshots.push(path.basename(libraryFile));
    await page.getByTestId("asset-emergency-assembly-point").click();
    const screenPoint = await page.evaluate(({ x, y }) => {
      const svg = [...document.querySelectorAll("svg")].find((item) => item.getAttribute("viewBox")?.startsWith("0 0 ") && item.getAttribute("viewBox")?.split(" ")[2] === String(window.__adminAcceptance.campus.canvasW));
      const group = svg?.querySelector("g[transform*='scale']");
      const matrix = group?.getScreenCTM();
      const point = matrix ? { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f } : null;
      return point ? { x: point.x, y: point.y } : null;
    }, selection);
    if (!screenPoint) throw new Error("Could not resolve the authored waypoint onto the actual editor canvas");
    await page.mouse.move(screenPoint.x, screenPoint.y);
    await page.getByTestId("assembly-point-placement-preview").waitFor({ state: "visible" });
    result.checks.snapPreview = {
      snapKind: await page.getByTestId("assembly-point-placement-preview").getAttribute("data-snap-kind"),
      label: await page.getByTestId("assembly-point-snap-label").innerText().catch(() => null),
    };
    const previewFile = path.join(out, "assembly-point-admin-placement-preview-1440.png");
    await page.screenshot({ path: previewFile, fullPage: false }); result.screenshots.push(path.basename(previewFile));
    if (adminScenario === "waypoint") {
      result.checks.waypointSnapPreview = {
        snapKind: await page.getByTestId("assembly-point-placement-preview").getAttribute("data-snap-kind"),
        label: await page.getByTestId("assembly-point-snap-label").innerText().catch(() => null),
      };
    } else if (adminScenario === "disconnected") {
      result.checks.disconnectedPlacementPreview = {
        snapKind: await page.getByTestId("assembly-point-placement-preview").getAttribute("data-snap-kind"),
        labelVisible: await page.getByTestId("assembly-point-snap-label").count() > 0,
        target: selection,
      };
    }
    const previewAnchor = await page.getByTestId("assembly-point-placement-preview").evaluate((preview) => {
      const matrix = preview.getScreenCTM();
      return matrix ? { x: matrix.e, y: matrix.f } : null;
    });
    if (!previewAnchor) throw new Error("Could not resolve the actual snapped placement preview on screen");
    await page.mouse.click(previewAnchor.x, previewAnchor.y);
    const properties = page.getByTestId("emergency-assembly-point-properties");
    await properties.waitFor({ state: "visible" });
    let point = await page.evaluate(() => window.__adminAcceptance.campus.assemblyPoints[0]);
    let campus = await page.evaluate(() => window.__adminAcceptance.campus);
    if (adminScenario === "waypoint") {
      const reusedNode = campus.navNodes.find((node) => node.id === point.navNodeId);
      result.checks.waypointReuse = {
        sameStableNodeId: point.navNodeId === selection.nodeId,
        linkedAssemblyIdentity: reusedNode?.assemblyPointId === point.id && reusedNode?.type === "assembly",
        connected: campus.navEdges.some((edge) => edge.startNodeId === point.navNodeId || edge.endNodeId === point.navNodeId),
        originalIncidentEdgesPreserved: selection.incidentEdgeIds.every((id) => campus.navEdges.some((edge) => edge.id === id)),
        pointAnchorCoordinatesMatch: reusedNode?.x === point.x && reusedNode?.y === point.y,
        status: await page.getByTestId("assembly-connection-status").innerText(),
      };
      const file = path.join(out, "assembly-point-admin-existing-waypoint-1440.png");
      await page.screenshot({ path: file, fullPage: false }); result.screenshots.push(path.basename(file));
      return;
    }
    if (adminScenario === "disconnected") {
      result.checks.disconnectedBeforeConnect = {
        pointCreated: Boolean(point?.id),
        linkedNodeHasNoIncidentEdge: !campus.navEdges.some((edge) => edge.startNodeId === point.navNodeId || edge.endNodeId === point.navNodeId),
        status: await page.getByTestId("assembly-connection-status").innerText(),
        connectActionVisible: await page.getByTestId("assembly-connect-pathway").isVisible(),
      };
      const disconnectedFile = path.join(out, "assembly-point-admin-disconnected-properties-1440.png");
      await page.screenshot({ path: disconnectedFile, fullPage: false }); result.screenshots.push(path.basename(disconnectedFile));
      await page.getByTestId("assembly-connect-pathway").click();
      const targetNode = page.locator(`[data-campus-nav-node-id="${selection.nodeId}"]`).first();
      await targetNode.waitFor({ state: "visible" });
      await targetNode.click();
      await page.waitForFunction(({ assemblyNodeId, targetNodeId }) => {
        const campus = window.__adminAcceptance?.campus;
        return campus?.navEdges?.some((edge) => (edge.startNodeId === assemblyNodeId && edge.endNodeId === targetNodeId)
          || (edge.startNodeId === targetNodeId && edge.endNodeId === assemblyNodeId));
      }, { assemblyNodeId: point.navNodeId, targetNodeId: selection.nodeId });
      campus = await page.evaluate(() => window.__adminAcceptance.campus);
      point = campus.assemblyPoints[0];
      const connectingEdges = campus.navEdges.filter((edge) => edge.startNodeId === point.navNodeId || edge.endNodeId === point.navNodeId);
      await page.getByTestId("campus-assembly-point").click();
      await page.getByTestId("assembly-connection-status").getByText("Connected").waitFor({ state: "visible" });
      result.checks.explicitConnection = {
        connected: connectingEdges.some((edge) => edge.startNodeId === selection.nodeId || edge.endNodeId === selection.nodeId),
        targetNodeId: selection.nodeId,
        connectionEdgeEndpoints: connectingEdges.map((edge) => [edge.startNodeId, edge.endNodeId]),
        noDanglingEdges: campus.navEdges.every((edge) => campus.navNodes.some((node) => node.id === edge.startNodeId) && campus.navNodes.some((node) => node.id === edge.endNodeId)),
        status: await page.getByTestId("assembly-connection-status").innerText(),
      };
      const connectedFile = path.join(out, "assembly-point-admin-explicit-connection-1440.png");
      await page.screenshot({ path: connectedFile, fullPage: false }); result.screenshots.push(path.basename(connectedFile));
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByText(/Saved successfully|Changes saved|Save complete/i).waitFor({ timeout: 5000 }).catch(() => {});
      const savedConnection = await page.evaluate(async ({ campusId, pointId, targetNodeId }) => {
        const persistence = await import("/src/lib/campusDraftPersistence.ts");
        const record = persistence.readCampusDraft(campusId)?.campus;
        const saved = JSON.parse(sessionStorage.getItem("plv-test-only-admin-saved-campus") || "null");
        const hasConnection = (campus) => {
          const point = campus?.assemblyPoints?.find((candidate) => candidate.id === pointId);
          return Boolean(point && campus.navEdges.some((edge) => (edge.startNodeId === point.navNodeId && edge.endNodeId === targetNodeId)
            || (edge.startNodeId === targetNodeId && edge.endNodeId === point.navNodeId)));
        };
        return { draftHasConnection: hasConnection(record), savedSnapshotHasConnection: hasConnection(saved) };
      }, { campusId: testCampusId, pointId: point.id, targetNodeId: selection.nodeId });
      result.checks.savedConnection = savedConnection;
      testCampus = await page.evaluate(() => window.__adminAcceptance.campus);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("#root").waitFor({ state: "attached" });
      const restoredDraft = await page.evaluate(async (baseline) => (await import("/src/lib/campusDraftPersistence.ts")).restoreCampusDraft(baseline), testBaseline);
      await mountEditor(restoredDraft, testBaseline, restoredDraft);
      await page.getByTestId("campus-editor-header").waitFor({ state: "visible" });
      await page.getByTestId("campus-assembly-point").waitFor({ state: "visible" });
      point = await page.evaluate(() => window.__adminAcceptance.campus.assemblyPoints[0]);
      campus = await page.evaluate(() => window.__adminAcceptance.campus);
      result.checks.reloadedConnection = {
        pointPersists: Boolean(point && point.navNodeId),
        targetEdgePersists: campus.navEdges.some((edge) => (edge.startNodeId === point.navNodeId && edge.endNodeId === selection.nodeId)
          || (edge.startNodeId === selection.nodeId && edge.endNodeId === point.navNodeId)),
        noDanglingEdges: campus.navEdges.every((edge) => campus.navNodes.some((node) => node.id === edge.startNodeId) && campus.navNodes.some((node) => node.id === edge.endNodeId)),
      };
      await page.getByTestId("campus-assembly-point").click();
      await page.getByTestId("assembly-connection-status").getByText("Connected").waitFor({ state: "visible" });
      const reloadedFile = path.join(out, "assembly-point-admin-explicit-connection-reloaded-1440.png");
      await page.screenshot({ path: reloadedFile, fullPage: false }); result.screenshots.push(path.basename(reloadedFile));
      return;
    }
    const pointNode = campus.navNodes.find((node) => node.id === point.navNodeId && node.assemblyPointId === point.id);
    const placementIncidentEdges = campus.navEdges.filter((edge) => edge.startNodeId === point.navNodeId || edge.endNodeId === point.navNodeId);
    const placedPath = campus.paths.find((path) => path.id === selection.pathId);
    result.checks.placed = {
      id: point.id,
      name: point.name,
      nodeId: point.navNodeId,
      x: point.x,
      y: point.y,
      reusesOutdoorWaypoint: point.navNodeId === selection.nodeId,
      connectedIncidentEdgeIds: campus.navEdges.filter((edge) => edge.startNodeId === point.navNodeId || edge.endNodeId === point.navNodeId).map((edge) => edge.id),
      pointNodeType: pointNode?.type,
      status: await page.getByTestId("assembly-connection-status").innerText(),
    };
    result.checks.pathSplitIntegrity = {
      sourcePathId: selection.pathId,
      insertedPathVertex: Boolean(placedPath && placedPath.points.length === (selection.sourcePathAttributes?.pointCount ?? 0) + 1
        && placedPath.navigationVertexIds?.length === placedPath.points.length),
      pathAttributesPreserved: Boolean(placedPath && selection.sourcePathAttributes
        && placedPath.type === selection.sourcePathAttributes.type
        && placedPath.color === selection.sourcePathAttributes.color
        && placedPath.width === selection.sourcePathAttributes.width
        && placedPath.locked === selection.sourcePathAttributes.locked
        && placedPath.pathNetworkId === selection.sourcePathAttributes.pathNetworkId),
      traversableSplitEdgeCount: placementIncidentEdges.length,
      routingAttributesPreserved: placementIncidentEdges.length === 2 && placementIncidentEdges.every((edge) =>
        edge.bidirectional === selection.sourceEdgeAttributes.bidirectional
        && edge.accessible === selection.sourceEdgeAttributes.accessible
        && edge.emergencySafe === selection.sourceEdgeAttributes.emergencySafe
        && edge.closed === selection.sourceEdgeAttributes.closed
        && edge.type === selection.sourceEdgeAttributes.type),
      noDuplicateOrZeroLengthEdges: new Set(placementIncidentEdges.map((edge) => edge.id)).size === placementIncidentEdges.length
        && placementIncidentEdges.every((edge) => Number.isFinite(edge.distance) && edge.distance > 0 && edge.startNodeId !== edge.endNodeId),
    };
    result.checks.undoRedoCreate = { available: await page.getByRole("button", { name: "Undo" }).isEnabled() };
    await page.getByRole("button", { name: "Undo" }).click();
    result.checks.undoRedoCreate.undoRemovedPoint = await page.getByTestId("campus-assembly-point").count() === 0;
    await page.getByRole("button", { name: "Redo" }).click();
    await page.getByTestId("campus-assembly-point").waitFor({ state: "visible" });
    await page.getByTestId("campus-assembly-point").click();
    point = await page.evaluate(() => window.__adminAcceptance.campus.assemblyPoints[0]);
    await page.getByTestId("assembly-point-name").fill("TEST ONLY - Admin Main Assembly Point A");
    await page.getByTestId("assembly-point-name").press("Enter");
    await page.getByRole("button", { name: /Assign CABA / }).click();
    result.checks.properties = {
      renamed: await page.getByTestId("assembly-point-name").inputValue(),
      assignmentVisible: await page.getByTestId("assembly-building-assignments").innerText().then((text) => text.includes("CABA")),
      connection: await page.getByTestId("assembly-connection-status").innerText(),
      reviewStatus: await page.getByTestId("assembly-review-status").innerText(),
    };
    if (process.env.AP_ADMIN_SCENARIO === "multiple") {
      const created = [{ id: point.id, name: "TEST ONLY - Admin Main Assembly Point A", expected: [{ code: "CABA", designation: "primary" }, { code: "SC", designation: "primary" }] }];
      const addAssignment = async (pointId, code, designation) => {
        const assign = page.getByRole("button", { name: new RegExp(`Assign ${code} `) }).first();
        const remove = page.getByRole("button", { name: new RegExp(`Remove ${code} `) }).first();
        const alreadyAssigned = await remove.count() > 0;
        let row = remove.locator("..");
        if (!alreadyAssigned) {
          await assign.click();
          await page.waitForFunction(({ pointId, code }) => {
            const campus = window.__adminAcceptance?.campus;
            const point = campus?.assemblyPoints?.find((item) => item.id === pointId);
            const building = campus?.buildings?.find((item) => item.code === code);
            return point?.buildingAssignments?.some((item) => item.buildingId === building?.id);
          }, { pointId, code });
          row = page.getByRole("button", { name: new RegExp(`Remove ${code} `) }).first().locator("..");
        }
        const assignment = await page.evaluate(({ pointId, code }) => {
          const campus = window.__adminAcceptance.campus;
          const point = campus.assemblyPoints.find((item) => item.id === pointId);
          const building = campus.buildings.find((item) => item.code === code);
          return point?.buildingAssignments?.find((item) => item.buildingId === building?.id)?.designation ?? null;
        }, { pointId, code });
        if (assignment !== designation) await row.getByRole("button", { name: designation === "primary" ? "Primary" : "Alternate", exact: true }).click();
      };
      await addAssignment(point.id, "SC", "primary");
      const placeOnFreeWaypoint = async (name, assignments) => {
        const existingPointIds = await page.evaluate(() => window.__adminAcceptance.campus.assemblyPoints.map((item) => item.id));
        await page.getByRole("button", { name: "Assets", exact: true }).click();
        const asset = page.getByTestId("asset-emergency-assembly-point");
        await asset.waitFor({ state: "visible" });
        await asset.click();
        const candidate = await page.evaluate(async () => {
          const campus = window.__adminAcceptance.campus;
          const nav = await import("/src/lib/navigationGraph.ts");
          const assembly = await import("/src/lib/emergencyAssemblyPoints.ts");
          const placement = await import("/src/lib/editorPlacement.ts");
          const nodes = nav.outdoorNavNodes(campus.navNodes ?? []);
          const edges = nav.outdoorNavEdges(campus.navEdges ?? [], nodes).filter((edge) => !edge.closed && edge.emergencySafe !== false && edge.type !== "room_door_transition");
          const svg = [...document.querySelectorAll("svg")].find((item) => item.getAttribute("viewBox")?.startsWith("0 0 ") && item.getAttribute("viewBox")?.split(" ")[2] === String(campus.canvasW));
          const matrix = svg?.querySelector("g[transform*='scale']")?.getScreenCTM();
          if (!matrix) return null;
          const incomingTraversable = (node) => edges.some((edge) =>
            edge.endNodeId === node.id || (edge.bidirectional && edge.startNodeId === node.id));
          const candidates = nodes.filter((node) => assembly.isOutdoorAssemblyGraphNode(node, campus.id)
            && !node.assemblyPointId && !node.buildingId
            && !campus.buildings.some((building) => placement.pointInBuilding(building, node))
            && incomingTraversable(node)
            && (campus.assemblyPoints ?? []).every((point) => Math.hypot(point.x - node.x, point.y - node.y) > 45))
            .map((node) => ({ node, screen: { x: matrix.a * node.x + matrix.c * node.y + matrix.e, y: matrix.b * node.x + matrix.d * node.y + matrix.f } }))
            .filter(({ screen }) => screen.x >= 300 && screen.x <= 960 && screen.y >= 150 && screen.y <= 800)
            .sort((left, right) => Math.abs(left.screen.x - 650) - Math.abs(right.screen.x - 650)
              || Math.abs(left.screen.y - 470) - Math.abs(right.screen.y - 470)
              || left.node.id.localeCompare(right.node.id));
          const selected = candidates[0]?.node;
          return selected ? { id: selected.id, x: selected.x, y: selected.y } : null;
        });
        if (!candidate) throw new Error(`No unused incoming-traversable outdoor waypoint for ${name}`);
        const screenPoint = await page.evaluate(({ x, y }) => {
          const svg = [...document.querySelectorAll("svg")].find((item) => item.getAttribute("viewBox")?.startsWith("0 0 ") && item.getAttribute("viewBox")?.split(" ")[2] === String(window.__adminAcceptance.campus.canvasW));
          const group = svg?.querySelector("g[transform*='scale']");
          const matrix = group?.getScreenCTM();
          return matrix ? { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f } : null;
        }, candidate);
        if (!screenPoint) throw new Error(`Could not map waypoint for ${name} to the editor canvas`);
        await page.mouse.move(screenPoint.x, screenPoint.y);
        await page.getByTestId("assembly-point-placement-preview").waitFor({ state: "visible" });
        await page.waitForFunction(({ x, y }) => {
          const preview = document.querySelector('[data-testid="assembly-point-placement-preview"]');
          const matrix = preview?.getScreenCTM?.();
          return Boolean(matrix && Math.hypot(matrix.e - x, matrix.f - y) <= 3);
        }, screenPoint, { timeout: 3500 });
        const marker = await page.getByTestId("assembly-point-placement-preview").evaluate((element) => {
          const matrix = element.getScreenCTM();
          return matrix ? { x: matrix.e, y: matrix.f } : null;
        });
        if (!marker) throw new Error(`No snapped canvas coordinate for ${name}`);
        result.checks[`placementAttempt-${name}`] = { candidate, screenPoint, marker, snapKind: await page.getByTestId("assembly-point-placement-preview").getAttribute("data-snap-kind") };
        await page.screenshot({ path: path.join(out, `placement-preview-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`), fullPage: false });
        // Click the actual SVG placement preview. It reflects the editor's
        // final snapped coordinates even when canvas zoom/pan or a side panel
        // changes between candidate selection and pointer movement.
        await page.mouse.click(marker.x, marker.y);
        await page.getByTestId("emergency-assembly-point-properties").waitFor({ state: "visible" });
        await page.waitForFunction((ids) => window.__adminAcceptance?.campus?.assemblyPoints?.some((item) => !ids.includes(item.id)), existingPointIds);
        const createdPoint = await page.evaluate((ids) => window.__adminAcceptance.campus.assemblyPoints.find((item) => !ids.includes(item.id)), existingPointIds);
        await page.getByTestId("assembly-point-name").fill(name);
        await page.getByTestId("assembly-point-name").press("Enter");
        for (const item of assignments) await addAssignment(createdPoint.id, item.code, item.designation);
        const savedPoint = await page.evaluate((id) => {
          const campus = window.__adminAcceptance.campus;
          const point = campus.assemblyPoints.find((item) => item.id === id);
          const node = campus.navNodes.find((item) => item.id === point?.navNodeId);
          return { point, node, incidentEdgeIds: campus.navEdges.filter((edge) => edge.startNodeId === point?.navNodeId || edge.endNodeId === point?.navNodeId).map((edge) => edge.id) };
        }, createdPoint.id);
        created.push({ id: savedPoint.point.id, name, expected: assignments, nodeId: savedPoint.node?.id, incidentEdgeIds: savedPoint.incidentEdgeIds });
      };
      await placeOnFreeWaypoint("TEST ONLY - East Gathering Area", [{ code: "COED", designation: "primary" }, { code: "CABA", designation: "alternate" }]);
      // Attempt the conflicting Primary assignment through the real Properties
      // controls. The campus has an existing TEST ONLY Primary for CABA, so the
      // Primary action on the East Gathering Area's CABA Alternate must be
      // unavailable and must leave the saved designation unchanged.
      const eastPoint = created.find((item) => item.name === "TEST ONLY - East Gathering Area");
      await page.locator(`[data-testid="campus-assembly-point"][data-assembly-point-id="${eastPoint.id}"]`).click();
      await page.getByTestId("emergency-assembly-point-properties").waitFor({ state: "visible" });
      const cabaRow = page.getByTestId("assembly-building-assignments").locator("div.flex.min-h-8").filter({ hasText: "CABA ·" });
      const conflictingPrimaryButton = cabaRow.getByRole("button", { name: "Primary", exact: true });
      const disabledBeforeAttempt = await conflictingPrimaryButton.isDisabled();
      let clickRejectedAsDisabled = false;
      try {
        await conflictingPrimaryButton.click({ timeout: 1000 });
      } catch (error) {
        clickRejectedAsDisabled = /disabled|not enabled/i.test(String(error));
      }
      const cabaDesignationAfterAttempt = await page.evaluate(({ pointId, code }) => {
        const campus = window.__adminAcceptance.campus;
        const point = campus.assemblyPoints.find((item) => item.id === pointId);
        const building = campus.buildings.find((item) => item.code === code);
        return point?.buildingAssignments?.find((item) => item.buildingId === building?.id)?.designation ?? null;
      }, { pointId: eastPoint.id, code: "CABA" });
      result.checks.conflictingPrimaryUIAttempt = {
        existingPrimaryAssignment: "TEST ONLY - Admin Main Assembly Point A / CABA",
        selectedAssignment: "TEST ONLY - East Gathering Area / CABA",
        primaryControlDisabled: disabledBeforeAttempt,
        clickRejectedAsDisabled,
        designationAfterAttempt: cabaDesignationAfterAttempt,
        repairAction: await conflictingPrimaryButton.getAttribute("title"),
      };
      if (!disabledBeforeAttempt || !clickRejectedAsDisabled || cabaDesignationAfterAttempt !== "alternate") {
        throw new Error(`Conflicting Primary UI guard failed: ${JSON.stringify(result.checks.conflictingPrimaryUIAttempt)}`);
      }
      await placeOnFreeWaypoint("TEST ONLY - Secondary Open Space", [{ code: "CABA", designation: "alternate" }, { code: "COED", designation: "alternate" }]);
      for (const item of created) {
        await page.locator(`[data-testid="campus-assembly-point"][data-assembly-point-id="${item.id}"]`).click();
        await page.getByTestId("emergency-assembly-point-properties").waitFor({ state: "visible" });
        if ((await page.getByTestId("assembly-review-status").innerText()).trim() !== "Approved") {
          await page.getByLabel("Campus safety personnel have confirmed this location for the assigned evacuation plan.").check();
          await page.getByTestId("assembly-point-approve").click();
          await page.getByText("Approved", { exact: true }).first().waitFor();
        }
      }
      const readyCampus = await page.evaluate(() => window.__adminAcceptance.campus);
      result.checks.multipleAssignments = created.map((item) => {
        const current = readyCampus.assemblyPoints.find((candidate) => candidate.id === item.id);
        const node = readyCampus.navNodes.find((candidate) => candidate.id === current?.navNodeId);
        return {
          id: current?.id,
          name: current?.name,
          anchorMatches: node?.id === current?.navNodeId && node?.x === current?.x && node?.y === current?.y,
          connected: readyCampus.navEdges.some((edge) => edge.startNodeId === current?.navNodeId || edge.endNodeId === current?.navNodeId),
          assignments: (current?.buildingAssignments ?? []).map((assignment) => ({ code: readyCampus.buildings.find((building) => building.id === assignment.buildingId)?.code, designation: assignment.designation })),
          review: current?.safetyReview?.status,
        };
      });
      result.checks.multipleAssignments.push({
        uniqueIds: new Set(readyCampus.assemblyPoints.map((item) => item.id)).size === 3,
        primaryConflicts: ["CABA", "COED", "SC"].filter((code) => readyCampus.assemblyPoints.filter((item) => item.buildingAssignments?.some((assignment) => assignment.buildingId === readyCampus.buildings.find((building) => building.code === code)?.id && assignment.designation === "primary")).length !== 1),
        alternateCountForCaba: readyCampus.assemblyPoints.filter((item) => item.buildingAssignments?.some((assignment) => assignment.buildingId === readyCampus.buildings.find((building) => building.code === "CABA")?.id && assignment.designation === "alternate")).length,
      });
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByText(/Saved successfully|Changes saved|Save complete/i).waitFor({ timeout: 5000 }).catch(() => {});
      const saved = await page.evaluate(async (campusId) => {
        const persistence = await import("/src/lib/campusDraftPersistence.ts");
        const savedCampus = JSON.parse(sessionStorage.getItem("plv-test-only-admin-saved-campus") || "null");
        return { draft: persistence.readCampusDraft(campusId)?.campus ?? null, saved: savedCampus };
      }, testCampusId);
      result.checks.multipleSave = {
        draftPointCount: saved.draft?.assemblyPoints?.length ?? 0,
        savedSnapshotPointCount: saved.saved?.assemblyPoints?.length ?? 0,
        campusRemainsUnpublished: saved.saved?.publishStatus === "draft" && saved.saved?.lifecycleStatus === "draft" && saved.saved?.visibleToStudents === false,
        allThreeApproved: saved.saved?.assemblyPoints?.length === 3 && saved.saved.assemblyPoints.every((item) => item.safetyReview?.status === "approved"),
        noDanglingEdges: saved.saved?.navEdges?.every((edge) => saved.saved.navNodes.some((node) => node.id === edge.startNodeId) && saved.saved.navNodes.some((node) => node.id === edge.endNodeId)) ?? false,
      };
      await page.screenshot({ path: path.join(out, "assembly-point-three-points-saved-1440.png"), fullPage: false });
      result.screenshots.push("assembly-point-three-points-saved-1440.png");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("#root").waitFor({ state: "attached" });
      const restoredDraft = await page.evaluate(async (baseline) => (await import("/src/lib/campusDraftPersistence.ts")).restoreCampusDraft(baseline), testBaseline);
      await mountEditor(restoredDraft, testBaseline);
      await page.getByTestId("campus-editor-header").waitFor({ state: "visible" });
      const reloaded = await page.evaluate(() => window.__adminAcceptance.campus);
      result.checks.multipleReload = {
        pointCount: reloaded.assemblyPoints.length,
        campusRemainsUnpublished: reloaded.publishStatus === "draft" && reloaded.lifecycleStatus === "draft" && reloaded.visibleToStudents === false,
        allApproved: reloaded.assemblyPoints.every((item) => item.safetyReview?.status === "approved"),
        names: reloaded.assemblyPoints.map((item) => item.name).sort(),
        connectedCount: reloaded.assemblyPoints.filter((point) => reloaded.navEdges.some((edge) => edge.startNodeId === point.navNodeId || edge.endNodeId === point.navNodeId)).length,
        noDanglingEdges: reloaded.navEdges.every((edge) => reloaded.navNodes.some((node) => node.id === edge.startNodeId) && reloaded.navNodes.some((node) => node.id === edge.endNodeId)),
      };
      fs.writeFileSync(path.join(out, "test-only-campus-saved.json"), JSON.stringify(reloaded));
      await page.screenshot({ path: path.join(out, "assembly-point-three-points-reloaded-1440.png"), fullPage: false });
      result.screenshots.push("assembly-point-three-points-reloaded-1440.png");

      // Exercise the real Admin Test Route panel against the saved/reloaded
      // draft. The default must resolve COED's Primary, while a reviewer can
      // explicitly choose an approved Alternate for a separate test scenario.
      await page.getByRole("button", { name: "Test Route", exact: true }).click();
      const routePanel = page.locator('[data-testid="test-route-full"]').first();
      await routePanel.waitFor({ state: "visible" });
      const startSearch = routePanel.locator('input[placeholder^="Search/select location"]').first();
      await startSearch.fill("ASSEMBLY HALL");
      const assemblyHallOption = routePanel.locator("[data-picker-option]").filter({ hasText: /ASSEMBLY HALL/i }).first();
      await assemblyHallOption.waitFor({ state: "visible" });
      await assemblyHallOption.click();
      await routePanel.getByRole("button", { name: "Emergency", exact: true }).click();
      const primaryCalculate = routePanel.getByRole("button", { name: "Calculate Route" });
      await primaryCalculate.click();
      await page.waitForFunction(() => {
        return Boolean(document.querySelector('[data-testid="test-route-compact"]'));
      });
      await page.getByRole("button", { name: "Expand Test Route" }).click();
      await routePanel.waitFor({ state: "visible" });
      const primaryRouteText = await routePanel.getByTestId("test-route-emergency-destination").innerText();
      const primaryEgressText = await routePanel.getByTestId("test-route-emergency-exit").innerText().catch(() => "");
      const primaryScreenshot = path.join(out, "assembly-point-admin-test-route-primary-1440.png");
      await page.screenshot({ path: primaryScreenshot, fullPage: false });
      result.screenshots.push(path.basename(primaryScreenshot));
      const alternateId = reloaded.assemblyPoints.find((point) => point.buildingAssignments?.some((assignment) =>
        assignment.buildingId === reloaded.buildings.find((building) => building.code === "COED")?.id
          && assignment.designation === "alternate"))?.id;
      let alternateRouteText = "";
      let alternateEgressText = "";
      if (alternateId) {
        const destinationPicker = routePanel.getByTestId("test-route-assembly-point-select");
        await destinationPicker.selectOption(alternateId);
        await routePanel.getByRole("button", { name: "Calculate Route" }).click();
        await page.waitForFunction(() => /Secondary Open Space/i.test(
          document.querySelector('[data-testid="test-route-full"] [data-testid="test-route-emergency-exit"]')?.textContent ?? "",
        ));
        alternateRouteText = await routePanel.getByTestId("test-route-emergency-destination").innerText();
        alternateEgressText = await routePanel.getByTestId("test-route-emergency-exit").innerText().catch(() => "");
        const alternateScreenshot = path.join(out, "assembly-point-admin-test-route-explicit-alternate-1440.png");
        await page.screenshot({ path: alternateScreenshot, fullPage: false });
        result.screenshots.push(path.basename(alternateScreenshot));
      }
      result.checks.adminTestRoute = {
        start: "COED Assembly Hall",
        defaultDestinationName: "TEST ONLY - East Gathering Area",
        primaryDestinationVisible: primaryRouteText.includes("East Gathering Area") && primaryEgressText.includes("East Gathering Area"),
        primaryRouteStatus: primaryEgressText || primaryRouteText,
        explicitAlternateId: alternateId ?? null,
        alternateDestinationVisible: alternateRouteText.includes("Secondary Open Space") && alternateEgressText.includes("Secondary Open Space"),
        alternateRouteStatus: alternateEgressText || alternateRouteText,
      };
      return;
    }
    const safetyAck = page.getByLabel("Campus safety personnel have confirmed this location for the assigned evacuation plan.");
    await safetyAck.check();
    const approve = page.getByTestId("assembly-point-approve");
    await approve.scrollIntoViewIfNeeded();
    await approve.click();
    await page.getByText("Approved", { exact: true }).first().waitFor();
    result.checks.review = { authorizedTestRole: "admin", approved: (await page.getByTestId("assembly-review-status").innerText()) === "Approved" };
    const propertiesFile = path.join(out, "assembly-point-admin-properties-approved-1440.png");
    await page.screenshot({ path: propertiesFile, fullPage: false }); result.screenshots.push(path.basename(propertiesFile));

    // Drag the selected linked marker; its waypoint and all actual incident edges must move together.
    point = await page.evaluate(() => window.__adminAcceptance.campus.assemblyPoints[0]);
    result.checks.move = {};
    const beforeMove = await page.evaluate(() => window.__adminAcceptance.campus.assemblyPoints[0]);
    const marker = page.getByTestId("campus-assembly-point");
    const dragGeometry = await marker.evaluate((element) => {
      const campus = window.__adminAcceptance.campus;
      const point = campus.assemblyPoints[0];
      const anchor = campus.navNodes.find((node) => node.id === point.navNodeId);
      const generatedRef = anchor?.generatedFromPathVertices?.[0];
      const path = generatedRef && campus.paths.find((candidate) => candidate.id === generatedRef.pathId);
      const circle = element.querySelector("circle");
      const matrix = circle?.getScreenCTM();
      const cx = circle ? Number(circle.getAttribute("cx")) : NaN;
      const cy = circle ? Number(circle.getAttribute("cy")) : NaN;
      return {
        point: { x: point.x, y: point.y },
        anchor: anchor && { id: anchor.id, x: anchor.x, y: anchor.y, generatedFromPathVertices: anchor.generatedFromPathVertices },
        ownerPath: path && { id: path.id, locked: path.locked, pointIndex: path.navigationVertexIds?.indexOf(generatedRef.vertexId) },
        screen: matrix ? { x: matrix.a * cx + matrix.c * cy + matrix.e, y: matrix.b * cx + matrix.d * cy + matrix.f } : null,
        svg: element.outerHTML,
      };
    });
    if (!dragGeometry.screen) throw new Error("Placed Assembly Point has no screen-space graph anchor for drag test");
    const markerScreen = dragGeometry.screen;
    result.checks.move.dragStartScreen = markerScreen;
    result.checks.move.dragGeometry = dragGeometry;
    await marker.scrollIntoViewIfNeeded();
    await page.mouse.move(markerScreen.x, markerScreen.y);
    await page.mouse.down();
    await page.mouse.move(markerScreen.x + 42, markerScreen.y - 31, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(({ x, y }) => {
      const point = window.__adminAcceptance?.campus?.assemblyPoints?.[0];
      return point && (point.x !== x || point.y !== y);
    }, beforeMove, { timeout: 3500 }).catch(() => {});
    const moved = await page.evaluate(() => window.__adminAcceptance.campus);
    const movedPoint = moved.assemblyPoints[0];
    result.checks.move.before = { x: beforeMove.x, y: beforeMove.y };
    result.checks.move.after = { x: movedPoint.x, y: movedPoint.y };
    result.checks.move.nodeAfter = moved.navNodes.find((node) => node.id === movedPoint.navNodeId);
    result.checks.move.ownerPathAfter = (() => {
      const ref = result.checks.move.nodeAfter?.generatedFromPathVertices?.[0];
      const owner = ref && moved.paths.find((candidate) => candidate.id === ref.pathId);
      return owner ? { id: owner.id, locked: owner.locked, pointIndex: owner.navigationVertexIds?.indexOf(ref.vertexId) } : null;
    })();
    await page.getByTestId("campus-assembly-point").click();
    await page.getByTestId("emergency-assembly-point-properties").waitFor({ state: "visible" });
    result.checks.move = {
      ...result.checks.move,
      changed: movedPoint.x !== beforeMove.x || movedPoint.y !== beforeMove.y,
      pointAndAnchorAligned: moved.navNodes.find((node) => node.id === movedPoint.navNodeId)?.x === movedPoint.x && moved.navNodes.find((node) => node.id === movedPoint.navNodeId)?.y === movedPoint.y,
      incidentEdgeCount: moved.navEdges.filter((edge) => edge.startNodeId === movedPoint.navNodeId || edge.endNodeId === movedPoint.navNodeId).length,
      reviewStatus: await page.getByTestId("assembly-review-status").innerText(),
    };
    await page.getByRole("button", { name: "Undo" }).click();
    result.checks.move.undoRestoredPosition = (await page.evaluate(() => window.__adminAcceptance.campus.assemblyPoints[0])).x === beforeMove.x
      && (await page.evaluate(() => window.__adminAcceptance.campus.assemblyPoints[0])).y === beforeMove.y;
    await page.getByRole("button", { name: "Redo" }).click();
    result.checks.move.redoRestoredMovedPosition = (await page.evaluate(() => window.__adminAcceptance.campus.assemblyPoints[0])).x === movedPoint.x;
    await page.getByTestId("campus-assembly-point").click();
    await page.getByTestId("emergency-assembly-point-properties").waitFor({ state: "visible" });
    if (await page.getByTestId("assembly-review-status").innerText().catch(() => "") !== "Approved") {
      await page.getByLabel("Campus safety personnel have confirmed this location for the assigned evacuation plan.").check().catch(() => {});
      if (await page.getByTestId("assembly-point-approve").isEnabled().catch(() => false)) await page.getByTestId("assembly-point-approve").click();
    }

    await page.getByRole("button", { name: "Save" }).click();
    await page.getByText(/Saved successfully|Changes saved|Save complete/i).waitFor({ timeout: 5000 }).catch(() => {});
    testCampus = await page.evaluate(() => window.__adminAcceptance.campus);
    const draftRecord = await page.evaluate(async (campus) => {
      const persistence = await import("/src/lib/campusDraftPersistence.ts");
      const record = persistence.readCampusDraft(campus.id);
      const saved = JSON.parse(sessionStorage.getItem("plv-test-only-admin-saved-campus") || "null");
      return { record, saved };
    }, testCampus);
    result.checks.save = {
      draftRecordHasPoint: draftRecord.record?.campus?.assemblyPoints?.some((item) => item.id === testCampus.assemblyPoints[0].id) ?? false,
      savedSnapshotHasPoint: draftRecord.saved?.assemblyPoints?.some((item) => item.id === testCampus.assemblyPoints[0].id) ?? false,
    };
    const savedCampusFile = path.join(out, "assembly-point-admin-saved-1440.png");
    await page.screenshot({ path: savedCampusFile, fullPage: false }); result.screenshots.push(path.basename(savedCampusFile));

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#root").waitFor({ state: "attached" });
    const restoredDraft = await page.evaluate(async (baseline) => (await import("/src/lib/campusDraftPersistence.ts")).restoreCampusDraft(baseline), testBaseline);
    await mountEditor(restoredDraft, testBaseline);
    await page.getByTestId("campus-editor-header").waitFor({ state: "visible" });
    await page.getByTestId("campus-assembly-point").waitFor({ state: "visible" });
    await page.getByTestId("campus-assembly-point").click();
    const reloadedCampus = await page.evaluate(() => window.__adminAcceptance.campus);
    const reloadedPoint = reloadedCampus.assemblyPoints[0];
    const reloadedAnchor = reloadedCampus.navNodes.find((node) => node.id === reloadedPoint.navNodeId);
    result.checks.reload = {
      pointCount: reloadedCampus.assemblyPoints.length,
      name: await page.getByTestId("assembly-point-name").inputValue(),
      connected: (await page.getByTestId("assembly-connection-status").innerText()).includes("Connected"),
      assignment: await page.getByTestId("assembly-building-assignments").innerText().then((text) => text.includes("CABA")),
      approval: await page.getByTestId("assembly-review-status").innerText(),
      pointAndAnchorAligned: reloadedAnchor?.x === reloadedPoint.x && reloadedAnchor?.y === reloadedPoint.y,
      incidentEdgeCount: reloadedCampus.navEdges.filter((edge) => edge.startNodeId === reloadedPoint.navNodeId || edge.endNodeId === reloadedPoint.navNodeId).length,
    };

    const reloadFile = path.join(out, "assembly-point-admin-reloaded-1440.png");
    await page.screenshot({ path: reloadFile, fullPage: false }); result.screenshots.push(path.basename(reloadFile));

    // Exercise the actual Properties confirmation and editor history after
    // reload. A Pathway-owned anchor should return to an ordinary junction;
    // deleting it must not orphan either endpoint or the authored walkway.
    await page.getByTestId("assembly-point-delete").click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete Emergency Assembly Point?" });
    await deleteDialog.waitFor({ state: "visible" });
    await deleteDialog.getByRole("button", { name: "Delete Point" }).click();
    await page.getByTestId("campus-assembly-point").waitFor({ state: "detached" });
    const deletedCampus = await page.evaluate(() => window.__adminAcceptance.campus);
    const deletedAnchor = deletedCampus.navNodes.find((node) => node.id === reloadedPoint.navNodeId);
    result.checks.delete = {
      pointRemoved: deletedCampus.assemblyPoints.length === 0,
      assignedBuildingsRemovedWithPoint: deletedCampus.assemblyPoints.every((item) => !item.buildingAssignments?.some((assignment) => assignment.buildingId === reloadedCampus.buildings.find((building) => building.code === "CABA")?.id)),
      pathAnchorRetainedAsWalkingPoint: deletedAnchor?.type === "outdoor" && !deletedAnchor.assemblyPointId,
      incidentEdgesPreserved: deletedCampus.navEdges.filter((edge) => edge.startNodeId === reloadedPoint.navNodeId || edge.endNodeId === reloadedPoint.navNodeId).length === result.checks.reload.incidentEdgeCount,
      noDanglingEdges: deletedCampus.navEdges.every((edge) => deletedCampus.navNodes.some((node) => node.id === edge.startNodeId) && deletedCampus.navNodes.some((node) => node.id === edge.endNodeId)),
    };
    await page.getByRole("button", { name: "Undo" }).click();
    await page.getByTestId("campus-assembly-point").waitFor({ state: "visible" });
    const restoredCampus = await page.evaluate(() => window.__adminAcceptance.campus);
    const restoredPoint = restoredCampus.assemblyPoints.find((item) => item.id === reloadedPoint.id);
    const restoredAnchor = restoredCampus.navNodes.find((node) => node.id === reloadedPoint.navNodeId);
    result.checks.delete.undoRestored = Boolean(restoredPoint && restoredAnchor?.type === "assembly"
      && restoredCampus.navEdges.filter((edge) => edge.startNodeId === restoredAnchor.id || edge.endNodeId === restoredAnchor.id).length === result.checks.reload.incidentEdgeCount);
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    try {
      const failure = path.join(out, "assembly-point-admin-browser-failure.png");
      await page.screenshot({ path: failure, fullPage: false }); result.screenshots.push(path.basename(failure));
    } catch {}
  } finally {
    result.browserErrors = [...new Set(result.browserErrors)];
    fs.writeFileSync(path.join(out, "assembly-point-admin-browser-results.json"), JSON.stringify(result, null, 2));
    await context.close();
    await browser.close();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
