import { items } from "@wix/data";
import { COLLECTIONS, collectionId } from "./collections";
import { elevatedItems } from "./elevatedItems";

export type EventLogRecord = {
  eventType: string;
  source: "hubspot" | "wix";
  correlationId: string;
  connectionKey?: string;
  hubId?: number;
  objectType?: string;
  objectId?: string;
  occurredAtMs?: number;
  receivedAtMs: number;
  // These fields are useful, but some manually-created schemas may not include them.
  // We'll best-effort write them when possible.
  status?: "received" | "ignored" | "processed" | "error" | "rejected";
  errorCode?: string;
};

function wixDataErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const anyErr = err as {
    details?: { applicationError?: { code?: unknown } };
    code?: unknown;
  };
  const codeFromDetails = anyErr.details?.applicationError?.code;
  if (typeof codeFromDetails === "string") return codeFromDetails;
  if (typeof anyErr.code === "string") return anyErr.code;
  return null;
}

function compactMsg(s: string, max = 280): string {
  const c = s.trim().replace(/\s+/g, " ");
  return c.length <= max ? c : `${c.slice(0, max)}…`;
}

function coerceNumbersToText(attempt: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...attempt };
  for (const k of ["hubId", "occurredAtMs", "receivedAtMs"]) {
    const v = out[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = String(v);
    }
  }
  return out;
}

function coerceMsToIso(attempt: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...attempt };
  for (const k of ["occurredAtMs", "receivedAtMs"]) {
    const v = out[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = new Date(v).toISOString();
    }
  }
  return out;
}

export async function logEvent(record: EventLogRecord): Promise<void> {
  const base = Object.fromEntries(
    Object.entries(record).filter(([, v]) => v !== undefined),
  ) as Record<string, unknown>;

  const attempts: Array<Record<string, unknown>> = [];

  // Attempt 1: full record
  attempts.push(base);

  // Attempt 1b: common manual schema variation (numbers stored as text)
  attempts.push(coerceNumbersToText(base));

  // Attempt 1c: common manual schema variation (timestamps stored as datetime/ISO)
  attempts.push(coerceMsToIso(base));

  // Attempt 2: drop optional fields that are often missing in CMS schemas
  const { status: _status, errorCode: _errorCode, ...withoutStatus } = base;
  attempts.push(withoutStatus);

  // Attempt 2b: drop optional fields + number→text coercion
  attempts.push(coerceNumbersToText(withoutStatus));

  // Attempt 2c: drop optional fields + ms→ISO coercion
  attempts.push(coerceMsToIso(withoutStatus));

  // Attempt 3: minimal fields only (for connectivity debugging)
  attempts.push({
    eventType: base.eventType,
    source: base.source,
    correlationId: base.correlationId,
    receivedAtMs: base.receivedAtMs,
  });

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      await elevatedItems.insert(collectionId(COLLECTIONS.eventsLog), attempt);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = wixDataErrorCode(err);
      errors.push(compactMsg(`${code ? `${code}: ` : ""}${msg}`));
      // Some environments disallow elevated writes from external webhooks.
      // If the collection permissions allow it, fall back to a non-elevated insert.
      try {
        await items.insert(collectionId(COLLECTIONS.eventsLog), attempt);
        return;
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        const code2 = wixDataErrorCode(err2);
        errors.push(compactMsg(`fallback ${code2 ? `${code2}: ` : ""}${msg2}`));
        // try next attempt
      }
    }
  }

  // Observability must never break core flows (webhooks/sync). Log and move on.
  console.error(
    `Failed to write hubspot_events_log after retries. ` +
      `Most likely: missing collection / wrong collection ID / schema mismatch / permissions. ` +
      `errors=${JSON.stringify(errors.slice(-3))}`,
  );
}
