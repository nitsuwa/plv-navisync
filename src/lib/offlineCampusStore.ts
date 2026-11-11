import type { Campus } from "../components/map-builder/types";
import type { PublishedEmergencyVideo } from "../services/emergencyEvacuationVideoService";

const DATABASE_NAME = "plv-navisync-offline";
const DATABASE_VERSION = 1;
const CAMPUS_STORE = "published-campuses";
const MEDIA_STORE = "published-media";
const PACKAGE_SCHEMA_VERSION = 1;

export interface OfflineCampusPackage {
  campusId: string;
  campusName: string;
  versionId: string;
  publishedAt: string | null;
  downloadedAt: string;
  schemaVersion: number;
  sizeBytes: number;
  campus: Campus;
}

export interface OfflineVideoPackage {
  key: string;
  campusId: string;
  videoId: string;
  roomId: string;
  routeFingerprint: string;
  updatedAt: string;
  sizeBytes: number;
  mimeType: "video/mp4";
  fileName: string;
  video: Blob;
  captions: Blob | null;
  captionsMimeType: string | null;
  metadata?: Omit<PublishedEmergencyVideo, "playbackUrl" | "downloadUrl" | "captionsUrl">;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Offline storage is not supported by this browser."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CAMPUS_STORE)) db.createObjectStore(CAMPUS_STORE, { keyPath: "campusId" });
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not be opened."));
    request.onblocked = () => reject(new Error("Offline storage is busy in another NaviSync tab. Close the other tab and retry."));
  });
}

function transact<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = run(transaction.objectStore(storeName));
    let result: T;
    let requestComplete = false;
    request.onsuccess = () => { result = request.result; requestComplete = true; };
    request.onerror = () => reject(request.error ?? new Error("Offline storage request failed."));
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error("Offline storage transaction was interrupted."));
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Offline storage transaction failed."));
    };
    transaction.oncomplete = () => {
      db.close();
      if (requestComplete) resolve(result!);
      else reject(new Error("Offline storage transaction completed without a result."));
    };
  }));
}

function validatePublicCampus(campus: Campus): void {
  if (!campus || typeof campus.id !== "string" || !campus.id || typeof campus.name !== "string"
    || !Array.isArray(campus.buildings) || !Array.isArray(campus.markers) || !Array.isArray(campus.paths)) {
    throw new Error("This published campus snapshot is incomplete and cannot be saved offline.");
  }
  const nodes = campus.navNodes ?? [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const brokenEdge = (campus.navEdges ?? []).find((edge) => !nodeIds.has(edge.startNodeId) || !nodeIds.has(edge.endNodeId));
  if (brokenEdge) throw new Error("This campus has an incomplete navigation graph. The offline map was not replaced.");
}

export async function saveOfflineCampus(campus: Campus, versionId?: string): Promise<OfflineCampusPackage> {
  validatePublicCampus(campus);
  const publishedAt = campus.publishedAt ?? null;
  const serializedSize = new Blob([JSON.stringify(campus)]).size;
  const storage = navigator.storage;
  const estimate = await storage?.estimate?.().catch(() => undefined);
  const remaining = estimate?.quota !== undefined && estimate.usage !== undefined
    ? estimate.quota - estimate.usage
    : undefined;
  if (remaining !== undefined && serializedSize > remaining) {
    throw new Error("There is not enough device storage for this campus map. Remove another offline map and retry.");
  }
  await storage?.persist?.().catch(() => false);
  const record: OfflineCampusPackage = {
    campusId: campus.id,
    campusName: campus.name,
    versionId: versionId ?? publishedAt ?? campus.databaseUpdatedAt ?? campus.updatedAt,
    publishedAt,
    downloadedAt: new Date().toISOString(),
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    sizeBytes: serializedSize,
    campus,
  };
  await transact(CAMPUS_STORE, "readwrite", (store) => store.put(record));
  return record;
}

export async function listOfflineCampusPackages(): Promise<OfflineCampusPackage[]> {
  const records = await transact<OfflineCampusPackage[]>(CAMPUS_STORE, "readonly", (store) => store.getAll()).catch(() => []);
  return records.filter((record) => record?.schemaVersion === PACKAGE_SCHEMA_VERSION
    && record.campusId === record.campus?.id
    && typeof record.versionId === "string");
}

export async function removeOfflineCampus(campusId: string): Promise<void> {
  await transact(CAMPUS_STORE, "readwrite", (store) => store.delete(campusId));
}

export async function getOfflineVideo(key: string): Promise<OfflineVideoPackage | null> {
  const record = await transact<OfflineVideoPackage | undefined>(MEDIA_STORE, "readonly", (store) => store.get(key)).catch(() => undefined);
  return record?.video instanceof Blob ? record : null;
}

export async function saveOfflineVideo(record: OfflineVideoPackage): Promise<void> {
  await transact(MEDIA_STORE, "readwrite", (store) => store.put(record));
}

export async function removeOfflineVideo(key: string): Promise<void> {
  await transact(MEDIA_STORE, "readwrite", (store) => store.delete(key));
}

export async function hasOfflineVideo(key: string): Promise<boolean> {
  return Boolean(await getOfflineVideo(key));
}

export function offlineVideoKey(campusId: string, videoId: string): string {
  return `${campusId}:${videoId}`;
}

export function formatOfflineBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
