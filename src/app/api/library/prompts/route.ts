import { requireUser } from "@/lib/current-user";
import { saveLibraryPrompt } from "@/lib/library-store";
import { parseJsonLimited } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  const parsed = parseJsonLimited(await request.text());
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: parsed.status, headers });
  const body = parsed.value && typeof parsed.value === "object" ? (parsed.value as Record<string, unknown>) : {};
  const result = await saveLibraryPrompt(actor.id, {
    id: typeof body.id === "string" ? body.id : undefined,
    title: typeof body.title === "string" ? body.title : "",
    text: typeof body.text === "string" ? body.text : "",
    aspect: typeof body.aspect === "string" ? body.aspect : "",
    styles: body.styles,
    modelId: typeof body.modelId === "string" ? body.modelId : "",
  });
  if (!result.ok) return Response.json(result, { status: 400, headers });
  return Response.json({ ok: true, status: result.status }, { headers });
}
