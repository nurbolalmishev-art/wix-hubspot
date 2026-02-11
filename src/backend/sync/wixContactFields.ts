import type { Contact } from "@wix/auto_sdk_crm_contacts";

export type WixFieldKey = "email" | "firstName" | "lastName" | "phone";

function firstNonEmpty(vs: Array<string | null | undefined>): string | null {
  for (const v of vs) {
    if (typeof v === "string" && v.trim().length > 0) {
      return v;
    }
  }
  return null;
}

export function getWixFieldValue(contact: Contact, key: WixFieldKey): string | null {
  switch (key) {
    case "email": {
      const primary = contact.primaryInfo?.email ?? null;
      const fromList =
        contact.info?.emails?.items?.find((e) => e.primary)?.email ??
        contact.info?.emails?.items?.[0]?.email ??
        null;
      return firstNonEmpty([primary, fromList]);
    }
    case "phone": {
      const primary = contact.primaryInfo?.phone ?? null;
      const fromList =
        contact.info?.phones?.items?.find((p) => p.primary)?.phone ??
        contact.info?.phones?.items?.[0]?.phone ??
        null;
      return firstNonEmpty([primary, fromList]);
    }
    case "firstName":
      return firstNonEmpty([contact.info?.name?.first ?? null]);
    case "lastName":
      return firstNonEmpty([contact.info?.name?.last ?? null]);
  }
}

export function applyTransform(
  value: string,
  transform: "none" | "trim" | "lowercase",
): string {
  if (transform === "trim") {
    return value.trim();
  }
  if (transform === "lowercase") {
    return value.trim().toLowerCase();
  }
  return value;
}

