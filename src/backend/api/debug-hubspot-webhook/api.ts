import { logEvent } from "../../storage/eventsLog";

function pickHeader(req: Request, name: string): string | null {
  const v = req.headers.get(name);
  if (!v) return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function mask(v: string | null): string | null {
  if (!v) return null;
  // Don't leak full signatures into logs.
  if (v.length <= 16) return "***";
  return `${v.slice(0, 6)}…${v.slice(-6)}`;
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text().catch(() => "");
  const receivedAtMs = Date.now();

  const diag = {
    method: req.method,
    url: req.url,
    headers: {
      host: pickHeader(req, "Host"),
      xForwardedProto: pickHeader(req, "X-Forwarded-Proto"),
      xForwardedHost: pickHeader(req, "X-Forwarded-Host"),
      xForwardedUri: pickHeader(req, "X-Forwarded-Uri"),
      xOriginalUrl: pickHeader(req, "X-Original-URL"),
      xOriginalUri: pickHeader(req, "X-Original-URI"),
      userAgent: pickHeader(req, "User-Agent"),
      contentType: pickHeader(req, "Content-Type"),
      hubspotSignatureV3: mask(pickHeader(req, "X-HubSpot-Signature-V3")),
      hubspotRequestTimestamp: pickHeader(req, "X-HubSpot-Request-Timestamp"),
      hubspotSignatureV2: mask(pickHeader(req, "X-HubSpot-Signature")),
      hubspotSignatureVersion: pickHeader(req, "X-HubSpot-Signature-Version"),
    },
    bodyLength: rawBody.length,
  };

  console.log("DEBUG HubSpot webhook received:", JSON.stringify(diag));
  try {
    await logEvent({
      eventType: "debug.webhook.headers",
      source: "hubspot",
      correlationId: `debug:${receivedAtMs}:${Math.random().toString(16).slice(2)}`,
      receivedAtMs,
      status: "received",
      // Keep this compact; no signature values, just presence and routing hints.
      errorCode: JSON.stringify({
        hv3: Boolean(diag.headers.hubspotSignatureV3),
        ts: Boolean(diag.headers.hubspotRequestTimestamp),
        hv2: Boolean(diag.headers.hubspotSignatureV2),
        ver: diag.headers.hubspotSignatureVersion || null,
        xfProto: diag.headers.xForwardedProto || null,
        xfHost: diag.headers.xForwardedHost || null,
        xfUri: diag.headers.xForwardedUri || null,
        host: diag.headers.host || null,
      }).slice(0, 300),
    });
  } catch {
    // ignore
  }

  return Response.json(
    {
      ok: true,
      note: "This is a debug endpoint. It always returns 200 and only logs header presence (signatures masked).",
    },
    { status: 200 },
  );
}

