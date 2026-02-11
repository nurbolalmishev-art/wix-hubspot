import { hubspotFetchJson } from "./apiClient";

export type HubSpotContact = {
  id: string;
  properties: Record<string, string | null | undefined>;
};

type HubSpotObjectResponse = {
  id: string;
  properties: Record<string, string>;
};

type HubSpotSearchResponse = {
  total: number;
  results: HubSpotObjectResponse[];
};

export async function searchContactByEmail(params: {
  connectionKey: string;
  email: string;
  properties?: string[];
}): Promise<HubSpotContact | null> {
  const data = await hubspotFetchJson<HubSpotSearchResponse>({
    connectionKey: params.connectionKey,
    path: "/crm/v3/objects/contacts/search",
    method: "POST",
    body: {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: "EQ",
              value: params.email,
            },
          ],
        },
      ],
      properties: params.properties ?? ["email", "lastmodifieddate"],
      limit: 1,
    },
  });
  const first = data.results[0];
  if (!first?.id) return null;
  return { id: first.id, properties: first.properties };
}

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

export async function createContact(params: {
  connectionKey: string;
  properties: Record<string, string>;
}): Promise<HubSpotContact> {
  const data = await hubspotFetchJson<HubSpotObjectResponse>({
    connectionKey: params.connectionKey,
    path: "/crm/v3/objects/contacts",
    method: "POST",
    body: { properties: params.properties },
  });
  return { id: data.id, properties: data.properties };
}

export async function updateContact(params: {
  connectionKey: string;
  id: string;
  properties: Record<string, string>;
}): Promise<void> {
  await hubspotFetchJson<unknown>({
    connectionKey: params.connectionKey,
    path: `/crm/v3/objects/contacts/${encodeURIComponent(params.id)}`,
    method: "PATCH",
    body: { properties: params.properties },
  });
}

