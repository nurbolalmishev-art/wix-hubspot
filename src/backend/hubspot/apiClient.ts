import { HUBSPOT_API_BASE } from "./constants";
import { refreshAccessToken } from "./oauth";
import { loadHubSpotTokens, storeHubSpotTokens } from "./tokenStore";

const EXPIRY_SAFETY_WINDOW_MS = 60_000;

export class HubSpotNotConnectedError extends Error {
  constructor() {
    super("HubSpot is not connected.");
  }
}

async function ensureFreshAccessToken(connectionKey: string): Promise<string> {
  const stored = await loadHubSpotTokens(connectionKey);
  if (!stored) {
    throw new HubSpotNotConnectedError();
  }

  const now = Date.now();
  if (stored.tokenExpiresAtMs > now + EXPIRY_SAFETY_WINDOW_MS) {
    return stored.tokens.accessToken;
  }

  const refreshed = await refreshAccessToken({
    refreshToken: stored.tokens.refreshToken,
  });

  const accessToken = refreshed.access_token;
  const refreshToken = refreshed.refresh_token || stored.tokens.refreshToken;
  const tokenExpiresAtMs = now + refreshed.expires_in * 1000;
  const scopes = refreshed.scope
    ? refreshed.scope.split(/\s+/).filter(Boolean)
    : stored.scopes;
  const hubIdRaw = (refreshed as { hub_id?: unknown }).hub_id;
  const hubIdNum =
    typeof hubIdRaw === "number"
      ? hubIdRaw
      : typeof hubIdRaw === "string"
        ? Number(hubIdRaw)
        : NaN;
  const hubId = Number.isFinite(hubIdNum) ? hubIdNum : stored.hubId;

  await storeHubSpotTokens({
    connectionKey,
    hubId,
    scopes,
    tokens: { accessToken, refreshToken },
    tokenExpiresAtMs,
  });

  return accessToken;
}

export async function hubspotFetchJson<T>(params: {
  connectionKey: string;
  path: string;
  method?: "GET" | "POST" | "PATCH";
  query?: Record<string, string>;
  body?: unknown;
}): Promise<T> {
  const accessToken = await ensureFreshAccessToken(params.connectionKey);
  const url = new URL(params.path, HUBSPOT_API_BASE);
  if (params.query) {
    for (const [k, v] of Object.entries(params.query)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: params.method || "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HubSpot API error: ${res.status} ${txt}`);
  }

  return (await res.json()) as T;
}

