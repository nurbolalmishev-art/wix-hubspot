import { HUBSPOT_API_BASE, HUBSPOT_AUTH_BASE } from "./constants";
import { getSecretString } from "../secrets/getSecretString";

export type HubSpotTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  hub_id?: number;
  user?: string;
  scope?: string;
};

export class HubSpotOAuthError extends Error {
  status: number;
  details: string;
  constructor(message: string, params: { status: number; details: string }) {
    super(message);
    this.status = params.status;
    this.details = params.details;
  }
}

function safeDetails(txt: string, max = 500): string {
  const s = txt.trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

const CLIENT_ID_SECRET = "hubspot_client_id";
const CLIENT_SECRET_SECRET = "hubspot_client_secret";
const REDIRECT_URI_SECRET = "hubspot_redirect_uri";

export async function getHubSpotClientId(): Promise<string> {
  const v = await getSecretString(CLIENT_ID_SECRET);
  if (!v) {
    throw new Error("Missing HubSpot client id secret.");
  }
  return v;
}

export async function getHubSpotClientSecret(): Promise<string> {
  const v = await getSecretString(CLIENT_SECRET_SECRET);
  if (!v) {
    throw new Error("Missing HubSpot client secret secret.");
  }
  return v;
}

export async function getHubSpotRedirectUriOrDefault(
  requestOrigin: string,
): Promise<string> {
  const override = await getSecretString(REDIRECT_URI_SECRET);
  if (override) {
    return override;
  }
  // Wix CLI backend APIs are served under "/functions/<name>"
  return `${requestOrigin}/functions/hubspot-oauth-callback`;
}

export async function buildHubSpotAuthorizeUrl(params: {
  redirectUri: string;
  scopes: string[];
  state: string;
}): Promise<string> {
  const clientId = await getHubSpotClientId();
  const url = new URL("/oauth/authorize", HUBSPOT_AUTH_BASE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", params.state);
  return url.toString();
}

export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<HubSpotTokenResponse> {
  const clientId = await getHubSpotClientId();
  const clientSecret = await getHubSpotClientSecret();

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", params.redirectUri);
  body.set("code", params.code);

  const res = await fetch(`${HUBSPOT_API_BASE}/oauth/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new HubSpotOAuthError("HubSpot token exchange failed.", {
      status: res.status,
      details: safeDetails(txt),
    });
  }

  return (await res.json()) as HubSpotTokenResponse;
}

export async function refreshAccessToken(params: {
  refreshToken: string;
}): Promise<HubSpotTokenResponse> {
  const clientId = await getHubSpotClientId();
  const clientSecret = await getHubSpotClientSecret();

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("refresh_token", params.refreshToken);

  const res = await fetch(`${HUBSPOT_API_BASE}/oauth/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new HubSpotOAuthError("HubSpot token refresh failed.", {
      status: res.status,
      details: safeDetails(txt),
    });
  }

  return (await res.json()) as HubSpotTokenResponse;
}

