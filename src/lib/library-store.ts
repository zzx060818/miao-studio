import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "./data-dir";
import { EXAMPLES } from "./examples";
import { LIMITS } from "./limits";
import { type AspectId, type StyleId, isAspect, isStyle } from "./models";
import { sniffImage } from "./sniff";
import { decodeBase64Strict } from "./validation";

export type LibraryImage = { mime: string; bytes: Uint8Array };

export type LibraryWork = {
  id: string;
  createdAt: number;
  favorite: boolean;
  prompt: string;
  negativePrompt: string;
  modelLabel: string;
  aspect: AspectId;
  styles: StyleId[];
  seed: number | null;
  steps: number | null;
  images: { mime: string }[];
};

export type LibraryPrompt = {
  id: string;
  createdAt: number;
  title: string;
  text: string;
  favorite: boolean;
  aspect: AspectId;
  styles: StyleId[];
  modelId: string;
};

export type LibraryStar = { exampleId: string; createdAt: number };

type StoredWork = LibraryWork & { files: string[] };

type Meta = {
  works: StoredWork[];
  prompts: LibraryPrompt[];
  stars: LibraryStar[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXAMPLE_IDS = new Set(EXAMPLES.map((example) => example.id));

let chain: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function userDir(userId: string): string {
  if (!UUID.test(userId)) throw new Error("账号无法识别");
  return join(dataDir(), "library", userId);
}

async function readMeta(userId: string): Promise<Meta> {
  try {
    const text = await readFile(join(userDir(userId), "meta.json"), "utf8");
    const parsed = JSON.parse(text) as Partial<Meta>;
    return {
      works: Array.isArray(parsed.works) ? parsed.works : [],
      prompts: Array.isArray(parsed.prompts) ? parsed.prompts : [],
      stars: Array.isArray(parsed.stars) ? parsed.stars : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { works: [], prompts: [], stars: [] };
    throw new Error("作品库暂时读不出来");
  }
}

async function writeMeta(userId: string, meta: Meta): Promise<void> {
  const dir = userDir(userId);
  await mkdir(dir, { recursive: true });
  const file = join(dir, "meta.json");
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(meta), { mode: 0o600 });
  await rename(tmp, file);
}

function toPublicWork(work: StoredWork): LibraryWork {
  return {
    id: work.id,
    createdAt: work.createdAt,
    favorite: work.favorite,
    prompt: work.prompt,
    negativePrompt: work.negativePrompt,
    modelLabel: work.modelLabel,
    aspect: work.aspect,
    styles: work.styles,
    seed: work.seed,
    steps: work.steps,
    images: work.images.map((image) => ({ mime: image.mime })),
  };
}

export async function listLibrary(userId: string): Promise<{ works: LibraryWork[]; prompts: LibraryPrompt[]; stars: LibraryStar[] }> {
  const meta = await readMeta(userId);
  return {
    works: meta.works.slice().sort((a, b) => b.createdAt - a.createdAt).map(toPublicWork),
    prompts: meta.prompts.slice().sort((a, b) => b.createdAt - a.createdAt),
    stars: meta.stars.slice().sort((a, b) => b.createdAt - a.createdAt),
  };
}

export async function readWorkImage(userId: string, workId: string, index: number): Promise<LibraryImage | null> {
  if (!UUID.test(workId) || !Number.isInteger(index) || index < 0) return null;
  const meta = await readMeta(userId);
  const work = meta.works.find((item) => item.id === workId);
  const file = work?.files[index];
  const mime = work?.images[index]?.mime;
  if (!work || !file || !mime || !/^[\w.-]+$/.test(file)) return null;
  try {
    const bytes = new Uint8Array(await readFile(join(userDir(userId), file)));
    return { mime, bytes };
  } catch {
    return null;
  }
}

function textOf(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text || [...text].length > max) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) return null;
  return text;
}

