import { items } from "@wix/data";
import { COLLECTIONS, collectionId } from "./collections";
import { elevatedItems } from "./elevatedItems";

export type ContactIdMapRecord = {
  connectionKey: string;
  wixContactId: string;
  hubspotContactId: string;
  createdAtMs: number;
};

function toRecord(it: items.WixDataItem): ContactIdMapRecord | null {
  const connectionKey = typeof it.connectionKey === "string" ? it.connectionKey : null;
  const wixContactId = typeof it.wixContactId === "string" ? it.wixContactId : null;
  const hubspotContactId = typeof it.hubspotContactId === "string" ? it.hubspotContactId : null;
  const createdAtMs = typeof it.createdAtMs === "number" ? it.createdAtMs : Date.now();
  if (!connectionKey || !wixContactId || !hubspotContactId) return null;
  return { connectionKey, wixContactId, hubspotContactId, createdAtMs };
}

export async function getMapByWixContactId(params: {
  connectionKey: string;
  wixContactId: string;
}): Promise<{ _id: string; data: ContactIdMapRecord } | null> {
  const res = await elevatedItems
    .query(collectionId(COLLECTIONS.contactIdMap))
    .eq("connectionKey", params.connectionKey)
    .eq("wixContactId", params.wixContactId)
    .limit(1)
    .find();
  const first = res.items[0];
  if (!first || typeof first._id !== "string") return null;
  const rec = toRecord(first);
  if (!rec) return null;
  return { _id: first._id, data: rec };
}

export async function getMapByHubspotContactId(params: {
  connectionKey: string;
  hubspotContactId: string;
}): Promise<{ _id: string; data: ContactIdMapRecord } | null> {
  const res = await elevatedItems
    .query(collectionId(COLLECTIONS.contactIdMap))
    .eq("connectionKey", params.connectionKey)
    .eq("hubspotContactId", params.hubspotContactId)
    .limit(1)
    .find();
  const first = res.items[0];
  if (!first || typeof first._id !== "string") return null;
  const rec = toRecord(first);
  if (!rec) return null;
  return { _id: first._id, data: rec };
}

export async function upsertContactIdMap(params: {
  connectionKey: string;
  wixContactId: string;
  hubspotContactId: string;
}): Promise<void> {
  const existing = await getMapByWixContactId({
    connectionKey: params.connectionKey,
    wixContactId: params.wixContactId,
  });

  const now = Date.now();
  if (existing) {
    await elevatedItems.update(collectionId(COLLECTIONS.contactIdMap), {
      _id: existing._id,
      connectionKey: params.connectionKey,
      wixContactId: params.wixContactId,
      hubspotContactId: params.hubspotContactId,
      createdAtMs: existing.data.createdAtMs || now,
    });
    return;
  }

  await elevatedItems.insert(collectionId(COLLECTIONS.contactIdMap), {
    connectionKey: params.connectionKey,
    wixContactId: params.wixContactId,
    hubspotContactId: params.hubspotContactId,
    createdAtMs: now,
  });
}

