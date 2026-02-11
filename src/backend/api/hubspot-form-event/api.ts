import { ensureAppCollectionsExist } from "../../storage/ensureCollections";
import { getConnectionByHubId } from "../../storage/connections";
import { logFormEvent } from "../../storage/formEvents";

type Payload = {
  hubId?: number;
  formId?: string;
  pageUrl?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  occurredAtMs?: number;
};

function clampString(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.slice(0, max);
  return s.length > 0 ? s : undefined;
}

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureAppCollectionsExist();
    const body = (await req.json()) as Payload;
    const hubId = typeof body.hubId === "number" ? body.hubId : null;
    const formId = clampString(body.formId, 200);
    if (!hubId || !formId) {
      return Response.json({ error: "Invalid payload" }, { status: 400 });
    }

    const conn = await getConnectionByHubId(hubId);
    if (!conn) {
      return Response.json({ ok: true }, { status: 200 });
    }

    const receivedAtMs = Date.now();
    const occurredAtMs =
      typeof body.occurredAtMs === "number" ? body.occurredAtMs : receivedAtMs;

    const correlationId = `form:${hubId}:${formId}:${receivedAtMs}:${Math.random().toString(16).slice(2)}`;

    await logFormEvent({
      hubId,
      formId,
      correlationId,
      pageUrl: clampString(body.pageUrl, 2000),
      referrer: clampString(body.referrer, 2000),
      utmSource: clampString(body.utmSource, 200),
      utmMedium: clampString(body.utmMedium, 200),
      utmCampaign: clampString(body.utmCampaign, 200),
      utmTerm: clampString(body.utmTerm, 200),
      utmContent: clampString(body.utmContent, 200),
      occurredAtMs,
      receivedAtMs,
    });

    return Response.json({ ok: true }, { status: 200 });
  } catch {
    // Don't leak details; and don't block form submission UX.
    return Response.json({ ok: true }, { status: 200 });
  }
}

