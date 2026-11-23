import { userFromRequest } from "@/lib/current-user";
import { userCount } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  const needsSetup = (await userCount()) === 0;
  return Response.json(
    { user, needsSetup },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
