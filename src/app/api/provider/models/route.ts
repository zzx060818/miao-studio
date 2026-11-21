import { listProviderModels, readSavedProvider, setupHostAllowed } from "@/lib/provider-store";
import { parseJsonLimited } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!setupHostAllowed(request.headers.get("host"))) {
    return Response.json({ ok: false, error: "只能在本机页面获取模型列表" }, { status: 403, headers });
  }
  const parsed = parseJsonLimited(await request.text());
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: parsed.status, headers });
  }
  const saved = await readSavedProvider();
  const record = parsed.value && typeof parsed.value === "object" ? (parsed.value as Record<string, unknown>) : {};
  const baseUrl = typeof record.baseUrl === "string" && record.baseUrl.trim() ? record.baseUrl.trim() : (saved?.baseUrl ?? "");
  const apiKey = typeof record.apiKey === "string" && record.apiKey.trim() ? record.apiKey.trim() : (saved?.apiKey ?? "");
  const listed = await listProviderModels({ baseUrl, apiKey }, { signal: request.signal });
  if (!listed.ok) {
    return Response.json({ ok: false, error: listed.error }, { status: 502, headers });
  }
  return Response.json({ ok: true, models: listed.models }, { headers });
}
