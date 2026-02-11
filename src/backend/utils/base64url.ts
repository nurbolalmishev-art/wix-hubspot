import { base64UrlDecodeToBytes, base64UrlEncodeBytes, bytesToUtf8, utf8ToBytes } from "./webCrypto";

export function base64UrlEncode(input: string): string {
  return base64UrlEncodeBytes(utf8ToBytes(input));
}

export function base64UrlDecodeToString(input: string): string {
  return bytesToUtf8(base64UrlDecodeToBytes(input));
}
