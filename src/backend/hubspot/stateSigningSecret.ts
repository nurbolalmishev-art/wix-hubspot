import { getSecretString } from "../secrets/getSecretString";

const STATE_SECRET_NAME = "hubspot_state_signing_key";
const FALLBACK_ENC_KEY_NAME = "hubspot_encryption_key";

export async function getHubSpotStateSigningSecret(): Promise<string> {
  const direct = await getSecretString(STATE_SECRET_NAME);
  if (direct) {
    return direct;
  }
  const fallback = await getSecretString(FALLBACK_ENC_KEY_NAME);
  if (fallback) {
    return fallback;
  }
  throw new Error("Missing HubSpot state signing secret.");
}

