import { hubspotFetchJson } from "./apiClient";

export type HubSpotContact = {
  id: string;
  properties: Record<string, string | null | undefined>;
};

type HubSpotObjectResponse = {
  id: string;
  properties: Record<string, string>;
};

export async function getContactById(params: {
  connectionKey: string;
  id: string;
  properties: string[];
}): Promise<HubSpotContact> {
  const data = await hubspotFetchJson<HubSpotObjectResponse>({
    connectionKey: params.connectionKey,
    path: `/crm/v3/objects/contacts/${encodeURIComponent(params.id)}`,
    method: "GET",
    query: { properties: params.properties.join(",") },
  });
  return { id: data.id, properties: data.properties };
}
