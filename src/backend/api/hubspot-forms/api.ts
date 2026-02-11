import { hubspotFetchJson, HubSpotNotConnectedError } from "../../hubspot/apiClient";
import { ensureAppCollectionsExist } from "../../storage/ensureCollections";
import { getConnectionKeyFromAuthHeader } from "../../wix/authConnectionKey";

type HubSpotForm = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

type HubSpotFormsResponse = {
  results: HubSpotForm[];
  paging?: unknown;
};

export async function GET(req: Request): Promise<Response> {
  try {
    await ensureAppCollectionsExist();
    const connectionKey = getConnectionKeyFromAuthHeader(
      req.headers.get("Authorization"),
    );
    if (!connectionKey) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await hubspotFetchJson<HubSpotFormsResponse>({
      connectionKey,
      path: "/marketing/v3/forms/",
      query: { limit: "100" },
    });

    const results = Array.isArray(data.results)
      ? data.results.map((f) => ({ id: f.id, name: f.name }))
      : [];

    return Response.json({ results }, { status: 200 });
  } catch (err) {
    if (err instanceof HubSpotNotConnectedError) {
      return Response.json({ error: "Not connected" }, { status: 409 });
    }
    console.error("Forms list failed.");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

