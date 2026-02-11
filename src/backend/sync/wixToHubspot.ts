import type { Contact, ContactCreatedEnvelope, ContactUpdatedEnvelope } from "@wix/auto_sdk_crm_contacts";
import { ensureAppCollectionsExist } from "../storage/ensureCollections";
import { loadHubSpotTokens } from "../hubspot/tokenStore";
import { listMappings } from "../storage/mappings";
import { getMapByWixContactId, upsertContactIdMap } from "../storage/contactIdMap";
import { wasRecentlySynced, recordSync } from "../storage/syncLedger";
import { sha256HexStableJson } from "../utils/stableHash";
import { createContact, searchContactByEmail, updateContact, getContactById } from "../hubspot/contacts";
import { applyTransform, getWixFieldValue, type WixFieldKey } from "./wixContactFields";

function getConnectionKeyFromEnvelope(
  env: ContactCreatedEnvelope | ContactUpdatedEnvelope,
): string | null {
  return env.metadata?.accountInfo?.siteId ?? null;
}

function contactUpdatedAtMs(contact: Contact): number | null {
  const d = contact._updatedDate;
  return d instanceof Date ? d.getTime() : typeof d === "string" ? Date.parse(d) : null;
}

function hubspotLastModifiedMs(properties: Record<string, string | null | undefined>): number | null {
  const v = properties.lastmodifieddate;
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

export async function handleWixContactChange(
  env: ContactCreatedEnvelope | ContactUpdatedEnvelope,
): Promise<void> {
  await ensureAppCollectionsExist();

  const connectionKey = getConnectionKeyFromEnvelope(env);
  if (!connectionKey) {
    return;
  }

  // If not connected, do nothing.
  const tokens = await loadHubSpotTokens(connectionKey);
  if (!tokens) {
    return;
  }

  const wixContact = env.entity;
  const wixContactId = wixContact._id;
  if (!wixContactId) {
    return;
  }

  const mappings = await listMappings(connectionKey);
  const outbound = mappings.filter(
    (m) => m.direction === "wix_to_hubspot" || m.direction === "bidirectional",
  );
  if (outbound.length === 0) {
    return;
  }

  const propsToWrite: Record<string, string> = {};
  const canonicalFields: Partial<Record<WixFieldKey, string>> = {};
  for (const m of outbound) {
    const wixKey = m.wixFieldKey as WixFieldKey;
    const raw = getWixFieldValue(wixContact, wixKey);
    if (!raw) continue;
    const transformed = applyTransform(raw, m.transform);
    if (transformed.length === 0) continue;
    propsToWrite[m.hubspotPropertyName] = transformed;
    canonicalFields[wixKey] = transformed;
  }

  if (Object.keys(propsToWrite).length === 0) {
    return;
  }

  const payloadHash = await sha256HexStableJson(canonicalFields);

  // If this Wix update is a side-effect of our own HubSpot->Wix write, skip it.
  const deduped = await wasRecentlySynced({
    entityType: "contact",
    source: "hubspot",
    wixContactId,
    payloadHash,
  });
  if (deduped) {
    return;
  }

  const existingMap = await getMapByWixContactId({ connectionKey, wixContactId });
  let hubspotContactId = existingMap?.data.hubspotContactId ?? null;

  const email = getWixFieldValue(wixContact, "email");
  if (!hubspotContactId && email) {
    const found = await searchContactByEmail({
      connectionKey,
      email,
      properties: ["email", "lastmodifieddate"],
    });
    if (found) {
      hubspotContactId = found.id;
      await upsertContactIdMap({ connectionKey, wixContactId, hubspotContactId });
    }
  }

  // HubSpot wins: if HubSpot is newer than Wix, don't overwrite.
  const wixUpdatedMs = contactUpdatedAtMs(wixContact);
  if (hubspotContactId && wixUpdatedMs) {
    const hs = await getContactById({
      connectionKey,
      id: hubspotContactId,
      properties: ["lastmodifieddate"],
    });
    const hsMs = hubspotLastModifiedMs(hs.properties);
    if (hsMs !== null && hsMs > wixUpdatedMs) {
      return;
    }
  }

  if (!hubspotContactId) {
    // Create requires an email for sensible dedupe.
    if (!email) {
      return;
    }
    const created = await createContact({
      connectionKey,
      properties: { email, ...propsToWrite },
    });
    hubspotContactId = created.id;
    await upsertContactIdMap({ connectionKey, wixContactId, hubspotContactId });
  } else {
    await updateContact({
      connectionKey,
      id: hubspotContactId,
      properties: propsToWrite,
    });
  }

  const correlationId = env.metadata?._id ? `wix:${env.metadata._id}` : `wix:${Date.now()}`;
  await recordSync({
    connectionKey,
    entityType: "contact",
    wixContactId,
    hubspotContactId: hubspotContactId ?? undefined,
    source: "wix",
    correlationId,
    payloadHash,
  });
}

