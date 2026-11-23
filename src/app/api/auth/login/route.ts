import { clientIp } from "@/lib/validation";
import { takeToken } from "@/lib/rate-limit";
import { connectionIsHttps, issueSession, sessionCookie, sessionSecret } from "@/lib/session";
import { authenticate } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, number[]>();
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (!takeToken(attempts, ip, Date.now(), 8, 10 * 60 * 1000)) {
    return Response.json({ ok: false, error: "试得太勤了，等几分钟再登录" }, { status: 429, headers });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "请求不是 JSON" }, { status: 400, headers });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const username = typeof record.username === "string" ? record.username : "";
  const password = typeof record.password === "string" ? record.password : "";
  const result = await authenticate(username, password);
  if (!result.ok) return Response.json(result, { status: 401, headers });
  const token = issueSession(result.user.id, await sessionSecret());
  return Response.json(
    { ok: true, user: result.user },
    { status: 200, headers: { ...headers, "Set-Cookie": sessionCookie(token, connectionIsHttps(request)) } },
  );
}
