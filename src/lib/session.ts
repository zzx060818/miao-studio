import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "./data-dir";

export const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const COOKIE = "miao_session";
const secrets = new Map<string, string>();

export function issueSession(sub: string, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ sub, exp: now + SESSION_MS }), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(token: string, secret: string, now = Date.now()): { sub: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown };
    if (typeof parsed.sub !== "string" || !parsed.sub) return null;
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return { sub: parsed.sub };
  } catch {
    return null;
  }
}

export function cookieValue(header: string | null, name = COOKIE): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return "";
}

export function connectionIsHttps(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function sessionCookie(token: string, secure = false, maxAge = Math.floor(SESSION_MS / 1000)): string {
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure = false): string {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export async function sessionSecret(): Promise<string> {
  const dir = dataDir();
  const cached = secrets.get(dir);
  if (cached) return cached;
  const file = join(dir, "session.key");
  try {
    const text = (await readFile(file, "utf8")).trim();
    if (text.length >= 32) {
      secrets.set(dir, text);
      return text;
    }
  } catch {
    // Create a new key below.
  }
  const next = randomBytes(32).toString("base64url");
  await mkdir(dir, { recursive: true });
  await writeFile(file, next, { mode: 0o600 });
  secrets.set(dir, next);
  return next;
}
