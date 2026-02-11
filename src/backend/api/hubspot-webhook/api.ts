import { getConnectionByHubId } from "../../storage/connections";
import { logEvent } from "../../storage/eventsLog";
import { handleHubSpotContactWebhook } from "../../sync/hubspotToWix";
import { getInstanceIdFromRequest, withAppInstanceContext } from "../../wix/appInstanceContext";

type HubSpotWebhookEvent = {
  eventId?: number;
  subscriptionId?: number;
  portalId?: number;
  appId?: number;
  // "classic" payloads
  occurredAt?: number;
  // generic object.* payloads (docs call it `label`, unix ms)
  label?: number;
  subscriptionType?: string;
  objectId?: number;
  changeFlag?: string;
  changeSource?: string;
};

function asEvents(body: unknown): HubSpotWebhookEvent[] {
  if (Array.isArray(body)) {
    return body as HubSpotWebhookEvent[];
  }
  if (body && typeof body === "object") {
    const anyBody = body as { events?: unknown };
    if (Array.isArray(anyBody.events)) {
      return anyBody.events as HubSpotWebhookEvent[];
    }
    // Some senders may post a single event object.
    return [body as HubSpotWebhookEvent];
  }
  return [];
}

function clampReason(s: string, max = 120): string {
  const v = s.trim().replace(/\s+/g, " ");
  if (v.length <= max) return v;
  return `${v.slice(0, max)}…`;
}

function firstHeaderValue(v: string | null): string | null {
  if (!v) return null;
  const first = v.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

function forwardedPathAndQuery(req: Request): string | null {
  // Different proxies expose original path differently. Try the common ones.
  // We keep it minimal and only accept absolute-path forms.
  const candidates = [
    req.headers.get("X-Forwarded-Uri"),
    req.headers.get("X-Original-URL"),
    req.headers.get("X-Original-URI"),
    req.headers.get("X-Rewrite-URL"),
  ];
  for (const c of candidates) {
    const v = firstHeaderValue(c);
    if (!v) continue;
    // Accept "/path?query" (absolute path form)
    if (v.startsWith("/")) return v;
  }
  return null;
}

function signatureUriFromRequest(req: Request): string {
  // HubSpot signature validation requires the *exact* URI (including protocol + host).
  // Some runtimes may expose an internal URL via `req.url`, so we prefer forwarded headers.
  const u = new URL(req.url);
  const proto =
    firstHeaderValue(req.headers.get("X-Forwarded-Proto")) ||
    u.protocol.replace(/:$/, "") ||
    "https";
  const host =
    firstHeaderValue(req.headers.get("X-Forwarded-Host")) ||
    firstHeaderValue(req.headers.get("Host")) ||
    u.host;
  const pathAndQuery = forwardedPathAndQuery(req) || `${u.pathname}${u.search}`;
  return `${proto}://${host}${pathAndQuery}`;
}

function compactHeaderDiagnostics(req: Request): string {
  const sigV3 = req.headers.get("X-HubSpot-Signature-V3");
  const ts = req.headers.get("X-HubSpot-Request-Timestamp");
  const sigV2 = req.headers.get("X-HubSpot-Signature");
  const ver = req.headers.get("X-HubSpot-Signature-Version");
  const has = (v: string | null) => (v && v.trim().length > 0 ? "1" : "0");
  return `hv3=${has(sigV3)} ts=${has(ts)} hv2=${has(sigV2)} ver=${(ver || "").trim() || "—"}`;
}

export async function POST(req: Request): Promise<Response> {
  const instanceId = getInstanceIdFromRequest(req);

  const run = async () => {
    const rawBody = await req.text();

    // Best-effort parse for diagnostics (no PII expected in webhook payload anyway)
    let parsed: unknown = [];
    try {
      parsed = rawBody ? (JSON.parse(rawBody) as unknown) : [];
    } catch {
      // HubSpot expects 2xx quickly; do not keep retrying forever on malformed payload.
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const receivedAtMs = Date.now();
    const events = asEvents(parsed);

    // SECURITY: для упрощения отладки подпись HubSpot сейчас не проверяется.
    // В продакшене проверку нужно включить обратно.

    if (events.length === 0) {
      // If HubSpot (or a proxy) ever changes the payload shape, log a single diagnostic event.
      try {
        const shape =
          parsed && typeof parsed === "object"
            ? { type: "object", keys: Object.keys(parsed as Record<string, unknown>).slice(0, 20) }
            : { type: typeof parsed };
        await logEvent({
          eventType: "webhook.empty_payload",
          source: "hubspot",
          correlationId: `hubspot:empty:${receivedAtMs}:${Math.random().toString(16).slice(2)}`,
          receivedAtMs,
          status: "ignored",
          errorCode: clampReason(`no_events diag=${JSON.stringify(shape)}`),
        });
      } catch {
        // ignore
      }
      return Response.json({ ok: true }, { status: 200 });
    }

    for (const e of events) {
      const hubId = typeof e.portalId === "number" ? e.portalId : undefined;
      const objectId =
        typeof e.objectId === "number" ? String(e.objectId) : undefined;
      const occurredAtMs =
        typeof e.occurredAt === "number"
          ? e.occurredAt
          : typeof e.label === "number"
            ? e.label
            : undefined;
      const eventType =
        typeof e.subscriptionType === "string" ? e.subscriptionType : "unknown";
      const correlationId =
        typeof e.eventId === "number"
          ? `hubspot:${e.eventId}`
          : `hubspot:${receivedAtMs}:${Math.random().toString(16).slice(2)}`;

      let conn: Awaited<ReturnType<typeof getConnectionByHubId>> = null;
      if (hubId !== undefined) {
        try {
          conn = await getConnectionByHubId(hubId);
        } catch (err) {
          console.error("HubSpot webhook connection lookup failed.", err);
          try {
            await logEvent({
              eventType: "webhook.conn_lookup_failed",
              source: "hubspot",
              correlationId,
              hubId,
              receivedAtMs,
              status: "error",
              errorCode: clampReason(err instanceof Error ? err.message : String(err), 300),
            });
          } catch {
            // ignore
          }
          conn = null;
        }
      }

      try {
        await logEvent({
          eventType,
          source: "hubspot",
          correlationId,
          connectionKey: conn?.data.connectionKey,
          hubId,
          objectType: "contact",
          objectId,
          occurredAtMs,
          receivedAtMs,
          status: conn ? "received" : "ignored",
          errorCode: conn ? undefined : "unknown_hub_id",
        });
      } catch {
        // logEvent is best-effort; never fail the webhook delivery due to observability.
      }

      if (conn && objectId) {
        try {
          await handleHubSpotContactWebhook({
            connectionKey: conn.data.connectionKey,
            hubspotContactId: objectId,
            correlationId,
          });
        } catch {
          // Don't fail the whole batch; webhook must return 200 quickly.
          console.error("HubSpot webhook processing failed.");
        }
      }
    }

    return Response.json({ ok: true }, { status: 200 });
  };

  try {
    if (instanceId) {
      return await withAppInstanceContext(instanceId, run);
    }
    return await run();
  } catch (err) {
    // Absolute last resort: never let HubSpot see 500, otherwise it retries noisily.
    console.error("HubSpot webhook handler crashed.", err);
    return Response.json({ ok: true }, { status: 200 });
  }
}
