import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import type { EnvLike } from "./provider";
import { assertProviderAddresses, endpointUrl, inspectProviderUrl, isBlockedAddress, resolvePublicHost } from "./ssrf";
import { fetchUpstream, upstreamFailureMessage } from "./upstream";

export type SavedProvider = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const defaultFile = () => join(process.cwd(), ".data", "provider.json");

export function parseProviderSetup(input: unknown): { ok: true; value: SavedProvider } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "配置内容无法识别" };
  const body = input as Record<string, unknown>;
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const checked = inspectProviderUrl(baseUrl);
  if (!checked.ok) return { ok: false, error: checked.reason };
  if (!apiKey) return { ok: false, error: "还没有填写密钥" };
  if (/\s/.test(apiKey)) return { ok: false, error: "密钥里不要带空格或换行" };
  if (apiKey.length < 8 || apiKey.length > 400) return { ok: false, error: "密钥长度看起来不对" };
  if (!isModelId(model)) {
    return { ok: false, error: "模型名称只接受字母、数字、点、下划线、冒号、斜线和短横线" };
  }
  const normalized = checked.url.toString().replace(/\/$/, "");
  return { ok: true, value: { baseUrl: normalized, apiKey, model } };
}

export function envLocksProvider(env: EnvLike): boolean {
  return Boolean(env.IMAGE_API_BASE_URL?.trim() && env.IMAGE_API_KEY?.trim() && env.IMAGE_API_MODEL?.trim());
}

export function mergeProviderEnv(env: EnvLike, saved: SavedProvider | null): EnvLike {
  if (!saved) return env;
  const overlay: EnvLike = {
    IMAGE_API_BASE_URL: saved.baseUrl,
    IMAGE_API_KEY: saved.apiKey,
    IMAGE_API_MODEL: saved.model,
  };
  const next: EnvLike = { ...env };
  for (const [key, value] of Object.entries(overlay)) {
    if (!next[key]?.trim() && value) next[key] = value;
  }
  return next;
}

export function setupHostAllowed(hostHeader: string | null): boolean {
  const raw = hostHeader?.trim().toLowerCase() ?? "";
  if (!raw) return false;
  const name = raw.startsWith("[") ? raw.slice(1, raw.indexOf("]")) : (raw.split(":")[0] ?? "");
  if (!name) return false;
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  if (isIP(name) === 0) return false;
  return isBlockedAddress(name);
}

export async function readSavedProvider(file = defaultFile()): Promise<SavedProvider | null> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const setup = parseProviderSetup(parsed);
  return setup.ok ? setup.value : null;
}

export async function writeSavedProvider(value: SavedProvider, file = defaultFile()): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ baseUrl: value.baseUrl, apiKey: value.apiKey, model: value.model }), {
    mode: 0o600,
  });
  await rename(tmp, file);
}

export async function clearSavedProvider(file = defaultFile()): Promise<void> {
  await rm(file, { force: true });
}

export function isModelId(model: string): boolean {
  return /^[^\s"'<>]{1,120}$/.test(model);
}

function modelEntries(json: unknown): string[] | null {
  const record = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const list = record?.data ?? record?.models ?? record?.result ?? json;
  if (!Array.isArray(list)) return null;
  return list.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object") {
      const id = (item as { id?: unknown; name?: unknown }).id ?? (item as { name?: unknown }).name;
      return typeof id === "string" ? [id] : [];
    }
    return [];
  });
}

export async function listProviderModels(
  input: { baseUrl: string; apiKey: string },
  deps: { lookup?: (host: string) => Promise<string[]>; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const checked = inspectProviderUrl(input.baseUrl);
  if (!checked.ok) return { ok: false, error: checked.reason };
  if (!input.apiKey.trim()) return { ok: false, error: "还没有填写密钥" };
  const lookup = deps.lookup ?? resolvePublicHost;
  let addresses: string[];
  try {
    addresses = await lookup(checked.host);
  } catch {
    return { ok: false, error: "无法解析生图服务地址" };
  }
  const blocked = assertProviderAddresses(addresses);
  if (blocked) return { ok: false, error: blocked };
  const url = endpointUrl(checked.url, "/models");
  const signal = deps.signal ?? AbortSignal.timeout(20_000);
  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchUpstream(
      url,
      {
        method: "GET",
        redirect: "manual",
        signal,
        cache: "no-store",
        headers: { Authorization: `Bearer ${input.apiKey}`, Accept: "application/json" },
      },
      fetchImpl,
    );
  } catch (error) {
    return { ok: false, error: upstreamFailureMessage(error, url) };
  }
  if (response.type === "opaqueredirect" || response.status === 0 || (response.status >= 300 && response.status < 400)) {
    return { ok: false, error: "模型列表接口返回了重定向" };
  }
  const text = await response.text();
  if (!response.ok) return { ok: false, error: "模型列表接口没有成功返回" };
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "模型列表不是 JSON" };
  }
  const data = modelEntries(json);
  if (!data) return { ok: false, error: "模型列表里没有可用的名称" };
  const models: string[] = [];
  for (const item of data) {
    const id = item.trim();
    if (!isModelId(id) || models.includes(id)) continue;
    models.push(id);
    if (models.length >= 200) break;
  }
  if (models.length === 0) return { ok: false, error: "接口没有返回可用的模型名称" };
  return { ok: true, models };
}
