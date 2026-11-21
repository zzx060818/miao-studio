import { LIMITS } from "./limits";

export const ASPECTS = [
  { id: "1:1", label: "1:1 方图" },
  { id: "4:3", label: "4:3 横图" },
  { id: "3:4", label: "3:4 竖图" },
  { id: "16:9", label: "16:9 宽屏" },
  { id: "9:16", label: "9:16 竖屏" },
] as const;

export type AspectId = (typeof ASPECTS)[number]["id"];

export const STYLES = [
  { id: "pixel", label: "像素插画" },
  { id: "still", label: "静物摄影" },
  { id: "surreal", label: "超现实 3D" },
  { id: "ink", label: "水墨" },
  { id: "film", label: "胶片" },
  { id: "flat", label: "扁平色块" },
] as const;

export type StyleId = (typeof STYLES)[number]["id"];

export type Caps = {
  negative: boolean;
  seed: boolean;
  steps: boolean;
  reference: boolean;
  counts: number[];
  sizes: Record<AspectId, string | null>;
  referenceMimes: string[];
  referenceMax: number;
  squareOnly: boolean;
};

export type PublicCaps = {
  negative: boolean;
  seed: boolean;
  steps: boolean;
  reference: boolean;
  counts: number[];
  aspects: { id: AspectId; label: string; size: string }[];
  referenceMimes: string[];
  referenceMax: number;
  squareOnly: boolean;
  note: string;
};

const SQUARE: Record<AspectId, string | null> = {
  "1:1": "1024x1024",
  "4:3": null,
  "3:4": null,
  "16:9": null,
  "9:16": null,
};

const GPT_SIZES: Record<AspectId, string | null> = {
  "1:1": "1024x1024",
  "4:3": "1536x1024",
  "3:4": "1024x1536",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
};

const D3_SIZES: Record<AspectId, string | null> = {
  "1:1": "1024x1024",
  "4:3": null,
  "3:4": null,
  "16:9": "1792x1024",
  "9:16": "1024x1792",
};

export const GPT_IMAGE_CAPS: Caps = {
  negative: false,
  seed: false,
  steps: false,
  reference: true,
  counts: [1, 2, 3, 4],
  sizes: GPT_SIZES,
  referenceMimes: ["image/png", "image/jpeg"],
  referenceMax: 4,
  squareOnly: false,
};

export const DALLE3_CAPS: Caps = {
  negative: false,
  seed: false,
  steps: false,
  reference: false,
  counts: [1],
  sizes: D3_SIZES,
  referenceMimes: [],
  referenceMax: 0,
  squareOnly: false,
};

export const DALLE2_CAPS: Caps = {
  negative: false,
  seed: false,
  steps: false,
  reference: true,
  counts: [1, 2, 3, 4],
  sizes: SQUARE,
  referenceMimes: ["image/png"],
  referenceMax: 1,
  squareOnly: true,
};

export const PLACEHOLDER_CAPS: Caps = {
  negative: false,
  seed: false,
  steps: false,
  reference: false,
  counts: [1],
  sizes: { ...GPT_SIZES },
  referenceMimes: [],
  referenceMax: 0,
  squareOnly: false,
};

const CONSERVATIVE: Caps = {
  negative: false,
  seed: false,
  steps: false,
  reference: false,
  counts: [1],
  sizes: { ...SQUARE },
  referenceMimes: [],
  referenceMax: 0,
  squareOnly: false,
};

const KNOWN: Record<string, Caps> = {
  "gpt-image-1": GPT_IMAGE_CAPS,
  "dall-e-3": DALLE3_CAPS,
  "dall-e-2": DALLE2_CAPS,
};

export type UiModel = {
  id: string;
  label: string;
  note: string;
  caps: Caps;
};

export const UI_MODELS: UiModel[] = [
  {
    id: "placeholder",
    label: "通用 · 占位",
    note: "界面占位。服务未配置时，这个选项不会出图。",
    caps: PLACEHOLDER_CAPS,
  },
  {
    id: "gpt-image-1",
    label: "GPT Image",
    note: "官方接口可带参考图。不支持排除内容、种子和步数。4:3 与 16:9 会落到同一档横向尺寸。",
    caps: GPT_IMAGE_CAPS,
  },
  {
    id: "dall-e-3",
    label: "DALL·E 3",
    note: "一次一张。没有参考图、种子、步数或排除内容。画幅只有方图和两种宽屏。",
    caps: DALLE3_CAPS,
  },
  {
    id: "dall-e-2",
    label: "DALL·E 2",
    note: "只出方图。参考图只接受一张正方形 PNG。",
    caps: DALLE2_CAPS,
  },
];

export function isAspect(value: string): value is AspectId {
  return ASPECTS.some((item) => item.id === value);
}

export function isStyle(value: string): value is StyleId {
  return STYLES.some((item) => item.id === value);
}

export function styleLabel(id: StyleId): string {
  return STYLES.find((item) => item.id === id)?.label ?? id;
}

export function toPublicCaps(caps: Caps, note: string): PublicCaps {
  return {
    negative: caps.negative,
    seed: caps.seed,
    steps: caps.steps,
    reference: caps.reference,
    counts: caps.counts.filter((count) => count >= 1 && count <= LIMITS.maxCount),
    aspects: ASPECTS.flatMap((aspect) => {
      const size = caps.sizes[aspect.id];
      return size ? [{ id: aspect.id, label: aspect.label, size }] : [];
    }),
    referenceMimes: [...caps.referenceMimes],
    referenceMax: caps.referenceMax,
    squareOnly: caps.squareOnly,
    note,
  };
}

export function capsForModel(model: string, extras: string[]): Caps {
  const base = KNOWN[model] ?? CONSERVATIVE;
  const extra = new Set(extras);
  const caps: Caps = {
    ...base,
    counts: [...base.counts],
    sizes: { ...base.sizes },
    referenceMimes: [...base.referenceMimes],
  };
  if (extra.has("negative")) caps.negative = true;
  if (extra.has("seed")) caps.seed = true;
  if (extra.has("steps")) caps.steps = true;
  if (extra.has("reference")) {
    caps.reference = true;
    if (caps.referenceMimes.length === 0) {
      caps.referenceMimes = ["image/png", "image/jpeg", "image/webp"];
    }
    if (caps.referenceMax < 1) caps.referenceMax = LIMITS.maxRefs;
  }
  return caps;
}

export function applySizeMap(caps: Caps, raw: string | undefined): Caps {
  if (!raw?.trim()) return caps;
  const sizes = { ...caps.sizes };
  for (const part of raw.split(",")) {
    const [aspect, size] = part.split("=").map((item) => item.trim());
    if (!aspect || !size || !isAspect(aspect) || !validSize(size)) continue;
    sizes[aspect] = size;
  }
  return { ...caps, sizes };
}

function validSize(size: string): boolean {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width >= 256 && height >= 256 && width <= 2048 && height <= 2048;
}

export function composePrompt(prompt: string, styles: StyleId[]): string {
  if (styles.length === 0) return prompt;
  return `${prompt}\n风格：${styles.map((id) => styleLabel(id)).join("、")}。`;
}

export function modelNote(model: string): string {
  return (
    UI_MODELS.find((item) => item.id === model)?.note ??
    "未内置这个模型的参数表。默认只发送方图和一张；排除内容、种子、步数、参考图需要服务器显式打开。"
  );
}
