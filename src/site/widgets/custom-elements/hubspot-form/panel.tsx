import React, { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { widget } from "@wix/editor";
import { httpClient } from "@wix/essentials";
import {
  SidePanel,
  WixDesignSystemProvider,
  Dropdown,
  FormField,
  Loader,
  Text,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";

type ConnectionStatus = {
  connected: boolean;
  hubId: number | null;
};

type HubSpotForm = {
  id: string;
  name: string;
};

const Panel: FC = () => {
  const baseApiUrl = useMemo(() => import.meta.env.BASE_API_URL as string, []);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [portalId, setPortalId] = useState<string>("");
  const [region, setRegion] = useState<string>("na1");
  const [forms, setForms] = useState<HubSpotForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const existingPortal = (await widget.getProp("portalId")) as string | undefined;
        const existingRegion = (await widget.getProp("region")) as string | undefined;
        const existingFormId = (await widget.getProp("formId")) as string | undefined;
        if (existingPortal) setPortalId(existingPortal);
        if (existingRegion) setRegion(existingRegion);
        if (existingFormId) setSelectedFormId(existingFormId);

        const statusRes = await httpClient.fetchWithAuth(`${baseApiUrl}/sync-run`);
        const status = (await statusRes.json()) as ConnectionStatus;
        setConnected(Boolean(status.connected));
        if (status.connected && status.hubId && !existingPortal) {
          setPortalId(String(status.hubId));
          widget.setProp("portalId", String(status.hubId));
        }

        if (status.connected) {
          const formsRes = await httpClient.fetchWithAuth(`${baseApiUrl}/hubspot-forms`);
          const formsJson = (await formsRes.json()) as { results: HubSpotForm[] };
          setForms(Array.isArray(formsJson.results) ? formsJson.results : []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [baseApiUrl]);

  const onSelectForm = useCallback((opt: { id: string | number }, _same: boolean) => {
    const id = String(opt.id);
    setSelectedFormId(id);
    widget.setProp("formId", id);
  }, []);

  const onSelectRegion = useCallback((opt: { id: string | number }, _same: boolean) => {
    const id = String(opt.id);
    setRegion(id);
    widget.setProp("region", id);
  }, []);

  return (
    <WixDesignSystemProvider>
      <SidePanel width="320" height="100vh">
        <SidePanel.Content noPadding stretchVertically>
          <SidePanel.Field>
            {loading ? (
              <Loader />
            ) : !connected ? (
              <Text size="small">
                HubSpot не подключён. Сначала подключи аккаунт в Dashboard, затем вернись в настройки виджета.
              </Text>
            ) : (
              <>
                <FormField label="Region">
                  <Dropdown
                    selectedId={region}
                    options={[
                      { id: "na1", value: "na1" },
                      { id: "eu1", value: "eu1" },
                    ]}
                    onSelect={onSelectRegion}
                  />
                </FormField>

                <FormField label="HubSpot Form">
                  <Dropdown
                    selectedId={selectedFormId || undefined}
                    placeholder="Select form"
                    options={forms.map((f) => ({ id: f.id, value: f.name }))}
                    onSelect={onSelectForm}
                  />
                </FormField>
              </>
            )}
          </SidePanel.Field>
        </SidePanel.Content>
      </SidePanel>
    </WixDesignSystemProvider>
  );
};

export default Panel;

