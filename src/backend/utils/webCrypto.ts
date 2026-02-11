const te = new TextEncoder();
const td = new TextDecoder();

function assertWebCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error("Web Crypto API is not available in this runtime.");
  }
  return c;
}

export function utf8ToBytes(s: string): Uint8Array {
  return te.encode(s);
}

export function bytesToUtf8(b: Uint8Array): string {
  return td.decode(b);
}

export function randomBytes(len: number): Uint8Array {
  const c = assertWebCrypto();
  const out = new Uint8Array(len);
  c.getRandomValues(out);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    s += b.toString(16).padStart(2, "0");
  }
  return s;
}

export function base64EncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64DecodeToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return base64EncodeBytes(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function base64UrlDecodeToBytes(b64u: string): Uint8Array {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + "=".repeat(padLen);
  return base64DecodeToBytes(padded);
}

export function timingSafeEqualUtf8(a: string, b: string): boolean {
  const ab = utf8ToBytes(a);
  const bb = utf8ToBytes(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i] ^ bb[i];
  }
  return diff === 0;
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const c = assertWebCrypto();
  const dig = await c.subtle.digest("SHA-256", bytes);
  return new Uint8Array(dig);
}

export async function hmacSha256(
  keyUtf8: string,
  dataUtf8: string,
): Promise<Uint8Array> {
  const c = assertWebCrypto();
  const key = await c.subtle.importKey(
    "raw",
    utf8ToBytes(keyUtf8),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await c.subtle.sign("HMAC", key, utf8ToBytes(dataUtf8));
  return new Uint8Array(sig);
}

export async function aesGcmEncrypt(params: {
  keyBytes: Uint8Array;
  iv: Uint8Array;
  plaintextUtf8: string;
}): Promise<{ ciphertext: Uint8Array; tag: Uint8Array }> {
  const c = assertWebCrypto();
  const key = await c.subtle.importKey(
    "raw",
    params.keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const out = await c.subtle.encrypt(
    { name: "AES-GCM", iv: params.iv, tagLength: 128 },
    key,
    utf8ToBytes(params.plaintextUtf8),
  );
  const buf = new Uint8Array(out);
  const tag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(0, buf.length - 16);
  return { ciphertext, tag };
}

export async function aesGcmDecrypt(params: {
  keyBytes: Uint8Array;
  iv: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}): Promise<string> {
  const c = assertWebCrypto();
  const key = await c.subtle.importKey(
    "raw",
    params.keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const combined = new Uint8Array(params.ciphertext.length + params.tag.length);
  combined.set(params.ciphertext, 0);
  combined.set(params.tag, params.ciphertext.length);

  const out = await c.subtle.decrypt(
    { name: "AES-GCM", iv: params.iv, tagLength: 128 },
    key,
    combined,
  );
  return bytesToUtf8(new Uint8Array(out));
}

