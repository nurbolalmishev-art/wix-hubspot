import { getConnectionKeyFromAuthHeader } from "../../wix/authConnectionKey";

export async function GET(req: Request): Promise<Response> {
  const connectionKey = getConnectionKeyFromAuthHeader(
    req.headers.get("Authorization"),
  );
  return Response.json({ connectionKey }, { status: 200 });
}

