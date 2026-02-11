import { hubspotFetchJson, HubSpotNotConnectedError } from "../../hubspot/apiClient";
import { getConnectionKeyFromAuthHeader } from "../../wix/authConnectionKey";

type HubSpotProperty = {
  name: string;
  label: string;
  type: string;
  fieldType?: string;
  hidden?: boolean;
  readOnlyValue?: boolean;
};

type HubSpotPropertiesResponse = {
  results: HubSpotProperty[];
};

export async function GET(req: Request): Promise<Response> {
  try {
    const connectionKey = getConnectionKeyFromAuthHeader(
      req.headers.get("Authorization"),
    );
    if (!connectionKey) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await hubspotFetchJson<HubSpotPropertiesResponse>({
      connectionKey,
      path: "/crm/v3/properties/contacts",
      query: { archived: "false" },
    });

    const results = data.results
      .filter((p) => !p.hidden)
      .map((p) => ({
        name: p.name,
        label: p.label,
        type: p.type,
        fieldType: p.fieldType,
        readOnlyValue: Boolean(p.readOnlyValue),
      }));

    return Response.json({ results }, { status: 200 });
  } catch (err) {
    if (err instanceof HubSpotNotConnectedError) {
      return Response.json({ error: "Not connected" }, { status: 409 });
    }
    console.error("Properties fetch failed.");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

