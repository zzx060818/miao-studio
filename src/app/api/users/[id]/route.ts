import { requireUser } from "@/lib/current-user";
import { canManage, isRole } from "@/lib/roles";
import { deleteMember, updateMember, type UserPatch } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

async function admin(request: Request) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  if (!canManage(actor.role)) {
    return Response.json({ ok: false, error: "只有管理员可以管理成员" }, { status: 403, headers });
  }
  return actor;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await admin(request);
  if (actor instanceof Response) return actor;
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "请求不是 JSON" }, { status: 400, headers });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const patch: UserPatch = {};
  if (record.role !== undefined) {
    if (!isRole(record.role)) return Response.json({ ok: false, error: "角色无法识别" }, { status: 400, headers });
    patch.role = record.role;
  }
  if (record.disabled !== undefined) {
    if (typeof record.disabled !== "boolean") {
      return Response.json({ ok: false, error: "停用状态无法识别" }, { status: 400, headers });
    }
    if (record.disabled && id === actor.id) {
      return Response.json({ ok: false, error: "不能停用自己正在用的账号" }, { status: 400, headers });
    }
    patch.disabled = record.disabled;
  }
  if (typeof record.password === "string") patch.password = record.password;
  if (typeof record.displayName === "string") patch.displayName = record.displayName;
  const result = await updateMember(id, patch);
  if (!result.ok) return Response.json(result, { status: 400, headers });
  return Response.json({ ok: true, user: result.user }, { headers });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await admin(request);
  if (actor instanceof Response) return actor;
  const { id } = await context.params;
  if (id === actor.id) {
    return Response.json({ ok: false, error: "不能删除自己正在用的账号" }, { status: 400, headers });
  }
  const result = await deleteMember(id);
  if (!result.ok) return Response.json(result, { status: 400, headers });
  return Response.json({ ok: true }, { headers });
}
