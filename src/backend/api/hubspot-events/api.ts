import { ensureAppCollectionsExist } from "../../storage/ensureCollections";
import { COLLECTIONS, collectionId } from "../../storage/collections";
import { elevatedItems } from "../../storage/elevatedItems";
import { getConnectionByKey } from "../../storage/connections";
import { getConnectionKeyFromAuthHeader } from "../../wix/authConnectionKey";

export async function GET(req: Request): Promise<Response> {
  try {
    await ensureAppCollectionsExist();
    const connectionKey = getConnectionKeyFromAuthHeader(
      req.headers.get("Authorization"),
    );
    if (!connectionKey) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conn = await getConnectionByKey(connectionKey);

    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.max(1, Math.min(200, Number(limitParam))) : 50;

    // Prefer filtering by hubId (more robust across preview overrides / missing connectionKey logs),
    // but handle common schema mismatches (hubId stored as text) and fall back to connectionKey.
    const makeQuery = () => elevatedItems.query(collectionId(COLLECTIONS.eventsLog));

    const safeLimit = Number.isFinite(limit) ? limit : 50;

    const itemsById = new Map<string, Record<string, unknown>>();
    const pushItems = (its: Array<Record<string, unknown>>) => {
      for (const it of its) {
        const id = typeof it._id === "string" ? it._id : null;
        if (id && !itemsById.has(id)) {
          itemsById.set(id, it);
        }
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

    // If we don't have a connection record yet (not connected) we still want to show
    // recent events for debugging, even though they won't be associated to a connectionKey.
    if (!conn) {
      const resRecent = await makeQuery()
        .descending("receivedAtMs")
        .limit(safeLimit)
        .find();
      pushItems(resRecent.items as unknown as Array<Record<string, unknown>>);
    }

    const allItems = Array.from(itemsById.values()).sort((a, b) => {
      const ra = typeof a.receivedAtMs === "number" ? a.receivedAtMs : Number(a.receivedAtMs) || 0;
      const rb = typeof b.receivedAtMs === "number" ? b.receivedAtMs : Number(b.receivedAtMs) || 0;
      return rb - ra;
    });
    const sliced = allItems.slice(0, safeLimit);

    const events = sliced.map((it) => ({
      eventType: typeof it.eventType === "string" ? it.eventType : "unknown",
      source: typeof it.source === "string" ? it.source : "unknown",
      correlationId: typeof it.correlationId === "string" ? it.correlationId : "",
      objectType: typeof it.objectType === "string" ? it.objectType : "",
      objectId: typeof it.objectId === "string" ? it.objectId : "",
      occurredAtMs: typeof it.occurredAtMs === "number" ? it.occurredAtMs : null,
      receivedAtMs:
        typeof it.receivedAtMs === "number"
          ? it.receivedAtMs
          : typeof it.receivedAtMs === "string"
            ? Number(it.receivedAtMs) || Date.parse(it.receivedAtMs) || null
            : null,
      status: typeof it.status === "string" ? it.status : "",
      errorCode: typeof it.errorCode === "string" ? it.errorCode : null,
    }));

    return Response.json({ events }, { status: 200 });
  } catch (err) {
    console.error("Events fetch failed.", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
