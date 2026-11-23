import type { PublicUser } from "./roles";
import { cookieValue, readSession, sessionSecret } from "./session";
import { findUser } from "./users";

const headers = { "Cache-Control": "no-store" };

export async function userFromRequest(request: Request): Promise<(PublicUser & { disabled: boolean }) | null> {
  const token = cookieValue(request.headers.get("cookie"));
  if (!token) return null;
  const session = readSession(token, await sessionSecret());
  if (!session) return null;
  const user = await findUser(session.sub);
  if (!user || user.disabled) return null;
  return user;
}

export async function requireUser(request: Request): Promise<(PublicUser & { disabled: boolean }) | Response> {
  const user = await userFromRequest(request);
  if (!user) return Response.json({ ok: false, error: "请先登录" }, { status: 401, headers });
  return user;
}
