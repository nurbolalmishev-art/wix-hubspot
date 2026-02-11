import { COLLECTIONS, collectionId } from "./collections";
import { elevatedItems } from "./elevatedItems";

export type LedgerSource = "wix" | "hubspot";

export type SyncLedgerRecord = {
  connectionKey?: string;
  entityType: "contact";
  wixContactId?: string;
  hubspotContactId?: string;
  source: LedgerSource;
  correlationId: string;
  payloadHash: string;
  createdAtMs: number;
  expiresAtMs: number;
};

const DEFAULT_DEDUPE_TTL_MS = 2 * 60 * 1000;

export async function wasRecentlySynced(params: {
  entityType: "contact";
  source: LedgerSource;
  wixContactId?: string;
  hubspotContactId?: string;
  payloadHash: string;
  nowMs?: number;
}): Promise<boolean> {
  const now = params.nowMs ?? Date.now();
  let q = elevatedItems
    .query(collectionId(COLLECTIONS.syncLedger))
    .eq("entityType", params.entityType)
    .eq("source", params.source)
    .eq("payloadHash", params.payloadHash)
    .limit(10);

  if (params.wixContactId) {
    q = q.eq("wixContactId", params.wixContactId);
  }
  if (params.hubspotContactId) {
    q = q.eq("hubspotContactId", params.hubspotContactId);
  }

  const res = await q.find();
  for (const it of res.items) {
    const expiresAtMs =
      typeof it.expiresAtMs === "number" ? it.expiresAtMs : 0;
    if (expiresAtMs > now) {
      return true;
    }
  }
  return false;
}

export async function recordSync(params: {
  connectionKey?: string;
  entityType: "contact";
  wixContactId?: string;
  hubspotContactId?: string;
  source: LedgerSource;
  correlationId: string;
  payloadHash: string;
  ttlMs?: number;
}): Promise<void> {
  const now = Date.now();
  const ttl = params.ttlMs ?? DEFAULT_DEDUPE_TTL_MS;
  await elevatedItems.insert(collectionId(COLLECTIONS.syncLedger), {
    connectionKey: params.connectionKey,
    entityType: params.entityType,
    wixContactId: params.wixContactId,
    hubspotContactId: params.hubspotContactId,
    source: params.source,
    correlationId: params.correlationId,
    payloadHash: params.payloadHash,
    createdAtMs: now,
    expiresAtMs: now + ttl,
  } satisfies SyncLedgerRecord);
}

