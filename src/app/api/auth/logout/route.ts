import { clearSessionCookie, connectionIsHttps } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store", "Set-Cookie": clearSessionCookie(connectionIsHttps(request)) } },
  );
}
