import { items } from "@wix/data";
import { COLLECTIONS, collectionId } from "./collections";
import { elevatedItems } from "./elevatedItems";

export type MappingDirection = "wix_to_hubspot" | "hubspot_to_wix" | "bidirectional";
export type MappingTransform = "none" | "trim" | "lowercase";

export type FieldMapping = {
  wixFieldKey: string;
  hubspotPropertyName: string;
  direction: MappingDirection;
  transform: MappingTransform;
};

type WixDataItem = items.WixDataItem;

function isString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

export async function listMappings(connectionKey: string): Promise<FieldMapping[]> {
  const res = await elevatedItems
    .query(collectionId(COLLECTIONS.fieldMappings))
    .eq("connectionKey", connectionKey)
    .limit(1000)
    .find();

  return res.items
    .map((it: WixDataItem) => {
      const wixFieldKey = isString(it.wixFieldKey) ? it.wixFieldKey : null;
      const hubspotPropertyName = isString(it.hubspotPropertyName) ? it.hubspotPropertyName : null;
      const direction = isString(it.direction) ? it.direction : null;
      const transform = typeof it.transform === "string" ? it.transform : "none";
      if (!wixFieldKey || !hubspotPropertyName || !direction) {
        return null;
      }
      if (
        direction !== "wix_to_hubspot" &&
        direction !== "hubspot_to_wix" &&
        direction !== "bidirectional"
      ) {
        return null;
      }
      const tr =
        transform === "trim" || transform === "lowercase" || transform === "none"
          ? (transform as MappingTransform)
          : "none";
      return {
        wixFieldKey,
        hubspotPropertyName,
        direction,
        transform: tr,
      } satisfies FieldMapping;
    })
    .filter((x): x is FieldMapping => x !== null);
}

export async function replaceMappings(params: {
  connectionKey: string;
  mappings: FieldMapping[];
}): Promise<void> {
  const existing = await elevatedItems
    .query(collectionId(COLLECTIONS.fieldMappings))
    .eq("connectionKey", params.connectionKey)
    .limit(1000)
    .find();

  for (const it of existing.items) {
    if (typeof it._id === "string") {
      await elevatedItems.remove(collectionId(COLLECTIONS.fieldMappings), it._id);
    }
  }

  const now = Date.now();
  for (const m of params.mappings) {
    await elevatedItems.insert(collectionId(COLLECTIONS.fieldMappings), {
      connectionKey: params.connectionKey,
      wixFieldKey: m.wixFieldKey,
      hubspotPropertyName: m.hubspotPropertyName,
      direction: m.direction,
      transform: m.transform,
      createdAtMs: now,
      updatedAtMs: now,
    });
  }
}

