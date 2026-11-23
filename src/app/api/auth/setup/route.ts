import { connectionIsHttps, issueSession, sessionCookie, sessionSecret } from "@/lib/session";
import { createFirstAdmin, userCount } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if ((await userCount()) > 0) {
    return Response.json({ ok: false, error: "管理员已经创建过了" }, { status: 409, headers });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "请求不是 JSON" }, { status: 400, headers });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const result = await createFirstAdmin({
    username: typeof record.username === "string" ? record.username : "",
    displayName: typeof record.displayName === "string" ? record.displayName : "",
    password: typeof record.password === "string" ? record.password : "",
  });
  if (!result.ok) return Response.json(result, { status: 400, headers });
  const token = issueSession(result.user.id, await sessionSecret());
  return Response.json(
    { ok: true, user: result.user },
    { status: 200, headers: { ...headers, "Set-Cookie": sessionCookie(token, connectionIsHttps(request)) } },
  );
}
