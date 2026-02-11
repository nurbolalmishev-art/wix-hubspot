import { base64UrlDecodeToString, base64UrlEncode } from "../utils/base64url";
import { base64UrlEncodeBytes, hmacSha256, timingSafeEqualUtf8 } from "../utils/webCrypto";

export type OAuthStatePayload = {
  connectionKey: string;
  nonce: string;
  issuedAtMs: number;
};

async function hmacSha256Base64Url(secret: string, data: string): Promise<string> {
  const mac = await hmacSha256(secret, data);
  return base64UrlEncodeBytes(mac);
}

export async function createSignedState(
  signingSecret: string,
  payload: OAuthStatePayload,
): Promise<string> {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const sig = await hmacSha256Base64Url(signingSecret, encodedPayload);
  return `${encodedPayload}.${sig}`;
}

export async function verifyAndParseSignedState(
  signingSecret: string,
  state: string,
): Promise<OAuthStatePayload | null> {
  const [encodedPayload, sig] = state.split(".");
  if (!encodedPayload || !sig) {
    return null;
  }

  const expectedSig = await hmacSha256Base64Url(signingSecret, encodedPayload);
  if (!timingSafeEqualUtf8(sig, expectedSig)) {
    return null;
  }

  try {
    const json = base64UrlDecodeToString(encodedPayload);
    const parsed = JSON.parse(json) as OAuthStatePayload;
    if (
      !parsed ||
      typeof parsed.connectionKey !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.issuedAtMs !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

