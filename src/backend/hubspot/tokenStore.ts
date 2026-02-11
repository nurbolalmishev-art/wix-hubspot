import { getConnectionByKey, upsertConnection } from "../storage/connections";

export type HubSpotTokenSet = {
  accessToken: string;
  refreshToken: string;
};

export async function storeHubSpotTokens(params: {
  connectionKey: string;
  hubId?: number;
  scopes?: string[];
  tokens: HubSpotTokenSet;
  tokenExpiresAtMs: number;
}): Promise<void> {
  await upsertConnection(params.connectionKey, {
    hubId: params.hubId,
    scopes: params.scopes,
    accessToken: params.tokens.accessToken,
    refreshToken: params.tokens.refreshToken,
    tokenExpiresAtMs: params.tokenExpiresAtMs,
    lastErrorCode: undefined,
    lastErrorAtMs: undefined,
  });
}

export async function loadHubSpotTokens(connectionKey: string): Promise<{
  tokens: HubSpotTokenSet;
  tokenExpiresAtMs: number;
  scopes?: string[];
  hubId?: number;
} | null> {
  const existing = await getConnectionByKey(connectionKey);
  if (!existing) {
    return null;
  }
  if (typeof existing.data.tokenExpiresAtMs !== "number") {
    return null;
  }

  // Prefer new plain-text token fields.
  if (existing.data.accessToken && existing.data.refreshToken) {
    return {
      tokens: {
        accessToken: existing.data.accessToken,
        refreshToken: existing.data.refreshToken,
      },
      tokenExpiresAtMs: existing.data.tokenExpiresAtMs,
      scopes: existing.data.scopes,
      hubId: existing.data.hubId,
    };
  }

  // Legacy fallback (tokenEnc) is intentionally not supported after migration.
  // If you still have tokenEnc, reconnect to populate accessToken/refreshToken.
  return null;
}
