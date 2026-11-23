import { requireUser } from "@/lib/current-user";
import { publicStatus } from "@/lib/provider";
import { canManage } from "@/lib/roles";
import {
  clearSavedProvider,
  envLocksProvider,
  mergeProviderEnv,
  parseProviderSetup,
  readSavedProvider,
  setupHostAllowed,
  writeSavedProvider,
} from "@/lib/provider-store";
import { parseJsonLimited } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

async function statusResponse() {
  const saved = await readSavedProvider();
  const editable = !envLocksProvider(process.env);
  return publicStatus(mergeProviderEnv(process.env, saved), { editable });
}

export async function GET(request: Request) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  const body = await statusResponse();
  const manager = canManage(actor.role);
  const editable = manager && body.editable === true && setupHostAllowed(request.headers.get("host"));
  const detail =
    body.configured === true
      ? manager
        ? body.detail
        : "渠道已由管理员配置。密钥不会出现在这页。"
      : editable
        ? body.detail
        : "渠道还没配好。只有管理员能配置接口。";
  return Response.json(
    {
      ...body,
      editable,
      detail,
      baseUrl: manager ? body.baseUrl : undefined,
    },
    { headers },
  );
}

export async function POST(request: Request) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  if (!canManage(actor.role)) {
    return Response.json({ ok: false, error: "只有管理员可以配置渠道" }, { status: 403, headers });
  }
  if (!setupHostAllowed(request.headers.get("host"))) {
    return Response.json({ ok: false, error: "只能在本机页面保存生图服务" }, { status: 403, headers });
  }
  if (envLocksProvider(process.env)) {
    return Response.json({ ok: false, error: "服务器环境已经配置了生图服务，页面不能覆盖" }, { status: 409, headers });
  }
  const parsed = parseJsonLimited(await request.text());
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: parsed.status, headers });
  }
  const saved = await readSavedProvider();
  const record = parsed.value && typeof parsed.value === "object" ? (parsed.value as Record<string, unknown>) : {};
  const typedKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  const setup = parseProviderSetup({ ...record, apiKey: typedKey || saved?.apiKey || "" });
  if (!setup.ok) {
    return Response.json({ ok: false, error: setup.error }, { status: 400, headers });
  }
  await writeSavedProvider(setup.value);
  const status = await statusResponse();
  return Response.json({ ok: true, ...status, editable: true }, { headers });
}

export async function DELETE(request: Request) {
  const actor = await requireUser(request);
  if (actor instanceof Response) return actor;
  if (!canManage(actor.role)) {
    return Response.json({ ok: false, error: "只有管理员可以配置渠道" }, { status: 403, headers });
  }
  if (!setupHostAllowed(request.headers.get("host"))) {
    return Response.json({ ok: false, error: "只能在本机页面清除生图服务" }, { status: 403, headers });
  }
  if (envLocksProvider(process.env)) {
    return Response.json({ ok: false, error: "服务器环境里的配置不能从页面清除" }, { status: 409, headers });
  }
  await clearSavedProvider();
  return Response.json({ ok: true, ...(await statusResponse()), editable: true }, { headers });
}
