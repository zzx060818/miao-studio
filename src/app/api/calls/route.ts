import { listCalls } from "@/lib/call-log";
import { requireUser } from "@/lib/current-user";
import { canManage } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  if (!canManage(actor.role)) {
    return Response.json({ ok: false, error: "只有管理员可以看调用记录" }, { status: 403, headers });
  }
  const calls = await listCalls();
  return Response.json({ ok: true, calls }, { headers });
}
