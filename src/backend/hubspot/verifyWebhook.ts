import { base64EncodeBytes, bytesToHex, hmacSha256, sha256, timingSafeEqualUtf8, utf8ToBytes } from "../utils/webCrypto";

const MAX_ALLOWED_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

function decodeHubSpotUriForV3(uri: string): string {
  // HubSpot requires decoding a specific set of URL-encoded characters.
  // See: https://developers.hubspot.com/docs/api/webhooks/validating-requests
  const replacements: Array<[RegExp, string]> = [
    [/%3A/gi, ":"],
    [/%2F/gi, "/"],
    [/%3F/gi, "?"],
    [/%40/gi, "@"],
    [/%21/gi, "!"],
    [/%24/gi, "$"],
    [/%27/gi, "'"],
    [/%28/gi, "("],
    [/%29/gi, ")"],
    [/%2A/gi, "*"],
    [/%2C/gi, ","],
    [/%3B/gi, ";"],
  ];
  return replacements.reduce((acc, [re, v]) => acc.replace(re, v), uri);
}

export function verifyHubSpotWebhookV3(params: {
  clientSecret: string;
  method: string;
  url: string;
  rawBody: string;
  signatureV3: string | null;
  requestTimestamp: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!params.signatureV3 || !params.requestTimestamp) {
    return Promise.resolve({ ok: false, reason: "Missing signature headers." });
  }

  const sig = params.signatureV3.trim();
  const tsRaw = params.requestTimestamp.trim();
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts)) {
    return Promise.resolve({ ok: false, reason: "Invalid timestamp." });
  }

  const now = Date.now();
  if (Math.abs(now - ts) > MAX_ALLOWED_TIMESTAMP_AGE_MS) {
    return Promise.resolve({ ok: false, reason: "Timestamp outside allowed window." });
  }

  const uri = decodeHubSpotUriForV3(params.url);
  // IMPORTANT: Timestamp must match the header value exactly (no whitespace differences).
  const baseString = `${params.method}${uri}${params.rawBody}${tsRaw}`;

  return hmacSha256(params.clientSecret, baseString)
    .then((mac) => {
      // HubSpot V3 uses base64 (not base64url)
      const computed = base64EncodeBytes(mac);
      if (!timingSafeEqualUtf8(computed, sig)) {
        return { ok: false, reason: "Signature mismatch." } as const;
      }
      return { ok: true } as const;
    })
    .catch(() => ({ ok: false, reason: "Signature computation failed." } as const));
}

export async function verifyHubSpotWebhookV2(params: {
  clientSecret: string;
  method: string;
  url: string;
  rawBody: string;
  signature: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!params.signature) {
    return { ok: false, reason: "Missing signature header." };
  }

  // v2 signature: sha256hex(clientSecret + method + url + body)
  const baseString = `${params.clientSecret}${params.method}${params.url}${params.rawBody}`;
  const dig = await sha256(utf8ToBytes(baseString));
  const computed = bytesToHex(dig);
  const provided = params.signature.trim().toLowerCase();

  if (!timingSafeEqualUtf8(computed, provided)) {
    return { ok: false, reason: "Signature mismatch." };
  }
  return { ok: true };
}

