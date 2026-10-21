import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import type { Campus } from "../../components/map-builder/types";
import { CampusPublicationOutcomeUncertainError, publishCampusVersion } from "../campusService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));
vi.mock("../campusStructureService", () => ({ serializeCampusStructure: vi.fn(() => ({})) }));

function makeCampus(id: string): Campus {
  return {
    id, name: "Test Campus", code: "TEST", description: "", address: "", city: "", province: "", postalCode: "",
    status: "active", publishStatus: "draft", visibleToStudents: false,
    features: { indoorNavigation: false, accessibilityNavigation: false, emergencyRoutes: false, issueReporting: false },
    canvasW: 900, canvasH: 680,
    settings: { accessibility: false, emergency: false, eventLayer: false, gps: false },
    buildings: [{
      id: "b1", name: "Main Hall", code: "MH", category: "academic", description: "", x: 0, y: 0, width: 200, height: 120, color: "#fff", visible: true,
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [{ id: "r1", name: "Lobby", type: "lobby", x: 0, y: 0, w: 20, h: 20, buildingId: "b1", floorId: "f1" }], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
    }],
    markers: [], paths: [], navNodes: [], navEdges: [], routes: [], accessibilityFeatures: [], assemblyPoints: [], eventOverlays: [], decorAssets: [],
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  } as Campus;
}

function setupClient() {
  let insertCount = 0;
  let latestPublishedId: string | null = null;
  let latestPublishedCampusId: string | null = null;
  let publishHandler: (versionId: string) => Promise<{ data: unknown; error: unknown }> = async (versionId) => {
    client.publishVersion(versionId);
    return { data: versionId, error: null };
  };
  const statusResults: Array<{ data: unknown; error: unknown }> = [];
  const versionRows: Array<{ id: string; campus_id: string; version_number: number }> = [];
  const from = vi.fn((table: string) => {
    if (table === "campus_versions") {
      return {
        select: () => ({ eq: () => ({ order: async () => ({ data: versionRows, error: null }) }) }),
        insert: (values: { campus_id: string; version_number: number }) => ({ select: () => ({ single: async () => {
          insertCount += 1;
          const row = { id: `version-${insertCount}`, campus_id: values.campus_id, version_number: values.version_number };
          versionRows.push(row);
          return { data: { id: row.id }, error: null };
        } }) }),
      };
    }
    if (table === "validation_runs") return { insert: async () => ({ error: null }) };
    throw new Error(`Unexpected table ${table}`);
  });
  const rpc = vi.fn(async (name: string, args?: { p_version_id?: string }) => {
    if (name === "publish_campus_version") return publishHandler(args?.p_version_id ?? "");
    if (name === "list_published_campus_version_status") {
      const next = statusResults.shift();
      if (next) return next;
      return { data: latestPublishedId ? [{ campus_id: latestPublishedCampusId, latest_published_version_id: latestPublishedId, published_at: "2026-10-20T12:00:00.000Z" }] : [], error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null }) }, from, rpc };
  vi.mocked(getSupabase).mockReturnValue(client as never);
  return {
    rpc,
    get insertCount() { return insertCount; },
    get latestPublishedId() { return latestPublishedId; },
    setPublishHandler(handler: typeof publishHandler) { publishHandler = handler; },
    addStatusResult(result: { data: unknown; error: unknown }) { statusResults.push(result); },
    publishVersion(id: string) {
      latestPublishedId = id;
      latestPublishedCampusId = versionRows.find((row) => row.id === id)?.campus_id ?? null;
    },
  };
}

const validation = { errors: 0, warnings: 0, passed: 4, total: 4 };

describe("publishCampusVersion operation safety", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deduplicates simultaneous publish submissions for one campus", async () => {
    const client = setupClient();
    let resolveRpc!: (result: { data: unknown; error: unknown }) => void;
    client.setPublishHandler((versionId) => new Promise((resolve) => { resolveRpc = resolve; }).then((result) => {
      if (!result.error) client.publishVersion(versionId);
      return result;
    }));
    const campus = makeCampus("dedupe-campus");
    const first = publishCampusVersion(campus, validation);
    const second = publishCampusVersion(campus, validation);

    await vi.waitFor(() => expect(client.rpc).toHaveBeenCalledWith("publish_campus_version", { p_version_id: "version-1" }));
    expect(client.insertCount).toBe(1);
    resolveRpc({ data: "version-1", error: null });
    const [resultA, resultB] = await Promise.all([first, second]);
    expect(resultA.publishStatus).toBe("published");
    expect(resultB.publishStatus).toBe("published");
    expect(client.insertCount).toBe(1);
    expect(client.rpc.mock.calls.filter(([name]) => name === "publish_campus_version")).toHaveLength(1);
  });

  it("reconciles a lost publish response against the authoritative current version", async () => {
    const client = setupClient();
    client.setPublishHandler(async (versionId) => {
      client.publishVersion(versionId);
      return { data: null, error: { message: "response lost" } };
    });

    const result = await publishCampusVersion(makeCampus("lost-response-campus"), validation);
    expect(result.publishStatus).toBe("published");
    expect(result.publishedAt).toBe("2026-10-20T12:00:00.000Z");
    expect(client.rpc.mock.calls.filter(([name]) => name === "publish_campus_version")).toHaveLength(1);
  });

  it("retains an uncertain operation and checks it before creating another version", async () => {
    const client = setupClient();
    client.setPublishHandler(async () => ({ data: null, error: { message: "connection reset" } }));
    client.addStatusResult({ data: null, error: { message: "status unavailable" } });
    const campus = makeCampus("uncertain-campus");

    await expect(publishCampusVersion(campus, validation)).rejects.toBeInstanceOf(CampusPublicationOutcomeUncertainError);
    expect(client.insertCount).toBe(1);

    client.publishVersion("version-1");
    const reconciled = await publishCampusVersion(campus, validation);
    expect(reconciled.publishStatus).toBe("published");
    expect(client.insertCount).toBe(1);
    expect(client.rpc.mock.calls.filter(([name]) => name === "publish_campus_version")).toHaveLength(1);
  });
});
