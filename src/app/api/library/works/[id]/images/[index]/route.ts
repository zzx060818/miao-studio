import { requireUser } from "@/lib/current-user";
import { readWorkImage } from "@/lib/library-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  const { id, index } = await context.params;
  const image = await readWorkImage(actor.id, id, Number(index));
  if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(Buffer.from(image.bytes), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
