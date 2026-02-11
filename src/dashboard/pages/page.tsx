import React, { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { dashboard } from "@wix/dashboard";
import { httpClient } from "@wix/essentials";
import {
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Dropdown,
  FormField,
  Loader,
  Page,
  Table,
  Text,
  WixDesignSystemProvider,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";

type ConnectionStatus = {
  connected: boolean;
  hubId: number | null;
  scopes: string[];
  tokenExpiresInMs: number | null;
};

type HubSpotProperty = {
  name: string;
  label: string;
  type: string;
  fieldType?: string;
  readOnlyValue?: boolean;
};

type MappingDirection = "wix_to_hubspot" | "hubspot_to_wix" | "bidirectional";
type MappingTransform = "none" | "trim" | "lowercase";

type MappingRow = {
  wixFieldKey: string;
  hubspotPropertyName: string;
  direction: MappingDirection;
  transform: MappingTransform;
};

type EventRow = {
  eventType: string;
  source: string;
  correlationId: string;
  objectType: string;
  objectId: string;
  occurredAtMs: number | null;
  receivedAtMs: number | null;
  status: string;
  errorCode: string | null;
};

const WIX_FIELDS: Array<{ value: string; label: string }> = [
  { value: "email", label: "Email" },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "phone", label: "Phone" },
];

function msToHuman(ms: number | null): string {
  if (ms === null) {
    return "—";
  }
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h`;
}

const Index: FC = () => {
  const baseApiUrl = useMemo(() => import.meta.env.BASE_API_URL as string, []);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [hubspotProperties, setHubspotProperties] = useState<HubSpotProperty[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [savingMappings, setSavingMappings] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const statusRes = await httpClient.fetchWithAuth(`${baseApiUrl}/sync-run`);
      const statusJson = (await statusRes.json()) as ConnectionStatus;
      setStatus(statusJson);

      const mappingsRes = await httpClient.fetchWithAuth(
        `${baseApiUrl}/hubspot-mappings`,
      );
      const mappingsJson = (await mappingsRes.json()) as { mappings: MappingRow[] };
      setMappings(Array.isArray(mappingsJson.mappings) ? mappingsJson.mappings : []);

      if (statusJson.connected) {
        const propsRes = await httpClient.fetchWithAuth(
          `${baseApiUrl}/hubspot-properties`,
        );
        const propsJson = (await propsRes.json()) as { results: HubSpotProperty[] };
        setHubspotProperties(Array.isArray(propsJson.results) ? propsJson.results : []);
      } else {
        setHubspotProperties([]);
      }

      const eventsRes = await httpClient.fetchWithAuth(
        `${baseApiUrl}/hubspot-events?limit=30`,
      );
      const eventsJson = (await eventsRes.json()) as { events: EventRow[] };
      setEvents(Array.isArray(eventsJson.events) ? eventsJson.events : []);
    } catch (err) {
      console.error(err);
      dashboard.showToast({ message: "Failed to load data.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [baseApiUrl]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; code?: string; state?: string } | null;
      if (!data?.type) return;
      if (data.type === "hubspot_oauth_done") {
        void loadAll();
        return;
      }
      if (data.type === "hubspot_oauth_callback" && data.code && data.state) {
        void (async () => {
          try {
            const res = await httpClient.fetchWithAuth(`${baseApiUrl}/hubspot-oauth-finish`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: data.code, state: data.state }),
            });
            if (!res.ok) {
              const txt = await res.text();
              throw new Error(txt);
            }
            dashboard.showToast({ message: "HubSpot connected.", type: "success" });
            await loadAll();
          } catch (err) {
            console.error(err);
            dashboard.showToast({ message: "Failed to complete OAuth.", type: "error" });
          }
        })();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [baseApiUrl, loadAll]);

  const onConnect = useCallback(async () => {
    try {
      const res = await httpClient.fetchWithAuth(`${baseApiUrl}/hubspot-oauth-start`, {
        method: "POST",
      });
      const json = (await res.json()) as { authorizeUrl?: string };
      if (!json.authorizeUrl) {
        dashboard.showToast({ message: "Failed to start OAuth.", type: "error" });
        return;
      }
      // We intentionally keep `window.opener` enabled so the callback can
      // communicate back to this dashboard page with postMessage.
      window.open(json.authorizeUrl, "_blank", "popup,width=900,height=700");
    } catch {
      dashboard.showToast({ message: "Failed to start OAuth.", type: "error" });
    }
  }, [baseApiUrl]);

  const onDisconnect = useCallback(async () => {
    try {
      await httpClient.fetchWithAuth(`${baseApiUrl}/hubspot-disconnect`, {
        method: "POST",
      });
      await loadAll();
      dashboard.showToast({ message: "HubSpot disconnected.", type: "success" });
    } catch {
      dashboard.showToast({ message: "Failed to disconnect HubSpot.", type: "error" });
    }
  }, [baseApiUrl, loadAll]);

  const connectionBadge = useMemo(() => {
    if (!status) {
      return <Badge skin="neutral">—</Badge>;
    }
    return status.connected ? (
      <Badge skin="success">Connected</Badge>
    ) : (
      <Badge skin="warning">Not connected</Badge>
    );
  }, [status]);

  const endpoints = useMemo(() => {
    // `BASE_API_URL` is expected to be something like: https://<domain>/functions
    const webhookUrl = `${baseApiUrl}/hubspot-webhook`;
    const oauthCallbackUrl = `${baseApiUrl}/hubspot-oauth-callback`;
    return { webhookUrl, oauthCallbackUrl, baseApiUrl };
  }, [baseApiUrl]);

  const addMappingRow = useCallback(() => {
    setMappings((prev) => [
      ...prev,
      {
        wixFieldKey: "email",
        hubspotPropertyName: "",
        direction: "bidirectional",
        transform: "none",
      },
    ]);
  }, []);

  const updateMappingRow = useCallback(
    (idx: number, patch: Partial<MappingRow>) => {
      setMappings((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  const removeMappingRow = useCallback((idx: number) => {
    setMappings((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const duplicateHubspotProp = useMemo(() => {
    const seen = new Set<string>();
    for (const m of mappings) {
      if (!m.hubspotPropertyName) continue;
      if (seen.has(m.hubspotPropertyName)) return true;
      seen.add(m.hubspotPropertyName);
    }
    return false;
  }, [mappings]);

  const onSaveMappings = useCallback(async () => {
    if (duplicateHubspotProp) {
      dashboard.showToast({
        message: "Нельзя маппить один HubSpot property дважды.",
        type: "error",
      });
      return;
    }
    const cleaned = mappings.filter((m) => m.hubspotPropertyName.length > 0);
    setSavingMappings(true);
    try {
      const res = await httpClient.fetchWithAuth(`${baseApiUrl}/hubspot-mappings`, {
        method: "POST",
        body: JSON.stringify({ mappings: cleaned }),
      });
      if (!res.ok) {
        dashboard.showToast({ message: "Failed to save mapping.", type: "error" });
        return;
      }
      dashboard.showToast({ message: "Mapping saved.", type: "success" });
      await loadAll();
    } catch {
      dashboard.showToast({ message: "Failed to save mapping.", type: "error" });
    } finally {
      setSavingMappings(false);
    }
  }, [baseApiUrl, duplicateHubspotProp, loadAll, mappings]);

  if (loading) {
    return (
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Box padding="24px">
          <Loader />
        </Box>
      </WixDesignSystemProvider>
    );
  }

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="HubSpot Sync"
          subtitle="Connection, field mapping and observability."
          actionsBar={
            <Box gap="12px">
              <Button priority="secondary" onClick={loadAll}>
                Refresh
              </Button>
              {status?.connected ? (
                <Button priority="secondary" onClick={onDisconnect}>
                  Disconnect
                </Button>
              ) : (
                <Button onClick={onConnect}>Connect HubSpot</Button>
              )}
            </Box>
          }
        />

        <Page.Content>
          <Box direction="vertical" gap="24px">
            <Card>
              <Card.Header title="Connection" suffix={connectionBadge} />
              <Card.Content>
                <Box direction="vertical" gap="12px">
                  <Text size="small">
                    Hub ID: <b>{status?.hubId ?? "—"}</b>
                  </Text>
                  <Text size="small">
                    Access token expires in: <b>{msToHuman(status?.tokenExpiresInMs ?? null)}</b>
                  </Text>
                  <Text size="tiny" secondary>
                    Scopes: {(status?.scopes ?? []).join(", ") || "—"}
                  </Text>

                </Box>
              </Card.Content>
            </Card>

            <Card>
              <Card.Header
                title="Field mapping"
                subtitle="Configure which fields to sync and in which direction."
                suffix={
                  <Box gap="12px">
                    <Button priority="secondary" onClick={addMappingRow}>
                      Add row
                    </Button>
                    <Button onClick={onSaveMappings} disabled={savingMappings}>
                      {savingMappings ? "Saving..." : "Save mapping"}
                    </Button>
                  </Box>
                }
              />
              <Card.Content>
                {!status?.connected ? (
                  <Text size="small">
                    First connect HubSpot to load the list of properties.
                  </Text>
                ) : (
                  <Box direction="vertical" gap="12px">
                    {duplicateHubspotProp ? (
                      <Text size="small" skin="error">
                        The same HubSpot property is selected in multiple rows.
                      </Text>
                    ) : null}
                    <Divider />
                    {mappings.length === 0 ? (
                      <Text size="small">
                        There are no mapping rules yet. Click “Add row”.
                      </Text>
                    ) : null}

                    {mappings.map((row, idx) => (
                      <Box key={idx} gap="12px" align="center">
                        <Box width="220px">
                          <FormField label="Wix field">
                            <Dropdown
                              selectedId={row.wixFieldKey}
                              options={WIX_FIELDS.map((f) => ({
                                id: f.value,
                                value: f.value,
                              }))}
                              onSelect={(opt) =>
                                updateMappingRow(idx, { wixFieldKey: String(opt.id) })
                              }
                            />
                          </FormField>
                        </Box>

                        <Box width="320px">
                          <FormField label="HubSpot property">
                            <Dropdown
                              selectedId={row.hubspotPropertyName || undefined}
                              placeholder="Select property"
                              options={hubspotProperties
                                .filter((p) => !p.readOnlyValue)
                                .slice(0, 500)
                                .map((p) => ({
                                  id: p.name,
                                  value: `${p.label} (${p.name})`,
                                }))}
                              onSelect={(opt) =>
                                updateMappingRow(idx, {
                                  hubspotPropertyName: String(opt.id),
                                })
                              }
                            />
                          </FormField>
                        </Box>

                        <Box width="220px">
                          <FormField label="Direction">
                            <Dropdown
                              selectedId={row.direction}
                              options={[
                                { id: "wix_to_hubspot", value: "Wix → HubSpot" },
                                { id: "hubspot_to_wix", value: "HubSpot → Wix" },
                                { id: "bidirectional", value: "Bi-directional" },
                              ]}
                              onSelect={(opt) =>
                                updateMappingRow(idx, { direction: opt.id as MappingDirection })
                              }
                            />
                          </FormField>
                        </Box>

                        <Box width="180px">
                          <FormField label="Transform">
                            <Dropdown
                              selectedId={row.transform}
                              options={[
                                { id: "none", value: "None" },
                                { id: "trim", value: "Trim" },
                                { id: "lowercase", value: "Lowercase" },
                              ]}
                              onSelect={(opt) =>
                                updateMappingRow(idx, { transform: opt.id as MappingTransform })
                              }
                            />
                          </FormField>
                        </Box>

                        <Box>
                          <Button priority="secondary" onClick={() => removeMappingRow(idx)}>
                            Remove
                          </Button>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Card.Content>
            </Card>

            <Card>
              <Card.Header
                title="Last events"
                subtitle="Basic observability for debugging."
              />
              <Card.Content>
                <Table
                  data={events}
                  columns={[
                    { title: "Source", render: (row: EventRow) => row.source },
                    { title: "Type", render: (row: EventRow) => row.eventType },
                    { title: "Object", render: (row: EventRow) => `${row.objectType}:${row.objectId}` },
                    { title: "Status", render: (row: EventRow) => row.status },
                    { title: "Received", render: (row: EventRow) => (row.receivedAtMs ? new Date(row.receivedAtMs).toLocaleString() : "—") },
                    { title: "Err", render: (row: EventRow) => row.errorCode || "" },
                  ]}
                  itemsPerPage={10}
                />
              </Card.Content>
            </Card>
          </Box>
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default Index;
