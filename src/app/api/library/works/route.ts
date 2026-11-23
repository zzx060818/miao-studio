import { requireUser } from "@/lib/current-user";
import { saveLibraryWork } from "@/lib/library-store";
import { canGenerate } from "@/lib/roles";
import { parseJsonLimited } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  if (!canGenerate(actor.role)) {
    return Response.json({ ok: false, error: "查看者不能保存生成的作品" }, { status: 403, headers });
  }
  const parsed = parseJsonLimited(await request.text(), 48_000_000);
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: parsed.status, headers });
  const body = parsed.value && typeof parsed.value === "object" ? (parsed.value as Record<string, unknown>) : {};
  const result = await saveLibraryWork(actor.id, {
    id: typeof body.id === "string" ? body.id : undefined,
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    negativePrompt: typeof body.negativePrompt === "string" ? body.negativePrompt : "",
    modelLabel: typeof body.modelLabel === "string" ? body.modelLabel : "",
    aspect: typeof body.aspect === "string" ? body.aspect : "",
    styles: body.styles,
    seed: typeof body.seed === "number" ? body.seed : null,
    steps: typeof body.steps === "number" ? body.steps : null,
    images: Array.isArray(body.images) ? (body.images as { mime?: string; data?: string }[]) : [],
  });
  if (!result.ok) return Response.json(result, { status: 400, headers });
  return Response.json({ ok: true, work: result.work }, { headers });
}
