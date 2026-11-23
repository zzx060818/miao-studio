import { requireUser } from "@/lib/current-user";
import { changeOwnPassword, updateMember } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function PATCH(request: Request) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "请求不是 JSON" }, { status: 400, headers });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const nextPassword = typeof record.nextPassword === "string" ? record.nextPassword : "";
  const currentPassword = typeof record.currentPassword === "string" ? record.currentPassword : "";
  if (nextPassword) {
    const changed = await changeOwnPassword(actor.id, currentPassword, nextPassword);
    if (!changed.ok) return Response.json(changed, { status: 400, headers });
  }
  if (typeof record.displayName === "string") {
    const renamed = await updateMember(actor.id, { displayName: record.displayName });
    if (!renamed.ok) return Response.json(renamed, { status: 400, headers });
    return Response.json({ ok: true, user: renamed.user }, { headers });
  }
  return Response.json({ ok: true, user: actor }, { headers });
}
