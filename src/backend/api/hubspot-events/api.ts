import { COLLECTIONS, collectionId } from "../../storage/collections";
import { elevatedItems } from "../../storage/elevatedItems";
import { getConnectionByKey } from "../../storage/connections";
import { getConnectionKeyFromAuthHeader } from "../../wix/authConnectionKey";

export async function GET(req: Request): Promise<Response> {
  try {
    const connectionKey = getConnectionKeyFromAuthHeader(
      req.headers.get("Authorization"),
    );
    if (!connectionKey) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conn = await getConnectionByKey(connectionKey);

    const reqUrl = new URL(req.url);
    const limitParam = reqUrl.searchParams.get("limit");
    const limit = limitParam ? Math.max(1, Math.min(200, Number(limitParam))) : 50;
    const safeLimit = Number.isFinite(limit) ? limit : 50;

    const itemsById = new Map<string, Record<string, unknown>>();
    const makeQuery = () => elevatedItems.query(collectionId(COLLECTIONS.eventsLog));
    const pushItems = (its: Array<Record<string, unknown>>) => {
      for (const it of its) {
        const id = typeof it._id === "string" ? it._id : null;
        if (id && !itemsById.has(id)) itemsById.set(id, it);
      }
    };

    if (conn?.data.hubId) {
      const hubId = conn.data.hubId;
      const resNum = await makeQuery()
        .eq("hubId", hubId as never)
        .descending("receivedAtMs")
        .limit(safeLimit)
        .find();
      pushItems(resNum.items as unknown as Array<Record<string, unknown>>);
      const resStr = await makeQuery()
        .eq("hubId", String(hubId) as never)
        .descending("receivedAtMs")
        .limit(safeLimit)
        .find();
      pushItems(resStr.items as unknown as Array<Record<string, unknown>>);
    }

    const resByKey = await makeQuery()
      .eq("connectionKey", connectionKey)
      .descending("receivedAtMs")
      .limit(safeLimit)
      .find();
    pushItems(resByKey.items as unknown as Array<Record<string, unknown>>);

    const events = Array.from(itemsById.values())
      .sort((a, b) => {
        const aMs = typeof a.receivedAtMs === "number" ? a.receivedAtMs : 0;
        const bMs = typeof b.receivedAtMs === "number" ? b.receivedAtMs : 0;
        return bMs - aMs;
      })
      .slice(0, safeLimit)
      .map((it) => ({
        eventType: it.eventType,
        source: it.source,
        correlationId: it.correlationId,
        objectType: it.objectType,
        objectId: it.objectId,
        occurredAtMs: it.occurredAtMs ?? null,
        receivedAtMs: it.receivedAtMs,
        status: it.status,
        errorCode: it.errorCode ?? null,
      }));

    return Response.json({ events }, { status: 200 });
  } catch {
    console.error("HubSpot events fetch failed.");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
