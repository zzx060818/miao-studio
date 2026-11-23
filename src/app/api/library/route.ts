import { requireUser } from "@/lib/current-user";
import { listLibrary } from "@/lib/library-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  const library = await listLibrary(actor.id);
  return Response.json({ ok: true, ...library }, { headers: { "Cache-Control": "private, no-store" } });
}
