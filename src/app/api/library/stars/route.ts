import { requireUser } from "@/lib/current-user";
import { setLibraryStar } from "@/lib/library-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function PUT(request: Request) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "请求不是 JSON" }, { status: 400, headers });
  }
  const record = body && typeof body === "object" ? (body as { exampleId?: unknown; on?: unknown }) : {};
  if (typeof record.exampleId !== "string" || typeof record.on !== "boolean") {
    return Response.json({ ok: false, error: "示例收藏无法识别" }, { status: 400, headers });
  }
  const result = await setLibraryStar(actor.id, record.exampleId, record.on);
  if (!result.ok) return Response.json(result, { status: 400, headers });
  return Response.json(result, { headers });
}
