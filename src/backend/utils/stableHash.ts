import { bytesToHex, sha256, utf8ToBytes } from "./webCrypto";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export async function sha256HexStableJson(value: unknown): Promise<string> {
  const s = stableStringify(value);
  const dig = await sha256(utf8ToBytes(s));
  return bytesToHex(dig);
}

