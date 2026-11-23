import { LIMITS } from "./limits";
import {
  type Caps,
  type PublicCaps,
  applySizeMap,
  capsForModel,
  composePrompt,
  modelNote,
  toPublicCaps,
} from "./models";
import type { Buckets } from "./rate-limit";
import { takeToken } from "./rate-limit";
import { sniffImage } from "./sniff";
import {
  assertImageSource,
  assertProviderAddresses,
  endpointUrl,
  inspectProviderUrl,
  inspectResultUrl,
  isLocalProviderHost,
  resolvePublicHost,
} from "./ssrf";
import { fetchUpstream, upstreamFailureMessage } from "./upstream";
import {
  type GenerateRequest,
  enforceCapabilities,
  parseGenerateBody,
} from "./validation";

export type EnvLike = Record<string, string | undefined>;

export type ProviderConfig = {
  configured: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
  extras: string[];
  sizeMap?: string;
  reason?: string;
};

export type GenerateDeps = {
  env: EnvLike;
  now?: number;
  ip?: string;
  buckets?: Buckets;
  lookup?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

export type HandlerResult = {
  status: number;
  body: Record<string, unknown>;
};

const EXTRA_NAMES = new Set(["negative", "seed", "steps", "reference"]);

export function readProviderConfig(env: EnvLike): ProviderConfig {
  const baseUrl = env.IMAGE_API_BASE_URL?.trim() ?? "";
  const apiKey = env.IMAGE_API_KEY?.trim() ?? "";
  const model = env.IMAGE_API_MODEL?.trim() ?? "";
  const timeout = Number(env.IMAGE_API_TIMEOUT_MS ?? 120_000);
  const extras = (env.IMAGE_API_CAPABILITIES ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => EXTRA_NAMES.has(item));
  const timeoutMs = Number.isFinite(timeout) ? Math.min(Math.max(timeout, 3_000), 170_000) : 120_000;
  if (!baseUrl || !apiKey || !model) {
    return {
      configured: false,
      timeoutMs,
      extras: [],
      reason: "尚未配置生图服务",
    };
  }
  return {
    configured: true,
    baseUrl,
    apiKey,
    model,
    timeoutMs,
    extras,
    sizeMap: env.IMAGE_API_SIZE_MAP,
  };
}

export function resolveConfigCaps(config: ProviderConfig): Caps {
  const caps = applySizeMap(capsForModel(config.model ?? "", config.extras), config.sizeMap);
  return caps;
}

export function publicStatus(env: EnvLike, options?: { editable?: boolean }): Record<string, unknown> {
  const editable = options?.editable ?? false;
  const config = readProviderConfig(env);
  if (!config.configured || !config.model) {
    return {
      configured: false,
      editable,
      message: "尚未配置生图服务",
      model: null,
      capabilities: null,
      detail: editable
        ? "管理员在这页填上接口地址、密钥和模型。密钥只留在这台服务器上，页面不会再把它显示出来。"
        : "服务器还没有同时配置 IMAGE_API_BASE_URL、IMAGE_API_KEY 和 IMAGE_API_MODEL。可以先写提示、存句子、看示例。",
    };
  }
  const caps = toPublicCaps(resolveConfigCaps(config), modelNote(config.model));
  return {
    configured: true,
    editable,
    message: "生图服务已配置",
    model: config.model,
    capabilities: caps,
    extras: config.extras,
    detail: "密钥只留在这台服务器上。风格会写进提示词，不是供应商的独立参数。",
    baseUrl: config.baseUrl,
  };
}

export function sanitizeProviderMessage(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]{6,}/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export async function handleGenerate(input: unknown, deps: GenerateDeps): Promise<HandlerResult> {
  const now = deps.now ?? Date.now();
  const ip = deps.ip ?? "local";
  const buckets = deps.buckets ?? { ip: new Map(), global: new Map() };
  if (
    !takeToken(buckets.global, "global", now, LIMITS.globalPerMinute, LIMITS.windowMs) ||
    !takeToken(buckets.ip, ip, now, LIMITS.requestsPerMinute, LIMITS.windowMs)
  ) {
    return {
      status: 429,
      body: { ok: false, code: "rate_limit", error: "请求太频繁，请稍后再试" },
    };
  }

  const parsed = parseGenerateBody(input);
  if (!parsed.ok) {
    return { status: 400, body: { ok: false, code: "invalid", error: parsed.error } };
  }

  const config = readProviderConfig(deps.env);
  if (!config.configured || !config.baseUrl || !config.apiKey || !config.model) {
    return {
      status: 503,
      body: {
        ok: false,
        code: "unconfigured",
        error: "尚未配置生图服务",
        detail:
          "还没有接口地址、密钥和模型。可以在页面上配置，或在服务器设置 IMAGE_API_BASE_URL、IMAGE_API_KEY 和 IMAGE_API_MODEL。这次没有生成图片。",
      },
    };
  }

  const active = { ...config, model: parsed.value.model || config.model };
  const caps = resolveConfigCaps(active);
  const unsupported = enforceCapabilities(parsed.value, caps);
  if (unsupported) {
    return { status: 400, body: { ok: false, code: "unsupported", error: unsupported } };
  }

  const inspected = inspectProviderUrl(config.baseUrl);
  if (!inspected.ok) {
    return {
      status: 500,
      body: { ok: false, code: "bad_provider", error: "已拒绝这个生图服务地址", detail: inspected.reason },
    };
  }
  const lookup = deps.lookup ?? resolvePublicHost;
  let addresses: string[];
  try {
    addresses = await lookup(inspected.host);
  } catch {
    return { status: 502, body: { ok: false, code: "dns", error: "无法解析生图服务地址" } };
  }
  const blocked = assertProviderAddresses(addresses);
  if (blocked) {
    return { status: 500, body: { ok: false, code: "ssrf", error: "已拒绝不安全的生图服务地址", detail: blocked } };
  }

  try {
    const images = await requestImages({
      config: active,
      caps,
      request: parsed.value,
      fetchImpl: deps.fetchImpl ?? fetch,
      lookup,
      signal: deps.signal,
    });
    return {
      status: 200,
      body: {
        ok: true,
        images,
        prompt: parsed.value.prompt,
        aspect: parsed.value.aspect,
        count: parsed.value.count,
        styles: parsed.value.styles,
        model: active.model,
      },
    };
  } catch (error) {
    const kind = failureKind(error);
    if (kind === "cancel") {
      return { status: 499, body: { ok: false, code: "cancelled", error: "已取消，没有生成图片" } };
    }
    if (kind === "timeout") {
      return {
        status: 504,
        body: {
          ok: false,
          code: "timeout",
          error: "生图服务超时",
          detail: `等了 ${Math.round(active.timeoutMs / 1000)} 秒还没有图片。`,
        },
      };
    }
    return {
      status: 502,
      body: { ok: false, code: "provider", error: "生图服务没有返回图片", detail: sanitizeProviderMessage(describeFetchError(error)) },
    };
  }
}

async function requestImages(args: {
  config: ProviderConfig;
  caps: Caps;
  request: GenerateRequest;
  fetchImpl: typeof fetch;
  lookup: (host: string) => Promise<string[]>;
  signal?: AbortSignal;
}): Promise<{ mime: string; b64: string }[]> {
  const { config, caps, request, fetchImpl, lookup } = args;
  const base = inspectProviderUrl(config.baseUrl ?? "");
  if (!base.ok) throw new Error(base.reason);
  const size = caps.sizes[request.aspect];
  if (!size) throw new Error("当前模型不支持这个画幅");
  const useEdits = request.references.length > 0;
  const url = endpointUrl(base.url, useEdits ? "/images/edits" : "/images/generations");
  const prompt = composePrompt(request.prompt, request.styles);
  const signal = mergeSignals(args.signal, config.timeoutMs);
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  headers.set("Accept", "application/json");

  let body: BodyInit;
  if (useEdits) {
    const form = new FormData();
    form.set("model", config.model ?? "");
    form.set("prompt", prompt);
    form.set("n", String(request.count));
    form.set("size", size);
    if (config.model === "dall-e-2" || config.model === "dall-e-3") form.set("response_format", "b64_json");
    appendExtra(form, request, caps);
    for (const [index, ref] of request.references.entries()) {
      const extension = ref.mime === "image/png" ? "png" : ref.mime === "image/webp" ? "webp" : "jpg";
      form.append(request.references.length > 1 ? "image[]" : "image", new Blob([toArrayBuffer(ref.bytes)], { type: ref.mime }), `ref-${index}.${extension}`);
    }
    body = form;
  } else {
    headers.set("Content-Type", "application/json");
    const payload: Record<string, unknown> = {
      model: config.model,
      prompt,
      n: request.count,
      size,
    };
    if (config.model === "dall-e-2" || config.model === "dall-e-3") payload.response_format = "b64_json";
    if (caps.negative && request.negativePrompt) payload.negative_prompt = request.negativePrompt;
    if (caps.seed && request.seed !== undefined) payload.seed = request.seed;
    if (caps.steps && request.steps !== undefined) payload.steps = request.steps;
    body = JSON.stringify(payload);
  }

  let response: Response;
  try {
    response = await fetchUpstream(url, { method: "POST", headers, body, redirect: "manual", signal, cache: "no-store" }, fetchImpl);
  } catch (error) {
    const kind = failureKind(error);
    if (kind === "cancel" || kind === "timeout") throw error;
    throw new Error(describeFetchError(error, url));
  }
  if (response.type === "opaqueredirect" || response.status === 0 || (response.status >= 300 && response.status < 400)) {
    throw new Error("生图服务返回了重定向，已停止请求");
  }
  const text = await response.text();
  if (text.length > LIMITS.maxProviderJsonChars) throw new Error("生图服务的响应太大");
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("生图接口返回 404。请确认地址以 /v1 结尾，并且所选模型支持文生图。");
    }
    throw new Error(readProviderError(text, response.status));
  }

  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error("生图服务没有返回 JSON");
  }
  const data = collectImages(json);
  if (data.length === 0) throw new Error(emptyImageMessage(json));
  if (data.length > LIMITS.maxCount) throw new Error("生图服务返回的图片数量超出限制");

  const images: { mime: string; b64: string }[] = [];
  for (const item of data) {
    if (item.b64) {
      images.push(imageFromBase64(item.b64));
      continue;
    }
    if (item.url) {
      images.push(await downloadPublicImage(item.url, fetchImpl, lookup, signal));
      continue;
    }
    throw new Error("生图服务的图片字段无法读取");
  }
  return images;
}

