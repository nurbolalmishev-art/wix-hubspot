import { exchangeCodeForTokens, getHubSpotRedirectUriOrDefault, HubSpotOAuthError } from "../../hubspot/oauth";
import { verifyAndParseSignedState } from "../../hubspot/state";
import { getHubSpotStateSigningSecret } from "../../hubspot/stateSigningSecret";
import { storeHubSpotTokens } from "../../hubspot/tokenStore";
import { ensureAppCollectionsExist } from "../../storage/ensureCollections";
import { getConnectionKeyFromAuthHeader } from "../../wix/authConnectionKey";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;
// Bump this tag when deploying to verify you're hitting the latest backend.
const BUILD_TAG = "2026-02-10T23:58Z-token-fields-and-webhook-sig";

type FinishBody = {
  code?: string;
  state?: string;
};

function scrubSecrets(s: string): string {
  // Best-effort scrubbing if upstream ever includes token-like fields.
  return s
    .replace(/access_token"\s*:\s*"[^"]+"/gi, 'access_token":"***"')
    .replace(/refresh_token"\s*:\s*"[^"]+"/gi, 'refresh_token":"***"')
    .replace(/"code"\s*:\s*"[^"]+"/gi, '"code":"***"');
}

function safeMsg(err: unknown, max = 600): string {
  const raw = err instanceof Error ? err.message : String(err);
  const compact = scrubSecrets(raw).trim().replace(/\s+/g, " ");
  return compact.length <= max ? compact : `${compact.slice(0, max)}…`;
}

export async function POST(req: Request): Promise<Response> {
  let stage:
    | "init"
    | "auth"
    | "parse_body"
    | "state_secret"
    | "state_verify"
    | "token_exchange"
    | "token_store" = "init";
  try {
    stage = "init";
    await ensureAppCollectionsExist();

    stage = "auth";
    const connectionKey = getConnectionKeyFromAuthHeader(req.headers.get("Authorization"));
    if (!connectionKey) {
      return Response.json({ error: "Unauthorized", code: "missing_connection_key" }, { status: 401 });
    }

    stage = "parse_body";
    const body = (await req.json().catch(() => null)) as FinishBody | null;
    const code = body?.code;
    const state = body?.state;
    if (!code || !state) {
      return Response.json({ error: "Bad Request", code: "missing_code_or_state" }, { status: 400 });
    }

    stage = "state_secret";
    const signingSecret = await getHubSpotStateSigningSecret();
    stage = "state_verify";
    const parsedState = await verifyAndParseSignedState(signingSecret, state);
    if (!parsedState) {
      return Response.json({ error: "Bad Request", code: "invalid_state" }, { status: 400 });
    }

    if (Date.now() - parsedState.issuedAtMs > STATE_MAX_AGE_MS) {
      return Response.json({ error: "Bad Request", code: "state_expired" }, { status: 400 });
    }

    if (parsedState.connectionKey !== connectionKey) {
      return Response.json(
        { error: "Bad Request", code: "connection_key_mismatch" },
        { status: 400 },
      );
    }

    const origin = new URL(req.url).origin;
    const redirectUri = await getHubSpotRedirectUriOrDefault(origin);
    stage = "token_exchange";
    const tokenRes = await exchangeCodeForTokens({ code, redirectUri });

    if (!tokenRes.refresh_token) {
      return Response.json({ error: "Bad Request", code: "missing_refresh_token" }, { status: 400 });
    }

    const now = Date.now();
    const tokenExpiresAtMs = now + tokenRes.expires_in * 1000;
    const scopes = tokenRes.scope ? tokenRes.scope.split(/\s+/).filter(Boolean) : undefined;
    const hubIdRaw = (tokenRes as { hub_id?: unknown }).hub_id;
    const hubIdNum =
      typeof hubIdRaw === "number"
        ? hubIdRaw
        : typeof hubIdRaw === "string"
          ? Number(hubIdRaw)
          : NaN;
    const hubId = Number.isFinite(hubIdNum) ? hubIdNum : undefined;

    stage = "token_store";
    await storeHubSpotTokens({
      connectionKey: parsedState.connectionKey,
      hubId,
      scopes,
      tokens: { accessToken: tokenRes.access_token, refreshToken: tokenRes.refresh_token },
      tokenExpiresAtMs,
    });

    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("OAuth finish failed.");
    const msg = err instanceof Error ? err.message : "";
    if (err instanceof HubSpotOAuthError) {
      // Safe to surface HubSpot's error text; it shouldn't include tokens.
      return Response.json(
        {
          error: "HubSpot OAuth failed",
          code: "hubspot_oauth_failed",
          hubspotStatus: err.status,
          details: err.details,
          stage,
          buildTag: BUILD_TAG,
        },
        { status: 502 },
      );
    }
    if (msg.includes("Missing HubSpot client id secret")) {
      return Response.json({ error: "Missing secret", code: "missing_hubspot_client_id" }, { status: 500 });
    }
    if (msg.includes("Missing HubSpot client secret secret")) {
      return Response.json({ error: "Missing secret", code: "missing_hubspot_client_secret" }, { status: 500 });
    }
    if (msg.includes("Missing HubSpot state signing secret")) {
      return Response.json({ error: "Missing secret", code: "missing_state_signing_secret" }, { status: 500 });
    }
    return Response.json(
      {
        error: "Internal server error",
        code: "oauth_finish_failed",
        stage,
        details: safeMsg(err),
        buildTag: BUILD_TAG,
      },
      { status: 500 },
    );
  }
}

