import { items } from "@wix/data";
import { auth } from "@wix/essentials";
import { COLLECTIONS, collectionId } from "../../storage/collections";
import { elevatedItems } from "../../storage/elevatedItems";
import {
  getAppCredentialsStatus,
  getInstanceIdFromRequest,
  withAppInstanceContext,
} from "../../wix/appInstanceContext";

type WixAppErrorDetails = {
  code: string | null;
  description: string | null;
  message: string;
};

function wixAppErrorDetails(err: unknown): WixAppErrorDetails {
  const fallback: WixAppErrorDetails = {
    code: null,
    description: null,
    message: err instanceof Error ? err.message : String(err),
  };
  if (!err || typeof err !== "object") return fallback;
  const anyErr = err as {
    details?: { applicationError?: { code?: unknown; description?: unknown } };
    code?: unknown;
    message?: unknown;
  };
  const codeFromDetails = anyErr.details?.applicationError?.code;
  const descriptionFromDetails = anyErr.details?.applicationError?.description;
  const code = typeof codeFromDetails === "string" ? codeFromDetails : typeof anyErr.code === "string" ? anyErr.code : null;
  const description = typeof descriptionFromDetails === "string" ? descriptionFromDetails : null;
  const message = typeof anyErr.message === "string" ? anyErr.message : fallback.message;
  return { code, description, message };
}

function compactMsg(s: string, max = 320): string {
  const c = s.trim().replace(/\s+/g, " ");
  return c.length <= max ? c : `${c.slice(0, max)}…`;
}

export async function POST(req: Request): Promise<Response> {
  const receivedAtMs = Date.now();
  const correlationId = `debug:${receivedAtMs}:${Math.random().toString(16).slice(2)}`;

  const instanceId = getInstanceIdFromRequest(req);

  const run = async () => {
    const appCredentials = getAppCredentialsStatus();
    let hasWixContext = false;
    let wixContextError: string | null = null;
    try {
      auth.getContextualAuth();
      hasWixContext = true;
    } catch (err) {
      hasWixContext = false;
      wixContextError = compactMsg(err instanceof Error ? err.message : String(err));
    }

    let tokenInfo: unknown = null;
    try {
      tokenInfo = await auth.getTokenInfo();
    } catch (err) {
      tokenInfo = { error: compactMsg(err instanceof Error ? err.message : String(err)) };
    }

    const body = (await req.json().catch(() => ({}))) as { eventType?: unknown };
    const eventType =
      typeof body.eventType === "string" && body.eventType.length > 0
        ? body.eventType
        : "debug.event";

    const record: Record<string, unknown> = {
      eventType,
      source: "hubspot",
      correlationId,
      receivedAtMs,
      status: "received",
      errorCode: "debug",
    };

    const insertAttempts: Array<Record<string, unknown>> = [
      record,
      // Drop optional fields that might not exist in the schema.
      {
        eventType: record.eventType,
        source: record.source,
        correlationId: record.correlationId,
        receivedAtMs,
      },
      // Coerce receivedAtMs to text (common manual schema variation).
      {
        eventType: record.eventType,
        source: record.source,
        correlationId: record.correlationId,
        receivedAtMs: String(receivedAtMs),
      },
    ];

    const doInsert = async (mode: "elevated" | "plain") => {
      const errors: string[] = [];
      for (const attempt of insertAttempts) {
        try {
          if (mode === "elevated") {
            await elevatedItems.insert(collectionId(COLLECTIONS.eventsLog), attempt);
          } else {
            await items.insert(collectionId(COLLECTIONS.eventsLog), attempt);
          }
          return { ok: true as const, errors };
        } catch (err) {
          const d = wixAppErrorDetails(err);
          const head = d.code ? `${d.code}: ` : "";
          const desc = d.description ? ` (${d.description})` : "";
          errors.push(compactMsg(`${head}${d.message}${desc}`));
        }
      }
      return { ok: false as const, errors };
    };

    const elevatedInsert = await doInsert("elevated");
    const plainInsert = await doInsert("plain");

    const doQuery = async (mode: "elevated" | "plain") => {
      try {
        const q =
          mode === "elevated"
            ? elevatedItems.query(collectionId(COLLECTIONS.eventsLog))
            : items.query(collectionId(COLLECTIONS.eventsLog));
        const res = await q.descending("receivedAtMs").limit(5).find();
        return {
          ok: true as const,
          error: null as string | null,
          count: res.items.length,
        };
      } catch (err) {
        const d = wixAppErrorDetails(err);
        const head = d.code ? `${d.code}: ` : "";
        const desc = d.description ? ` (${d.description})` : "";
        return {
          ok: false as const,
          error: compactMsg(`${head}${d.message}${desc}`),
          count: null as number | null,
        };
      }
    };

    const elevatedQuery = await doQuery("elevated");
    const plainQuery = await doQuery("plain");

    return {
      ok: true,
      instanceId,
      appCredentials,
      hasWixContext,
      wixContextError,
      tokenInfo,
      collectionId: collectionId(COLLECTIONS.eventsLog),
      elevatedInsertOk: elevatedInsert.ok,
      elevatedInsertErrors: elevatedInsert.errors.slice(-3),
      plainInsertOk: plainInsert.ok,
      plainInsertErrors: plainInsert.errors.slice(-3),
      elevatedQueryOk: elevatedQuery.ok,
      elevatedQueryError: elevatedQuery.error,
      elevatedLastItemsCount: elevatedQuery.count,
      plainQueryOk: plainQuery.ok,
      plainQueryError: plainQuery.error,
      plainLastItemsCount: plainQuery.count,
      // Backward-compatible/short fields (for copy-paste troubleshooting).
      insertOk: elevatedInsert.ok || plainInsert.ok,
      insertErrors: [
        ...elevatedInsert.errors.slice(-2).map((e) => `elevated ${e}`),
        ...plainInsert.errors.slice(-2).map((e) => `plain ${e}`),
      ].slice(-3),
      queryOk: elevatedQuery.ok || plainQuery.ok,
      queryError: elevatedQuery.ok ? plainQuery.error : elevatedQuery.error,
      lastItemsCount: elevatedQuery.ok ? elevatedQuery.count : plainQuery.count,
      note: "Call this endpoint from curl (no auth). If you pass ?instanceId=... it will enable app context (via Wix OAuth) and should be able to access Wix Data.",
    };
  };

  if (instanceId) {
    try {
      return Response.json(await withAppInstanceContext(instanceId, run), { status: 200 });
    } catch (err) {
      return Response.json(
        {
          ok: true,
          instanceId,
          appCredentials: getAppCredentialsStatus(),
          contextEnableError: compactMsg(err instanceof Error ? err.message : String(err)),
        },
        { status: 200 },
      );
    }
  }

  return Response.json(await run(), { status: 200 });
}
