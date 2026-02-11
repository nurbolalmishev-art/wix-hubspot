export async function ensureAppCollectionsExist(): Promise<void> {
  // No-op on purpose.
  //
  // In many Wix Dev/Preview environments, apps do NOT have permissions to manage
  // collections programmatically (Collection Management API). Attempting to
  // auto-create collections causes "Insufficient permissions" failures.
  //
  // For this assignment we create the collections manually in the site's CMS
  // (or via app configuration in Dev Center) using the expected IDs:
  // - hubspot_connections
  // - hubspot_field_mappings
  // - hubspot_contact_id_map
  // - hubspot_sync_ledger
  // - hubspot_events_log
  // - hubspot_form_events
}

