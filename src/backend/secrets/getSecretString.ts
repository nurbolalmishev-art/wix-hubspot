import { secrets } from "@wix/secrets";
import { auth } from "@wix/essentials";

type MaybeSecretValueResponse =
  | string
  | {
      value?: string;
      secret?: { value?: string };
    };

function isSecretNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as {
    details?: { applicationError?: { code?: string } };
  };
  return anyErr.details?.applicationError?.code === "SECRET_NOT_FOUND";
}

function extractSecretValue(res: MaybeSecretValueResponse): string | null {
  if (typeof res === "string") {
    return res;
  }
  if (res && typeof res === "object") {
    if (typeof res.value === "string") {
      return res.value;
    }
    if (res.secret && typeof res.secret.value === "string") {
      return res.secret.value;
    }
  }
  return null;
}

export async function getSecretString(name: string): Promise<string | null> {
  try {
    const getSecretValueElevated = auth.elevate(secrets.getSecretValue);
    const res = (await getSecretValueElevated(name)) as MaybeSecretValueResponse;
    return extractSecretValue(res);
  } catch (err) {
    if (isSecretNotFoundError(err)) {
      return null;
    }
    console.error("Failed to read secret value.");
    return null;
  }
}

