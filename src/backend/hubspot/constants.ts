export const HUBSPOT_AUTH_BASE = "https://app.hubspot.com";
export const HUBSPOT_API_BASE = "https://api.hubapi.com";

// Minimum scopes for contacts + properties + forms listing (varies by account/app).
// Keep least-privilege; you can tweak per assignment needs.
export const DEFAULT_HUBSPOT_SCOPES = [
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.schemas.contacts.read",
  // forms (for listing forms in UI/widget panel); exact scope can vary.
  "forms",
];

