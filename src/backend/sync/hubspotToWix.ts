import { contacts } from "@wix/crm";
import type { ContactInfo } from "@wix/auto_sdk_crm_contacts";
import { ensureAppCollectionsExist } from "../storage/ensureCollections";
import { listMappings } from "../storage/mappings";
import { getMapByHubspotContactId, upsertContactIdMap } from "../storage/contactIdMap";
import { recordSync, wasRecentlySynced } from "../storage/syncLedger";
import { sha256HexStableJson } from "../utils/stableHash";
import { getContactById } from "../hubspot/contacts";
import { applyTransform, type WixFieldKey } from "./wixContactFields";
import { logEvent } from "../storage/eventsLog";

function buildWixContactInfoPatch(params: {
  fieldValues: Partial<Record<WixFieldKey, string>>;
}): ContactInfo {
  const info: ContactInfo = {};
  if (params.fieldValues.firstName || params.fieldValues.lastName) {
    info.name = {
      first: params.fieldValues.firstName ?? null,
      last: params.fieldValues.lastName ?? null,
    };
  }
  if (params.fieldValues.email) {
    info.emails = {
      items: [{ email: params.fieldValues.email, primary: true }],
    };
  }
  if (params.fieldValues.phone) {
    info.phones = {
      items: [{ phone: params.fieldValues.phone, primary: true }],
    };
  }
  return info;
}

function getWixKeyForMapping(key: string): WixFieldKey | null {
  if (key === "email" || key === "firstName" || key === "lastName" || key === "phone") {
    return key;
  }
  return null;
}

function extractWixComparableFields(contact: { primaryInfo?: { email?: string | null; phone?: string | null }; info?: any }): Partial<Record<WixFieldKey, string>> {
  const out: Partial<Record<WixFieldKey, string>> = {};
  const email = contact.primaryInfo?.email ?? null;
  const phone = contact.primaryInfo?.phone ?? null;
  const first = contact.info?.name?.first ?? null;
  const last = contact.info?.name?.last ?? null;
  if (typeof email === "string" && email) out.email = email;
  if (typeof phone === "string" && phone) out.phone = phone;
  if (typeof first === "string" && first) out.firstName = first;
  if (typeof last === "string" && last) out.lastName = last;
  return out;
}

function extractAppErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const anyErr = err as {
    details?: { applicationError?: { code?: unknown; description?: unknown } };
    code?: unknown;
    message?: unknown;
  };
  const codeFromDetails = anyErr.details?.applicationError?.code;
  if (typeof codeFromDetails === "string") return codeFromDetails;
  if (typeof anyErr.code === "string") return anyErr.code;
  if (typeof anyErr.message === "string") return anyErr.message;
  return null;
}

export async function handleHubSpotContactWebhook(params: {
  connectionKey: string;
  hubspotContactId: string;
  correlationId: string;
}): Promise<void> {
  await ensureAppCollectionsExist();

  const mappings = await listMappings(params.connectionKey);
  const inbound = mappings.filter(
    (m) => m.direction === "hubspot_to_wix" || m.direction === "bidirectional",
  );
  if (inbound.length === 0) {
    return;
  }

  const requiredHsProps = Array.from(
    new Set<string>([
      "email",
      "firstname",
      "lastname",
      "phone",
      ...inbound.map((m) => m.hubspotPropertyName),
    ]),
  );

  const hsContact = await getContactById({
    connectionKey: params.connectionKey,
    id: params.hubspotContactId,
    properties: requiredHsProps,
  });

  const fieldValues: Partial<Record<WixFieldKey, string>> = {};
  for (const m of inbound) {
    const wixKey = getWixKeyForMapping(m.wixFieldKey);
    if (!wixKey) continue;
    const raw = hsContact.properties[m.hubspotPropertyName];
    if (typeof raw !== "string" || raw.length === 0) continue;
    fieldValues[wixKey] = applyTransform(raw, m.transform);
  }

  if (Object.keys(fieldValues).length === 0) {
    return;
  }

  const payloadHash = await sha256HexStableJson(fieldValues);

  // If this webhook is just our own Wix->HubSpot write echo, ignore.
  const deduped = await wasRecentlySynced({
    entityType: "contact",
    source: "wix",
    hubspotContactId: params.hubspotContactId,
    payloadHash,
  });
  if (deduped) {
    return;
  }

  const existingMap = await getMapByHubspotContactId({
    connectionKey: params.connectionKey,
    hubspotContactId: params.hubspotContactId,
  });
  let wixContactId = existingMap?.data.wixContactId ?? null;

  try {
    if (!wixContactId) {
      const email = hsContact.properties.email;
      if (typeof email === "string" && email.length > 0) {
        const q = await contacts.queryContacts().eq("primaryInfo.email", email).limit(1).find();
        const found = q.items[0];
        if (found?._id) {
          wixContactId = found._id;
        }
      }
    }

    if (!wixContactId) {
      const created = await contacts.createContact(buildWixContactInfoPatch({ fieldValues }));
      if (!created?.contact?._id) {
        throw new Error("Failed to create Wix contact.");
      }
      wixContactId = created.contact._id;
    } else {
      const existing = await contacts.getContact(wixContactId);
      const current = extractWixComparableFields(existing);
      let changed = false;
      for (const [k, v] of Object.entries(fieldValues) as Array<[WixFieldKey, string]>) {
        if (current[k] !== v) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        await recordSync({
          connectionKey: params.connectionKey,
          entityType: "contact",
          wixContactId,
          hubspotContactId: params.hubspotContactId,
          source: "hubspot",
          correlationId: params.correlationId,
          payloadHash,
        });
        return;
      }

      const revision = typeof existing.revision === "number" ? existing.revision : 0;
      await contacts.updateContact(wixContactId, buildWixContactInfoPatch({ fieldValues }), revision);
    }

    await upsertContactIdMap({
      connectionKey: params.connectionKey,
      wixContactId,
      hubspotContactId: params.hubspotContactId,
    });

    await recordSync({
      connectionKey: params.connectionKey,
      entityType: "contact",
      wixContactId,
      hubspotContactId: params.hubspotContactId,
      source: "hubspot",
      correlationId: params.correlationId,
      payloadHash,
    });
  } catch (err) {
    const receivedAtMs = Date.now();
    const code = extractAppErrorCode(err) ?? "unknown_error";
    try {
      await logEvent({
        eventType: "hubspot_to_wix.create_wix_contact",
        source: "hubspot",
        correlationId: params.correlationId,
        connectionKey: params.connectionKey,
        receivedAtMs,
        status: "error",
        errorCode: code,
      });
    } catch {
      // логирование ошибок синка не должно ломать вебхук
    }
    console.error(
      "Failed to sync HubSpot contact to Wix.",
      JSON.stringify(err, null, 2),
    );
    throw err;
  }
}

