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
    if (!conn) {
      return Response.json({ connected: false }, { status: 200 });
    }

    const now = Date.now();
    const expiresInMs = conn.data.tokenExpiresAtMs
      ? Math.max(0, conn.data.tokenExpiresAtMs - now)
      : null;

    return Response.json(
      {
        connected: Boolean(conn.data.refreshToken || conn.data.tokenEnc),
        hubId: conn.data.hubId || null,
        scopes: conn.data.scopes || [],
        tokenExpiresInMs: expiresInMs,
      },
      { status: 200 },
    );
  } catch {
    console.error("Sync status failed.");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

