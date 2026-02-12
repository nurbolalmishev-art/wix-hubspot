## Setup 🔧

##### Install dependencies:

```console
npm install
```

## Available Scripts

In the project directory, you can run:

```console
npm run dev
```

## CMS collections setup

Create the following **6 collections** in your site's CMS with **exact IDs**:

- `hubspot_connections`
- `hubspot_field_mappings`
- `hubspot_contact_id_map`
- `hubspot_sync_ledger`
- `hubspot_events_log`
- `hubspot_form_events`

**Recommended minimal schemas:**

**`hubspot_connections`**

- `connectionKey` (Text)
- `wixInstanceId` (Text)
- `hubId` (Number)
- `scopes` (Text)
- `accessToken` (Text)
- `refreshToken` (Text)
- `tokenExpiresAtMs` (Number)
- `createdAtMs` (Number)
- `updatedAtMs` (Number)

**`hubspot_field_mappings`**

- `connectionKey` (Text)
- `wixFieldKey` (Text)
- `hubspotPropertyName` (Text)
- `direction` (Text)
- `transform` (Text)
- `createdAtMs` (Number)
- `updatedAtMs` (Number)

**`hubspot_contact_id_map`**

- `connectionKey` (Text)
- `wixContactId` (Text)
- `hubspotContactId` (Text)
- `createdAtMs` (Number)

**`hubspot_sync_ledger`**

- `connectionKey` (Text)
- `entityType` (Text)
- `wixContactId` (Text)
- `hubspotContactId` (Text)
- `source` (Text)
- `correlationId` (Text)
- `payloadHash` (Text)
- `createdAtMs` (Number)
- `expiresAtMs` (Number)

**`hubspot_events_log`**

- `eventType` (Text)
- `source` (Text)
- `correlationId` (Text)
- `connectionKey` (Text)
- `hubId` (Number)
- `objectType` (Text)
- `objectId` (Text)
- `occurredAtMs` (Number)
- `receivedAtMs` (Number)
- `status` (Text)
- `errorCode` (Text)

**`hubspot_form_events`**

- `hubId` (Number)
- `formId` (Text)
- `correlationId` (Text)
- `pageUrl` (Text)
- `referrer` (Text)
- `utmSource` (Text)
- `utmMedium` (Text)
- `utmCampaign` (Text)
- `utmTerm` (Text)
- `utmContent` (Text)
- `occurredAtMs` (Number)
- `receivedAtMs` (Number)

## Wix Secrets setup

In Wix **Secrets Manager**, create the following secrets (IDs must match exactly):

- `hubspot_state_signing_key`
  - Random string used to sign/verify the OAuth `state` parameter between dashboard and backend.
- `hubspot_client_id`
  - HubSpot app **Client ID** from your HubSpot Developer portal.
- `hubspot_client_secret`
  - HubSpot app **Client Secret** from your HubSpot Developer portal.

## Wix config

In the project root, update `wix.config.json`:

- Replace the placeholder `appId` with **your own app/site ID** from Wix Dev Center  
  (this is the ID of the app you installed on the target site, sometimes referred to as `siteId` in docs).

## HubSpot URLs

Replace the placeholders with your own values:

- **PREVIEW_DOMAIN** — your app preview domain (e.g. from `npm run preview` output or Wix Dev Center).
- **INSTANCE_ID** — the app instance ID for the site installation (from the dashboard URL or Dev Center).

**Webhook:**

```
https://<PREVIEW_DOMAIN>.wix-app.run/functions/hubspot-webhook?instanceId=<INSTANCE_ID>
```

**OAuth Redirect URI:**

```
https://<PREVIEW_DOMAIN>.wix-app.run/functions/hubspot-oauth-callback
```