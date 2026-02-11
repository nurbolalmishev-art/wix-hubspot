import { DEFAULT_HUBSPOT_SCOPES } from "../../hubspot/constants";
import {
  buildHubSpotAuthorizeUrl,
  getHubSpotRedirectUriOrDefault,
} from "../../hubspot/oauth";
import { createSignedState } from "../../hubspot/state";
import { getHubSpotStateSigningSecret } from "../../hubspot/stateSigningSecret";
import { getConnectionKeyFromAuthHeader } from "../../wix/authConnectionKey";
import { ensureAppCollectionsExist } from "../../storage/ensureCollections";
import { bytesToHex, randomBytes } from "../../utils/webCrypto";

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureAppCollectionsExist();
    const connectionKey = getConnectionKeyFromAuthHeader(
      req.headers.get("Authorization"),
    );
    if (!connectionKey) {
      return Response.json(
        { error: "Unauthorized", code: "missing_connection_key" },
        { status: 401 },
      );
    }

    const origin = new URL(req.url).origin;
    const redirectUri = await getHubSpotRedirectUriOrDefault(origin);
    const signingSecret = await getHubSpotStateSigningSecret();

    const state = await createSignedState(signingSecret, {
      connectionKey,
      nonce: bytesToHex(randomBytes(16)),
      issuedAtMs: Date.now(),
    });

    const authorizeUrl = await buildHubSpotAuthorizeUrl({
      redirectUri,
      scopes: DEFAULT_HUBSPOT_SCOPES,
      state,
    });

    return Response.json({ authorizeUrl }, { status: 200 });
  } catch (err) {
    console.error("OAuth start failed.");
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("Missing HubSpot client id secret")) {
      return Response.json({ error: "Missing secret", code: "missing_hubspot_client_id" }, { status: 500 });
    }
    if (msg.includes("Missing HubSpot client secret secret")) {
      return Response.json({ error: "Missing secret", code: "missing_hubspot_client_secret" }, { status: 500 });
    }
    if (msg.includes("Missing HubSpot state signing secret")) {
      return Response.json({ error: "Missing secret", code: "missing_state_signing_secret" }, { status: 500 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

