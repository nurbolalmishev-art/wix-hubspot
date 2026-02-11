import { AppStrategy, createClient } from "@wix/sdk";

import { base64UrlDecodeToString } from "../utils/base64url";

type GlobalWixContext = {
  client?: unknown;
  elevatedClient?: unknown;
};

type EnvSource = "import.meta.env" | "process.env" | null;

function isAppSecretPlaceholder(v: string | null): boolean {
  // IMPORTANT: Do not embed the full placeholder token as a contiguous substring anywhere
  // in the build output. Wix CLI upload replaces that token with the real secret; if our
  // detection token is also replaced, we may incorrectly treat a real secret as a placeholder.
  if (!v) return false;
  const placeholderLen = "__APP".length + "_SECRET__".length; // "__APP_SECRET__"
  return v.length === placeholderLen && v.startsWith("__APP") && v.endsWith("_SECRET__");
}

function readNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function readProcessEnv(key: string): string | null {
  const env = (globalThis as unknown as { process?: { env?: Record<string, unknown> } }).process?.env;
  return readNonEmptyString(env?.[key]);
}

function readAppIdAndSecretFromEnv(): {
  appId: string | null;
  appSecret: string | null;
  appIdSource: EnvSource;
  appSecretSource: EnvSource;
  appSecretIsPlaceholder: boolean;
} {
  // IMPORTANT: Access `import.meta.env.X` directly so the Wix CLI build (Vite define)
  // can inline these values. Reading `import.meta.env` dynamically may be undefined
  // in some runtimes.
  const meta = import.meta.env as unknown as { APP_ID?: unknown; APP_SECRET?: unknown };
  const metaAppId = readNonEmptyString(meta.APP_ID);
  const metaAppSecret = readNonEmptyString(meta.APP_SECRET);
  const metaSecretIsPlaceholder = isAppSecretPlaceholder(metaAppSecret);

  const procAppId =
    readProcessEnv("APP_ID") ||
    readProcessEnv("WIX_APP_ID") ||
    readProcessEnv("WIX_APP_DEF_ID") ||
    null;
  const procAppSecret =
    readProcessEnv("APP_SECRET") ||
    readProcessEnv("WIX_APP_SECRET") ||
    readProcessEnv("WIX_APP_SECRET_KEY") ||
    null;

  const appId = metaAppId || procAppId;
  const appIdSource: EnvSource = metaAppId ? "import.meta.env" : procAppId ? "process.env" : null;

  // If the build-time placeholder wasn't replaced, treat it as missing so we don't
  // attempt Wix OAuth with an invalid secret.
  const appSecretCandidate = metaSecretIsPlaceholder ? null : metaAppSecret || null;
  const appSecret = appSecretCandidate || procAppSecret;
  const appSecretSource: EnvSource = appSecretCandidate
    ? "import.meta.env"
    : procAppSecret
      ? "process.env"
      : null;

  return {
    appId,
    appSecret,
    appIdSource,
    appSecretSource,
    appSecretIsPlaceholder: metaSecretIsPlaceholder,
  };
}

function getAppCredentials(): { appId: string | null; appSecret: string | null } {
  const { appId, appSecret } = readAppIdAndSecretFromEnv();
  return { appId, appSecret };
}

export function getAppCredentialsStatus(): {
  appIdPresent: boolean;
  appIdSource: EnvSource;
  appSecretPresent: boolean;
  appSecretSource: EnvSource;
  appSecretIsPlaceholder: boolean;
} {
  const { appId, appSecret, appIdSource, appSecretSource, appSecretIsPlaceholder } =
    readAppIdAndSecretFromEnv();
  return {
    appIdPresent: Boolean(appId),
    appIdSource,
    appSecretPresent: Boolean(appSecret),
    appSecretSource,
    appSecretIsPlaceholder,
  };
}

function readGlobalWixContext(): GlobalWixContext | undefined {
  return (globalThis as unknown as { __wix_context__?: GlobalWixContext }).__wix_context__;
}

function writeGlobalWixContext(v: GlobalWixContext | undefined): void {
  (globalThis as unknown as { __wix_context__?: GlobalWixContext }).__wix_context__ = v;
}

function parseInstanceIdFromInstanceToken(instance: string): string | null {
  // Wix "instance" is often a 2-part token: "<signature>.<payloadB64u>".
  const parts = instance.split(".");
  if (parts.length < 2) return null;

  const payloadB64u = parts[1] ?? "";
  if (!payloadB64u) return null;

  try {
    const json = base64UrlDecodeToString(payloadB64u);
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const instanceId = (parsed as { instanceId?: unknown }).instanceId;
    return typeof instanceId === "string" && instanceId.length > 0 ? instanceId : null;
  } catch {
    return null;
  }
}

export function getInstanceIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  const direct =
    url.searchParams.get("instanceId") ||
    url.searchParams.get("wixInstanceId") ||
    url.searchParams.get("instance_id");
  if (direct && direct.length > 0) return direct;

  const instance = url.searchParams.get("instance");
  if (instance && instance.length > 0) {
    return parseInstanceIdFromInstanceToken(instance);
  }

  return null;
}

export async function withAppInstanceContext<T>(
  instanceId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const { appId, appSecret } = getAppCredentials();
  if (!appId || !appSecret) {
    throw new Error(
      "Missing Wix app credentials (APP_ID/APP_SECRET). " +
        "In preview/release, Wix CLI injects your App Secret during upload. " +
        "If it stays missing, ensure your app has an App Secret in Wix Dev Center and that you're logged in to the right account.",
    );
  }

  const prev = readGlobalWixContext();
  try {
    const wixClient = createClient({
      auth: AppStrategy({ appId, appSecret, instanceId }),
    });

    // We use global context because `@wix/data` modules rely on it.
    // Restore the previous global context afterwards to reduce cross-request leakage.
    wixClient.enableContext("global");
    wixClient.enableContext("global", { elevated: true });

    return await fn();
  } finally {
    writeGlobalWixContext(prev);
  }
}
