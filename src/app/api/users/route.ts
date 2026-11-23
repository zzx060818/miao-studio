import { requireUser } from "@/lib/current-user";
import { canManage, isRole } from "@/lib/roles";
import { createMember, listMemberRows } from "@/lib/users";

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

export async function GET(request: Request) {
  const actor = await admin(request);
  if (actor instanceof Response) return actor;
  const users = await listMemberRows();
  return Response.json({ ok: true, users }, { headers });
}

export async function POST(request: Request) {
  const actor = await admin(request);
  if (actor instanceof Response) return actor;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "请求不是 JSON" }, { status: 400, headers });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const role = isRole(record.role) ? record.role : null;
  if (!role) return Response.json({ ok: false, error: "角色无法识别" }, { status: 400, headers });
  const result = await createMember({
    username: typeof record.username === "string" ? record.username : "",
    displayName: typeof record.displayName === "string" ? record.displayName : "",
    password: typeof record.password === "string" ? record.password : "",
    role,
  });
  if (!result.ok) return Response.json(result, { status: 400, headers });
  return Response.json({ ok: true, user: result.user }, { headers });
}
