import { LIMITS } from "./limits";
import {
  type AspectId,
  type Caps,
  type StyleId,
  isAspect,
  isStyle,
} from "./models";
import { pngSize, sniffImage } from "./sniff";

export type ReferenceImage = {
  mime: string;
  bytes: Uint8Array;
};

export type GenerateRequest = {
  prompt: string;
  aspect: AspectId;
  count: number;
  styles: StyleId[];
  model?: string;
  negativePrompt?: string;
  seed?: number;
  steps?: number;
  references: ReferenceImage[];
};

export type ParseResult = { ok: true; value: GenerateRequest } | { ok: false; error: string };

export function parseGenerateBody(input: unknown): ParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "请求格式不对" };
  }
  const body = input as Record<string, unknown>;
  if (typeof body.prompt !== "string") return { ok: false, error: "先写下想画的内容" };
  const prompt = body.prompt.replace(/\r\n/g, "\n").trim();
  if (!prompt) return { ok: false, error: "先写下想画的内容" };
  if ([...prompt].length > LIMITS.maxPrompt) {
    return { ok: false, error: `提示最多 ${LIMITS.maxPrompt} 字` };
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(prompt)) {
    return { ok: false, error: "提示里有不能提交的控制字符" };
  }
  if (typeof body.aspect !== "string" || !isAspect(body.aspect)) {
    return { ok: false, error: "画幅不在可选范围内" };
  }
  if (typeof body.count !== "number" || !Number.isInteger(body.count) || body.count < 1 || body.count > LIMITS.maxCount) {
    return { ok: false, error: `数量需要是 1 到 ${LIMITS.maxCount} 的整数` };
  }
  if (!Array.isArray(body.styles) || body.styles.length > LIMITS.maxStyles) {
    return { ok: false, error: "风格数量不对" };
  }
  const styles: StyleId[] = [];
  for (const style of body.styles) {
    if (typeof style !== "string" || !isStyle(style)) return { ok: false, error: "有无法识别的风格" };
    if (!styles.includes(style)) styles.push(style);
  }

  let negativePrompt: string | undefined;
  if (body.negativePrompt !== undefined && body.negativePrompt !== "") {
    if (typeof body.negativePrompt !== "string") return { ok: false, error: "排除内容格式不对" };
    const negative = body.negativePrompt.trim();
    if ([...negative].length > LIMITS.maxNegative) {
      return { ok: false, error: `排除内容最多 ${LIMITS.maxNegative} 字` };
    }
    if (negative) negativePrompt = negative;
  }

  const seed = optionalInt(body.seed, 0, 2_147_483_647, "种子需要是 0 到 2147483647 的整数");
  if (seed.ok === false) return seed;
  const steps = optionalInt(body.steps, 1, 50, "步数需要是 1 到 50 的整数");
  if (steps.ok === false) return steps;

  const references = parseReferences(body.references);
  if (references.ok === false) return references;

  let model: string | undefined;
  if (body.model !== undefined && body.model !== "") {
    if (typeof body.model !== "string" || !/^[^\s"'<>]{1,120}$/.test(body.model)) {
      return { ok: false, error: "模型名称无法识别" };
    }
    model = body.model;
  }

  return {
    ok: true,
    value: {
      prompt,
      aspect: body.aspect,
      count: body.count,
      styles,
      model,
      negativePrompt,
      seed: seed.value,
      steps: steps.value,
      references: references.value,
    },
  };
}

function optionalInt(
  value: unknown,
  min: number,
  max: number,
  error: string,
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: undefined };
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    return { ok: false, error };
  }
  return { ok: true, value };
}

function parseReferences(value: unknown): { ok: true; value: ReferenceImage[] } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value) || value.length > LIMITS.maxRefs) {
    return { ok: false, error: `参考图最多 ${LIMITS.maxRefs} 张` };
  }
  const images: ReferenceImage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return { ok: false, error: "参考图格式不对" };
    const ref = item as Record<string, unknown>;
    if (ref.mime !== "image/png" && ref.mime !== "image/jpeg" && ref.mime !== "image/webp") {
      return { ok: false, error: "参考图只接受 PNG、JPEG 或 WebP" };
    }
    if (typeof ref.data !== "string" || ref.data.startsWith("data:") || ref.data.length > 6_000_000) {
      return { ok: false, error: "参考图数据无法读取，或超过 4MB" };
    }
    const bytes = decodeBase64Strict(ref.data, LIMITS.maxRefBytes);
    if (!bytes) return { ok: false, error: "参考图数据无法读取，或超过 4MB" };
    const sniffed = sniffImage(bytes);
    if (!sniffed || sniffed !== ref.mime) {
      return { ok: false, error: "参考图的内容和类型对不上" };
    }
    images.push({ mime: sniffed, bytes });
  }
  return { ok: true, value: images };
}

export function enforceCapabilities(request: GenerateRequest, caps: Caps): string | null {
  if (!caps.counts.includes(request.count)) {
    return `当前模型一次只能画 ${caps.counts.join("、")} 张`;
  }
  if (!caps.sizes[request.aspect]) {
    return "当前模型不支持这个画幅";
  }
  if (request.negativePrompt && !caps.negative) {
    return "当前模型不支持排除内容";
  }
  if (request.seed !== undefined && !caps.seed) {
    return "当前模型不支持种子";
  }
  if (request.steps !== undefined && !caps.steps) {
    return "当前模型不支持步数";
  }
  if (request.references.length > 0 && !caps.reference) {
    return "当前模型不支持参考图";
  }
  if (request.references.length > caps.referenceMax) {
    return `当前模型最多接受 ${caps.referenceMax} 张参考图`;
  }
  for (const ref of request.references) {
    if (!caps.referenceMimes.includes(ref.mime)) {
      return "当前模型不接受这种参考图";
    }
  }
  if (caps.squareOnly) {
    for (const ref of request.references) {
      const size = pngSize(ref.bytes);
      if (!size || size.width !== size.height) {
        return "这个模型的参考图需要是正方形 PNG";
      }
    }
  }
  return null;
}

export function decodeBase64Strict(data: string, maxBytes: number): Uint8Array | null {
  if (data.length === 0 || data.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const buf = Buffer.from(data, "base64");
  if (buf.length < 16 || buf.length > maxBytes) return null;
  return new Uint8Array(buf);
}

export function parseJsonLimited(
  text: string,
  max: number = LIMITS.maxJsonChars,
): { ok: true; value: unknown } | { ok: false; status: number; error: string } {
  if (text.length > max) return { ok: false, status: 413, error: "请求太大" };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, error: "请求不是 JSON" };
  }
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const raw = forwarded?.split(",")[0] ?? headers.get("x-real-ip") ?? "local";
  const ip = raw.trim().slice(0, 80);
  return ip || "local";
}
