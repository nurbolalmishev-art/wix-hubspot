import { secrets } from "@wix/secrets";
import { auth } from "@wix/essentials";
import { getConnectionKeyFromAuthHeader } from "../../wix/authConnectionKey";

type SecretCheckResult =
  | { name: string; ok: true }
  | { name: string; ok: false; reason: "empty_or_missing" | "error"; errorMessage?: string };

type MaybeSecretValueResponse =
  | string
  | {
      value?: string;
      secret?: { value?: string };
    };

function extractSecretValue(res: MaybeSecretValueResponse): string | null {
  if (typeof res === "string") return res;
  if (res && typeof res === "object") {
    if (typeof res.value === "string") return res.value;
    if (res.secret && typeof res.secret.value === "string") return res.secret.value;
  }
  return null;
}

function isSecretNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as {
    details?: { applicationError?: { code?: string } };
  };
  return anyErr.details?.applicationError?.code === "SECRET_NOT_FOUND";
}

async function checkSecret(name: string): Promise<SecretCheckResult> {
  try {
    const getSecretValueElevated = auth.elevate(secrets.getSecretValue);
    const res = (await getSecretValueElevated(name)) as MaybeSecretValueResponse;
    const v = extractSecretValue(res);
    if (typeof v === "string" && v.length > 0) {
      return { name, ok: true };
    }
    return { name, ok: false, reason: "empty_or_missing" };
  } catch (err) {
    if (isSecretNotFoundError(err)) {
      return { name, ok: false, reason: "empty_or_missing" };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { name, ok: false, reason: "error", errorMessage: msg.slice(0, 300) };
  }
}

export async function GET(req: Request): Promise<Response> {
  const connectionKey = getConnectionKeyFromAuthHeader(req.headers.get("Authorization"));

  const names = [
    "hubspot_client_id",
    "hubspot_client_secret",
    "hubspot_state_signing_key",
    "hubspot_encryption_key",
    "hubspot_redirect_uri",
  ] as const;

  const results = await Promise.all(names.map((n) => checkSecret(n)));

  return Response.json(
    {
      connectionKey,
      secrets: results,
      note: "Значения секретов не возвращаются. ok=true означает, что секрет читается и непустой.",
    },
    { status: 200 },
  );
}

