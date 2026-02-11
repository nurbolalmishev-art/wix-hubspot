import { base64UrlDecodeToString } from "../utils/base64url";

type JwtPayload = Record<string, unknown>;

function tryParseJsonObject(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s) as unknown;
    if (v && typeof v === "object") {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function tryDecodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  // Wix `httpClient.fetchWithAuth()` may send tokens in a non-standard wrapper format:
  // "OauthNG.JWS.<header>.<payload>.<sig>"
  // In that case the JWT payload is at index 3.
  let payloadB64u = parts[1];
  if (parts.length >= 5 && parts[0] === "OauthNG" && parts[1] === "JWS") {
    payloadB64u = parts[3];
  }

  try {
    const json = base64UrlDecodeToString(payloadB64u);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

function pickFirstString(obj: JwtPayload, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) {
      return v;
    }
  }
  return null;
}

function deepPickConnectionKey(payload: JwtPayload): string | null {
  // 1) Direct claims (varies by env)
  const direct = pickFirstString(payload, [
    "siteId",
    "metaSiteId",
    "msid",
    "instanceId",
    "appInstanceId",
    "aid",
    "sub",
  ]);
  if (direct) return direct;

  // 2) Wix OauthNG tokens often store details in payload.data as a JSON string
  const dataStr = payload.data;
  if (typeof dataStr === "string" && dataStr.length > 0) {
    const parsed = tryParseJsonObject(dataStr);
    const instance = parsed?.instance;
    if (instance && typeof instance === "object") {
      return pickFirstString(instance as JwtPayload, [
        "siteId",
        "metaSiteId",
        "msid",
        "instanceId",
        "appInstanceId",
        "aid",
        "sub",
      ]);
    }
  }
  return null;
}

/**
 * Best-effort extraction of a stable per-installation key from the auth header
 * produced by `httpClient.fetchWithAuth()`.
 *
 * We intentionally avoid depending on a single claim name: Wix tokens differ
 * between environments/identities.
 */
export function getConnectionKeyFromAuthHeader(
  authHeader: string | null,
): string | null {
  if (!authHeader) {
    return null;
  }
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : authHeader;

  const payload = tryDecodeJwtPayload(token);
  if (!payload) {
    return null;
  }

  return deepPickConnectionKey(payload);
}

