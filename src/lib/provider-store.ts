import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import type { EnvLike } from "./provider";
import { inspectProviderUrl, isBlockedAddress } from "./ssrf";

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
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(model)) {
    return { ok: false, error: "模型名称只接受字母、数字、点、下划线、冒号和短横线" };
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
