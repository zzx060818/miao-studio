import { publicStatus } from "@/lib/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(publicStatus(process.env), {
    headers: { "Cache-Control": "no-store" },
  });
}
