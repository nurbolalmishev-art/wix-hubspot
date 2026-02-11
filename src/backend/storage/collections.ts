export const COLLECTIONS = {
  connections: "hubspot_connections",
  fieldMappings: "hubspot_field_mappings",
  contactIdMap: "hubspot_contact_id_map",
  syncLedger: "hubspot_sync_ledger",
  eventsLog: "hubspot_events_log",
  formEvents: "hubspot_form_events",
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;

export function collectionId(id: string): string {
  return id;
}