function collectImages(json: unknown): { b64?: string; url?: string }[] {
  const record = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  if (!record) return [];
  for (const key of ["data", "images", "output", "results"]) {
    const list = record[key];
    if (!Array.isArray(list)) continue;
    const items = list.flatMap(readImageItem);
    if (items.length > 0) return items;
  }
  return readImageItem(record);
}

function readImageItem(item: unknown): { b64?: string; url?: string }[] {
  if (!item || typeof item !== "object") return [];
  const row = item as Record<string, unknown>;
  const b64 = firstString(row.b64_json, row.b64, row.base64, row.image_base64);
  const url = firstString(row.url, row.image_url);
  const image = firstString(row.image);
  if (b64) return [{ b64, url }];
  const candidate = url || image;
  if (!candidate) return [];
  if (candidate.startsWith("data:image/")) return [{ b64: candidate }];
  if (/^https?:\/\//i.test(candidate)) return [{ url: candidate }];
  if (candidate.length > 80 && !candidate.includes(" ")) return [{ b64: candidate }];
  return [];
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function emptyImageMessage(json: unknown): string {
  const record = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const task = firstString(record?.task_id, record?.taskId);
  if (task) return "接口只返回了任务编号，没有直接返回图片。请换一个会马上返回图片的文生图模型。";
  return "生图服务没有返回图片";
}

function appendExtra(form: FormData, request: GenerateRequest, caps: Caps) {
  if (caps.negative && request.negativePrompt) form.set("negative_prompt", request.negativePrompt);
  if (caps.seed && request.seed !== undefined) form.set("seed", String(request.seed));
  if (caps.steps && request.steps !== undefined) form.set("steps", String(request.steps));
}

function imageFromBase64(data: string): { mime: string; b64: string } {
  const payload = data.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  if (payload.length > 12_000_000) throw new Error("返回的图片太大");
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length < 16 || bytes.length > LIMITS.maxResultBytes) throw new Error("返回的图片太大或是空的");
  const mime = sniffImage(new Uint8Array(bytes));
  if (!mime) throw new Error("生图服务返回的内容不是图片");
  return { mime, b64: bytes.toString("base64") };
}

async function downloadPublicImage(
  raw: string,
  fetchImpl: typeof fetch,
  lookup: (host: string) => Promise<string[]>,
  signal: AbortSignal,
): Promise<{ mime: string; b64: string }> {
  let current = raw;
  let allowLocal = false;
  const first = inspectResultUrl(current);
  if (!first.ok) throw new Error(first.reason);
  allowLocal = isLocalProviderHost(first.host);
  for (let hop = 0; hop < 4; hop += 1) {
    const inspected = inspectResultUrl(current);
    if (!inspected.ok) throw new Error(inspected.reason);
    const addresses = await lookup(inspected.host);
    const blocked = assertImageSource(inspected.host, addresses, allowLocal);
    if (blocked) throw new Error(blocked);
    const response = await fetchUpstream(
      inspected.url.toString(),
      {
        method: "GET",
        redirect: "manual",
        signal,
        cache: "no-store",
        headers: { Accept: "image/png,image/jpeg,image/webp" },
      },
      fetchImpl,
    );
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("结果图地址发生了重定向，但没有下一跳");
      current = new URL(location, inspected.url).toString();
      continue;
    }
    if (!response.ok) throw new Error("结果图下载失败");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 16 || bytes.byteLength > LIMITS.maxResultBytes) throw new Error("结果图太大或是空的");
    const mime = sniffImage(bytes);
    if (!mime) throw new Error("结果图不是受支持的图片");
    return { mime, b64: Buffer.from(bytes).toString("base64") };
  }
  throw new Error("结果图重定向次数过多");
}

function readProviderError(text: string, status: number): string {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const error = json.error;
    const nested = error && typeof error === "object" ? (error as { message?: unknown }).message : undefined;
    const message =
      (typeof error === "string" ? error : "") ||
      (typeof nested === "string" ? nested : "") ||
      (typeof json.message === "string" ? json.message : "") ||
      (typeof json.msg === "string" ? json.msg : "");
    if (message.trim()) return sanitizeProviderMessage(message);
  } catch {
    // fall through to the status code
  }
  return `生图服务返回了 ${status}`;
}

function mergeSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return AbortSignal.any([signal, timeout]);
}

function failureKind(error: unknown): "cancel" | "timeout" | "other" {
  if (!(error instanceof Error)) return "other";
  if (error.name === "TimeoutError") return "timeout";
  if (error.name === "AbortError") return "cancel";
  return "other";
}

function describeFetchError(error: unknown, url?: string): string {
  return upstreamFailureMessage(error, url);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export type { PublicCaps };
