import { handleGenerate } from "@/lib/provider";
import { mergeProviderEnv, readSavedProvider } from "@/lib/provider-store";
import type { Buckets } from "@/lib/rate-limit";
import { clientIp, parseJsonLimited } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const buckets: Buckets = { ip: new Map(), global: new Map() };

export async function POST(request: Request) {
  const text = await request.text();
  const parsed = parseJsonLimited(text);
  if (!parsed.ok) {
    return Response.json({ ok: false, code: "invalid", error: parsed.error }, { status: parsed.status });
  }
  const saved = await readSavedProvider();
  const result = await handleGenerate(parsed.value, {
    env: mergeProviderEnv(process.env, saved),
    ip: clientIp(request.headers),
    buckets,
    signal: request.signal,
  });
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