export function saveLibraryWork(
  userId: string,
  input: {
    id?: string;
    prompt: string;
    negativePrompt?: string;
    modelLabel?: string;
    aspect: string;
    styles?: unknown;
    seed?: number | null;
    steps?: number | null;
    images: { mime?: string; data?: string }[];
  },
): Promise<{ ok: true; work: LibraryWork } | { ok: false; error: string }> {
  return locked(async () => {
    const prompt = textOf(input.prompt, LIMITS.maxPrompt);
    if (!prompt) return { ok: false, error: "提示词无法保存" };
    if (!isAspect(input.aspect)) return { ok: false, error: "画幅无法保存" };
    const styles = Array.isArray(input.styles) ? input.styles.filter((item): item is StyleId => typeof item === "string" && isStyle(item)) : [];
    if (!Array.isArray(input.images) || input.images.length < 1 || input.images.length > LIMITS.maxCount) {
      return { ok: false, error: "要留下的图片数量不对" };
    }
    const decoded: LibraryImage[] = [];
    for (const image of input.images) {
      if (typeof image.data !== "string") return { ok: false, error: "有一张图无法保存" };
      const bytes = decodeBase64Strict(image.data, LIMITS.maxResultBytes);
      if (!bytes) return { ok: false, error: "有一张图超过了保存上限，或内容读不出来" };
      const sniffed = sniffImage(bytes);
      if (!sniffed || sniffed !== image.mime) return { ok: false, error: "有一张图的内容和类型对不上" };
      decoded.push({ mime: sniffed, bytes });
    }
    const meta = await readMeta(userId);
    const id = input.id && UUID.test(input.id) ? input.id : crypto.randomUUID();
    if (meta.works.some((work) => work.id === id)) return { ok: false, error: "这张作品已经保存过了" };
    if (meta.works.length >= LIMITS.maxWorks) {
      const oldest = [...meta.works].reverse().find((work) => !work.favorite);
      if (!oldest) return { ok: false, error: `作品集已有 ${LIMITS.maxWorks} 张，而且都在收藏里。先腾出位置。` };
      await removeWorkFiles(userId, oldest);
      meta.works = meta.works.filter((work) => work.id !== oldest.id);
    }
    const files = decoded.map((_, index) => `${id}-${index}`);
    await mkdir(userDir(userId), { recursive: true });
    for (const [index, image] of decoded.entries()) {
      await writeFile(join(userDir(userId), files[index]), image.bytes, { mode: 0o600 });
    }
    const work: StoredWork = {
      id,
      createdAt: Date.now(),
      favorite: false,
      prompt,
      negativePrompt: textOf(input.negativePrompt ?? "", LIMITS.maxNegative) ?? "",
      modelLabel: typeof input.modelLabel === "string" ? input.modelLabel.slice(0, 120) : "",
      aspect: input.aspect,
      styles,
      seed: typeof input.seed === "number" ? input.seed : null,
      steps: typeof input.steps === "number" ? input.steps : null,
      images: decoded.map((image) => ({ mime: image.mime })),
      files,
    };
    meta.works.push(work);
    await writeMeta(userId, meta);
    return { ok: true, work: toPublicWork(work) };
  });
}

async function removeWorkFiles(userId: string, work: StoredWork): Promise<void> {
  await Promise.all(work.files.map((file) => rm(join(userDir(userId), file), { force: true })));
}

export function setLibraryWorkFavorite(
  userId: string,
  id: string,
  favorite: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return locked(async () => {
    const meta = await readMeta(userId);
    const work = meta.works.find((item) => item.id === id);
    if (!work) return { ok: false, error: "没有找到这张作品" };
    work.favorite = favorite;
    await writeMeta(userId, meta);
    return { ok: true };
  });
}

export function deleteLibraryWork(userId: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return locked(async () => {
    const meta = await readMeta(userId);
    const work = meta.works.find((item) => item.id === id);
    if (!work) return { ok: false, error: "没有找到这张作品" };
    await removeWorkFiles(userId, work);
    meta.works = meta.works.filter((item) => item.id !== id);
    await writeMeta(userId, meta);
    return { ok: true };
  });
}

export function saveLibraryPrompt(
  userId: string,
  input: { id?: string; title?: string; text?: string; aspect?: string; styles?: unknown; modelId?: string },
): Promise<{ ok: true; status: "created" | "exists" } | { ok: false; error: string }> {
  return locked(async () => {
    const text = textOf(input.text, LIMITS.maxPrompt);
    if (!text) return { ok: false, error: `提示最多 ${LIMITS.maxPrompt} 字` };
    if (typeof input.aspect !== "string" || !isAspect(input.aspect)) return { ok: false, error: "画幅无法保存" };
    const styles = Array.isArray(input.styles) ? input.styles.filter((item): item is StyleId => typeof item === "string" && isStyle(item)) : [];
    const meta = await readMeta(userId);
    if (meta.prompts.some((item) => item.text === text)) return { ok: true, status: "exists" };
    if (meta.prompts.length >= LIMITS.maxPrompts) {
      return { ok: false, error: `提示词已有 ${LIMITS.maxPrompts} 条。先删掉几条。` };
    }
    const title = textOf(input.title ?? "", 40) ?? [...text.split("\n")[0] ?? "未命名"].slice(0, 18).join("");
    meta.prompts.push({
      id: input.id && UUID.test(input.id) ? input.id : crypto.randomUUID(),
      createdAt: Date.now(),
      title,
      text,
      favorite: false,
      aspect: input.aspect,
      styles,
      modelId: typeof input.modelId === "string" ? input.modelId.slice(0, 120) : "",
    });
    await writeMeta(userId, meta);
    return { ok: true, status: "created" };
  });
}

export function setLibraryPromptFavorite(
  userId: string,
  id: string,
  favorite: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return locked(async () => {
    const meta = await readMeta(userId);
    const prompt = meta.prompts.find((item) => item.id === id);
    if (!prompt) return { ok: false, error: "没有找到这句提示" };
    prompt.favorite = favorite;
    await writeMeta(userId, meta);
    return { ok: true };
  });
}

export function deleteLibraryPrompt(userId: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return locked(async () => {
    const meta = await readMeta(userId);
    if (!meta.prompts.some((item) => item.id === id)) return { ok: false, error: "没有找到这句提示" };
    meta.prompts = meta.prompts.filter((item) => item.id !== id);
    await writeMeta(userId, meta);
    return { ok: true };
  });
}

export function setLibraryStar(userId: string, exampleId: string, on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  return locked(async () => {
    if (!EXAMPLE_IDS.has(exampleId)) return { ok: false, error: "没有这张示例" };
    const meta = await readMeta(userId);
    meta.stars = meta.stars.filter((item) => item.exampleId !== exampleId);
    if (on) meta.stars.push({ exampleId, createdAt: Date.now() });
    await writeMeta(userId, meta);
    return { ok: true };
  });
}
