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
  assertResolvedAddresses,
  endpointUrl,
  inspectProviderUrl,
  resolvePublicHost,
} from "./ssrf";
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
  const timeout = Number(env.IMAGE_API_TIMEOUT_MS ?? 60_000);
  const extras = (env.IMAGE_API_CAPABILITIES ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => EXTRA_NAMES.has(item));
  const timeoutMs = Number.isFinite(timeout) ? Math.min(Math.max(timeout, 3_000), 120_000) : 60_000;
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
        ? "在这页填上接口地址、密钥和模型。密钥只留在这台电脑上，页面不会再把它显示出来。"
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
    detail: "密钥只留在这台电脑上。风格会写进提示词，不是供应商的独立参数。",
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

  const caps = resolveConfigCaps(config);
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
  const blocked = assertResolvedAddresses(addresses);
  if (blocked) {
    return { status: 500, body: { ok: false, code: "ssrf", error: "已拒绝不安全的生图服务地址", detail: blocked } };
  }

  try {
    const images = await requestImages({
      config,
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
        model: config.model,
      },
    };
  } catch (error) {
    if (isAbort(error)) {
      return { status: 499, body: { ok: false, code: "cancelled", error: "已取消，没有生成图片" } };
    }
    const message = error instanceof Error ? error.message : "生图服务没有返回图片";
    return {
      status: 502,
      body: { ok: false, code: "provider", error: "生图服务没有返回图片", detail: sanitizeProviderMessage(message) },
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
      const extension = ref.mime === "image/png" ? "png" : "jpg";
      form.append("image", new Blob([toArrayBuffer(ref.bytes)], { type: ref.mime }), `ref-${index}.${extension}`);
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

  const response = await fetchImpl(url, { method: "POST", headers, body, redirect: "manual", signal });
  if (response.type === "opaqueredirect" || response.status === 0 || (response.status >= 300 && response.status < 400)) {
    throw new Error("生图服务返回了重定向，已停止请求");
  }
  const text = await response.text();
  if (text.length > LIMITS.maxProviderJsonChars) throw new Error("生图服务的响应太大");
  if (!response.ok) throw new Error(readProviderError(text, response.status));

  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error("生图服务没有返回 JSON");
  }
  const data = (json as { data?: { b64_json?: string; url?: string }[] }).data;
  if (!Array.isArray(data) || data.length === 0) throw new Error("生图服务没有返回图片");
  if (data.length > LIMITS.maxCount) throw new Error("生图服务返回的图片数量超出限制");

  const images: { mime: string; b64: string }[] = [];
  for (const item of data) {
    if (item?.b64_json) {
      images.push(imageFromBase64(item.b64_json));
      continue;
    }
    if (item?.url) {
      images.push(await downloadPublicImage(item.url, fetchImpl, lookup, signal));
      continue;
    }
    throw new Error("生图服务的图片字段无法读取");
  }
  return images;
}

function appendExtra(form: FormData, request: GenerateRequest, caps: Caps) {
  if (caps.negative && request.negativePrompt) form.set("negative_prompt", request.negativePrompt);
  if (caps.seed && request.seed !== undefined) form.set("seed", String(request.seed));
  if (caps.steps && request.steps !== undefined) form.set("steps", String(request.steps));
}

function imageFromBase64(data: string): { mime: string; b64: string } {
  if (data.length > 12_000_000) throw new Error("返回的图片太大");
  const bytes = Buffer.from(data, "base64");
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
  const inspected = inspectProviderUrl(raw);
  if (!inspected.ok) throw new Error("已拒绝下载非 https 或内网的结果图");
  const addresses = await lookup(inspected.host);
  const blocked = assertResolvedAddresses(addresses);
  if (blocked) throw new Error(blocked);
  const response = await fetchImpl(inspected.url.toString(), {
    method: "GET",
    redirect: "manual",
    signal,
    headers: { Accept: "image/png,image/jpeg,image/webp" },
  });
  if (response.type === "opaqueredirect" || response.status === 0 || (response.status >= 300 && response.status < 400)) {
    throw new Error("结果图地址发生了重定向，已停止");
  }
  if (!response.ok) throw new Error("结果图下载失败");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 16 || bytes.byteLength > LIMITS.maxResultBytes) throw new Error("结果图太大或是空的");
  const mime = sniffImage(bytes);
  if (!mime) throw new Error("结果图不是受支持的图片");
  return { mime, b64: Buffer.from(bytes).toString("base64") };
}

function readProviderError(text: string, status: number): string {
  try {
    const json = JSON.parse(text) as { error?: { message?: string } | string };
    const message = typeof json.error === "string" ? json.error : json.error?.message;
    if (message) return sanitizeProviderMessage(message);
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

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export type { PublicCaps };
