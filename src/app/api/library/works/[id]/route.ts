import { requireUser } from "@/lib/current-user";
import { deleteLibraryWork, setLibraryWorkFavorite } from "@/lib/library-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "请求不是 JSON" }, { status: 400, headers });
  }
  const favorite = body && typeof body === "object" ? (body as { favorite?: unknown }).favorite : undefined;
  if (typeof favorite !== "boolean") {
    return Response.json({ ok: false, error: "收藏状态无法识别" }, { status: 400, headers });
  }
  const result = await setLibraryWorkFavorite(actor.id, id, favorite);
  if (!result.ok) return Response.json(result, { status: 404, headers });
  return Response.json(result, { headers });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  const { id } = await context.params;
  const result = await deleteLibraryWork(actor.id, id);
  if (!result.ok) return Response.json(result, { status: 404, headers });
  return Response.json(result, { headers });
}
