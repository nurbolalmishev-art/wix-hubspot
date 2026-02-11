import { listMappings, replaceMappings, type FieldMapping, type MappingDirection, type MappingTransform } from "../../storage/mappings";
import { getConnectionKeyFromAuthHeader } from "../../wix/authConnectionKey";

function isString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

function parseDirection(x: unknown): MappingDirection | null {
  if (x === "wix_to_hubspot" || x === "hubspot_to_wix" || x === "bidirectional") {
    return x;
  }
  return null;
}

function parseTransform(x: unknown): MappingTransform {
  if (x === "trim" || x === "lowercase" || x === "none") {
    return x;
  }
  return "none";
}

function validateMappings(input: unknown): FieldMapping[] | null {
  if (!Array.isArray(input)) {
    return null;
  }
  const out: FieldMapping[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") {
      return null;
    }
    const r = row as Record<string, unknown>;
    const wixFieldKey = isString(r.wixFieldKey) ? r.wixFieldKey : null;
    const hubspotPropertyName = isString(r.hubspotPropertyName) ? r.hubspotPropertyName : null;
    const direction = parseDirection(r.direction);
    if (!wixFieldKey || !hubspotPropertyName || !direction) {
      return null;
    }
    out.push({
      wixFieldKey,
      hubspotPropertyName,
      direction,
      transform: parseTransform(r.transform),
    });
  }
  const seen = new Set<string>();
  for (const m of out) {
    if (seen.has(m.hubspotPropertyName)) {
      return null;
    }
    seen.add(m.hubspotPropertyName);
  }

  return out;
}

export async function GET(req: Request): Promise<Response> {
  try {
    const connectionKey = getConnectionKeyFromAuthHeader(req.headers.get("Authorization"));
    if (!connectionKey) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const mappings = await listMappings(connectionKey);
    return Response.json({ mappings }, { status: 200 });
  } catch {
    console.error("List mappings failed.");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const connectionKey = getConnectionKeyFromAuthHeader(req.headers.get("Authorization"));
    if (!connectionKey) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as unknown;
    const mappings = validateMappings((body as { mappings?: unknown } | null)?.mappings);
    if (!mappings) {
      return Response.json({ error: "Invalid mapping payload" }, { status: 400 });
    }
    await replaceMappings({ connectionKey, mappings });
    return Response.json({ ok: true }, { status: 200 });
  } catch {
    console.error("Save mappings failed.");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

