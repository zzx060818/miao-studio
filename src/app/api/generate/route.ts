import { recordCall } from "@/lib/call-log";
import { requireUser } from "@/lib/current-user";
import { handleGenerate } from "@/lib/provider";
import { mergeProviderEnv, readSavedProvider } from "@/lib/provider-store";
import type { Buckets } from "@/lib/rate-limit";
import { canGenerate } from "@/lib/roles";
import { clientIp, parseJsonLimited } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const buckets: Buckets = { ip: new Map(), global: new Map() };

export async function POST(request: Request) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  const text = await request.text();
  const parsed = parseJsonLimited(text);
  const sketch = sketchRequest(parsed.ok ? parsed.value : tryParse(text));
  if (!canGenerate(actor.role)) {
    await remember(actor, sketch, { ok: false, status: 403, error: "查看者不能生成" });
    return Response.json(
      { ok: false, code: "forbidden", error: "查看者不能生成", detail: "请管理员把角色改成创作者。" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!parsed.ok) {
    await remember(actor, sketch, { ok: false, status: parsed.status, error: parsed.error });
    return Response.json({ ok: false, code: "invalid", error: parsed.error }, { status: parsed.status });
  }
  const saved = await readSavedProvider();
  const result = await handleGenerate(parsed.value, {
    env: mergeProviderEnv(process.env, saved),
    ip: clientIp(request.headers),
    buckets,
    signal: request.signal,
  });
  const model = typeof result.body.model === "string" ? result.body.model : sketch.model;
  const error = result.body.ok === true ? "" : textOf(result.body.error) || textOf(result.body.detail);
  await remember(actor, { ...sketch, model }, { ok: result.body.ok === true, status: result.status, error });
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sketchRequest(input: unknown): { prompt: string; model: string; aspect: string; count: number | null } {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    prompt: textOf(body.prompt),
    model: textOf(body.model),
    aspect: textOf(body.aspect),
    count: typeof body.count === "number" && Number.isInteger(body.count) ? body.count : null,
  };
}

async function remember(
  actor: { id: string; username: string; displayName: string; role: "admin" | "artist" | "viewer" },
  sketch: { prompt: string; model: string; aspect: string; count: number | null },
  outcome: { ok: boolean; status: number; error: string },
) {
  try {
    await recordCall({
      userId: actor.id,
      username: actor.username,
      displayName: actor.displayName,
      role: actor.role,
      prompt: sketch.prompt,
      model: sketch.model,
      aspect: sketch.aspect,
      count: sketch.count,
      ok: outcome.ok,
      status: outcome.status,
      error: outcome.error,
    });
  } catch {
    // The picture response still goes back. A failed log must not hide it.
  }
}
