import React, { type FC, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import reactToWebComponent from "react-to-webcomponent";
import styles from "./element.module.css";

declare global {
  interface Window {
    hbspt?: {
      forms?: {
        create: (opts: Record<string, unknown>) => void;
      };
    };
  }
}

type Props = {
  portalId?: string;
  formId?: string;
  region?: string;
};

function getUtmParams(): Record<string, string | undefined> {
  const url = new URL(window.location.href);
  const p = url.searchParams;
  return {
    utmSource: p.get("utm_source") || undefined,
    utmMedium: p.get("utm_medium") || undefined,
    utmCampaign: p.get("utm_campaign") || undefined,
    utmTerm: p.get("utm_term") || undefined,
    utmContent: p.get("utm_content") || undefined,
  };
}

function loadHubSpotEmbed(): Promise<void> {
  const src = "https://js.hsforms.net/forms/embed/v2.js";
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load HubSpot embed script"));
    document.head.appendChild(s);
  });
}

const HubSpotFormElement: FC<Props> = ({ portalId, formId, region = "na1" }) => {
  const targetId = useMemo(
    () => `hubspot-form-${Math.random().toString(16).slice(2)}`,
    [],
  );

  useEffect(() => {
    if (!portalId || !formId) return;

    void (async () => {
      await loadHubSpotEmbed();
      if (!window.hbspt?.forms?.create) {
        return;
      }

      const target = document.getElementById(targetId);
      if (target) {
        target.innerHTML = "";
      }

      window.hbspt.forms.create({
        region,
        portalId,
        formId,
        target: `#${targetId}`,
        onFormSubmitted: () => {
          // Minimal observability: no PII, only attribution + context.
          const payload = {
            hubId: Number(portalId),
            formId,
            pageUrl: window.location.href,
            referrer: document.referrer || undefined,
            occurredAtMs: Date.now(),
            ...getUtmParams(),
          };
          fetch(`${import.meta.env.BASE_API_URL}/hubspot-form-event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(() => {});
        },
      });
    })();
  }, [formId, portalId, region, targetId]);

  if (!portalId || !formId) {
    return (
      <div className={styles.root}>
        <div className={styles.placeholder}>
          Выбери HubSpot форму в настройках виджета.
        </div>
      </div>
    );
  }

  return <div className={styles.root} id={targetId} />;
};

const customElement = reactToWebComponent(
  HubSpotFormElement,
  React,
  ReactDOM as any,
  {
    props: {
      portalId: "string",
      formId: "string",
      region: "string",
    },
  },
);

export default customElement;

