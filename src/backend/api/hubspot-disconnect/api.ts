import { clearConnection } from "../../storage/connections";
import { getConnectionKeyFromAuthHeader } from "../../wix/authConnectionKey";

export async function POST(req: Request): Promise<Response> {
  try {
    const connectionKey = getConnectionKeyFromAuthHeader(
      req.headers.get("Authorization"),
    );
    if (!connectionKey) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await clearConnection(connectionKey);
    return Response.json({ ok: true }, { status: 200 });
  } catch {
    console.error("Disconnect failed.");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

