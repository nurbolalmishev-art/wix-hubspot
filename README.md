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