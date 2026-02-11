import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  base64DecodeToBytes,
  base64EncodeBytes,
  bytesToUtf8,
  randomBytes,
  utf8ToBytes,
} from "../utils/webCrypto";

export type AesGcmEncrypted = {
  v: 1;
  ivB64: string;
  tagB64: string;
  dataB64: string;
};

function decodeKey(keyB64: string): Uint8Array {
  const buf = base64DecodeToBytes(keyB64);
  if (buf.byteLength !== 32) {
    throw new Error("Encryption key must be 32 bytes (base64-encoded).");
  }
  return buf;
}

export async function encryptJsonAes256Gcm(
  keyB64: string,
  payload: unknown,
): Promise<AesGcmEncrypted> {
  const keyBytes = decodeKey(keyB64);
  const iv = randomBytes(12);
  const plaintextUtf8 = JSON.stringify(payload);
  const { ciphertext, tag } = await aesGcmEncrypt({
    keyBytes,
    iv,
    plaintextUtf8,
  });

  return {
    v: 1,
    ivB64: base64EncodeBytes(iv),
    tagB64: base64EncodeBytes(tag),
    dataB64: base64EncodeBytes(ciphertext),
  };
}

export async function decryptJsonAes256Gcm<T>(
  keyB64: string,
  encrypted: AesGcmEncrypted,
): Promise<T> {
  if (encrypted.v !== 1) {
    throw new Error("Unsupported encrypted payload version.");
  }

  const keyBytes = decodeKey(keyB64);
  const iv = base64DecodeToBytes(encrypted.ivB64);
  const tag = base64DecodeToBytes(encrypted.tagB64);
  const data = base64DecodeToBytes(encrypted.dataB64);

  const plaintext = await aesGcmDecrypt({
    keyBytes,
    iv,
    ciphertext: data,
    tag,
  });
  return JSON.parse(plaintext) as T;
}

