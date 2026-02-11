import { items } from "@wix/data";
import { COLLECTIONS, collectionId } from "./collections";
import { elevatedItems } from "./elevatedItems";

export type StoredHubSpotConnection = {
  connectionKey: string;
  hubId?: number;
  scopes?: string[];
  tokenEnc?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAtMs?: number;
  createdAtMs: number;
  updatedAtMs: number;
  lastErrorCode?: string;
  lastErrorAtMs?: number;
};

type WixDataItem = items.WixDataItem;

function summarizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return { type: "string", length: v.length };
  if (typeof v === "number") return { type: "number", finite: Number.isFinite(v) };
  if (typeof v === "boolean") return { type: "boolean" };
  if (Array.isArray(v)) return { type: "array", length: v.length };
  if (typeof v === "object") return { type: "object", keys: Object.keys(v as Record<string, unknown>).slice(0, 20) };
  return { type: typeof v };
}

function summarizeAttempt(attempt: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attempt)) {
    out[k] = summarizeValue(v);
  }
  return out;
}

function toStored(item: WixDataItem): StoredHubSpotConnection | null {
  const connectionKey = typeof item.connectionKey === "string" ? item.connectionKey : null;
  const createdAtMs = typeof item.createdAtMs === "number" ? item.createdAtMs : null;
  const updatedAtMs = typeof item.updatedAtMs === "number" ? item.updatedAtMs : null;
  if (!connectionKey || createdAtMs === null || updatedAtMs === null) {
    return null;
  }
  const hubId =
    typeof item.hubId === "number"
      ? item.hubId
      : typeof item.hubId === "string"
        ? Number(item.hubId)
        : NaN;
  return {
    connectionKey,
    hubId: Number.isFinite(hubId) ? hubId : undefined,
    scopes: Array.isArray(item.scopes) ? (item.scopes as unknown[]).filter((x): x is string => typeof x === "string") : undefined,
    tokenEnc: typeof item.tokenEnc === "string" ? item.tokenEnc : undefined,
    accessToken: typeof (item as Record<string, unknown>).accessToken === "string" ? ((item as Record<string, unknown>).accessToken as string) : undefined,
    refreshToken: typeof (item as Record<string, unknown>).refreshToken === "string" ? ((item as Record<string, unknown>).refreshToken as string) : undefined,
    tokenExpiresAtMs: typeof item.tokenExpiresAtMs === "number" ? item.tokenExpiresAtMs : undefined,
    createdAtMs,
    updatedAtMs,
    lastErrorCode: typeof item.lastErrorCode === "string" ? item.lastErrorCode : undefined,
    lastErrorAtMs: typeof item.lastErrorAtMs === "number" ? item.lastErrorAtMs : undefined,
  };
}

export async function getConnectionByKey(
  connectionKey: string,
): Promise<{ _id: string; data: StoredHubSpotConnection } | null> {
  const res = await elevatedItems
    .query(collectionId(COLLECTIONS.connections))
    .eq("connectionKey", connectionKey)
    .limit(1)
    .find();
  const first = res.items.length > 0 ? res.items[0] : null;
  if (!first || typeof first._id !== "string") {
    return null;
  }
  const stored = toStored(first);
  if (!stored) {
    return null;
  }
  return { _id: first._id, data: stored };
}

export async function getConnectionByHubId(
  hubId: number,
): Promise<{ _id: string; data: StoredHubSpotConnection } | null> {
  for (const v of [hubId, String(hubId)] as const) {
    const res = await elevatedItems
      .query(collectionId(COLLECTIONS.connections))
      .eq("hubId", v as never)
      .limit(1)
      .find();
    const first = res.items.length > 0 ? res.items[0] : null;
    if (!first || typeof first._id !== "string") {
      continue;
    }
    const stored = toStored(first);
    if (!stored) {
      continue;
    }
    return { _id: first._id, data: stored };
  }
  return null;
}

export async function upsertConnection(
  connectionKey: string,
  patch: Partial<Omit<StoredHubSpotConnection, "connectionKey" | "createdAtMs" | "updatedAtMs">>,
): Promise<void> {
  const now = Date.now();
  const existing = await getConnectionByKey(connectionKey);
  const base = {
    connectionKey,
    createdAtMs: existing ? existing.data.createdAtMs : now,
    updatedAtMs: now,
  };

  const attempts: Array<Record<string, unknown>> = [];
  const errors: Array<{
    op: "insert" | "update";
    attemptIndex: number;
    wixErrorMessage: string;
    attemptSummary: Record<string, unknown>;
  }> = [];

  attempts.push({ ...base, ...patch });

  const patchObj: Record<string, unknown> = { ...patch };
  if (typeof patchObj.tokenEnc === "string") {
    try {
      const parsed = JSON.parse(patchObj.tokenEnc) as unknown;
      if (parsed && typeof parsed === "object") {
        patchObj.tokenEnc = parsed;
      }
    } catch {}
  }
  attempts.push({ ...base, ...patchObj });

  const patch2: Record<string, unknown> = { ...patch };
  if (typeof patch2.hubId === "number") {
    patch2.hubId = String(patch2.hubId);
  }
  if (Array.isArray(patch2.scopes)) {
    patch2.scopes = (patch2.scopes as unknown[]).filter((x): x is string => typeof x === "string").join(" ");
  }
  attempts.push({ ...base, ...patch2 });

  const minimal: Record<string, unknown> = {
    tokenEnc: (patch as Record<string, unknown>).tokenEnc,
    tokenExpiresAtMs: (patch as Record<string, unknown>).tokenExpiresAtMs,
    hubId: (patch2 as Record<string, unknown>).hubId,
  };
  attempts.push({ ...base, ...minimal });

  for (const attemptRaw of attempts) {
    const attempt = Object.fromEntries(
      Object.entries(attemptRaw).filter(([, v]) => v !== undefined),
    );
    try {
      if (existing) {
        await elevatedItems.update(collectionId(COLLECTIONS.connections), {
          _id: existing._id,
          ...attempt,
        });
        return;
      }
      await elevatedItems.insert(collectionId(COLLECTIONS.connections), attempt);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("WDE0053")) {
        throw err;
      }
      errors.push({
        op: existing ? "update" : "insert",
        attemptIndex: errors.length + 1,
        wixErrorMessage: msg,
        attemptSummary: summarizeAttempt(attempt),
      });
    }
  }

  const compact = JSON.stringify(errors).slice(0, 1500);
  throw new Error(
    `WDE0053: Failed to write hubspot_connections after retries. ` +
      `Most likely: missing collection / wrong collection ID / schema mismatch / permissions. ` +
      `attempts=${compact}`,
  );
}

export async function clearConnection(connectionKey: string): Promise<void> {
  const existing = await getConnectionByKey(connectionKey);
  if (!existing) {
    return;
  }
  await elevatedItems.update(collectionId(COLLECTIONS.connections), {
    _id: existing._id,
    connectionKey,
    tokenEnc: null,
    accessToken: null,
    refreshToken: null,
    tokenExpiresAtMs: null,
    scopes: null,
    hubId: null,
    updatedAtMs: Date.now(),
    createdAtMs: existing.data.createdAtMs,
  });
}

