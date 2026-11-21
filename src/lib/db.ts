import { LIMITS } from "./limits";
import type { AspectId, StyleId } from "./models";

export type WorkImage = { mime: string; blob: Blob };

export type WorkRecord = {
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
  images: WorkImage[];
};

export type PromptRecord = {
  id: string;
  createdAt: number;
  title: string;
  text: string;
  favorite: boolean;
  aspect: AspectId;
  styles: StyleId[];
  modelId: string;
};

export type ExampleStar = {
  exampleId: string;
  createdAt: number;
};

export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryError";
  }
}

const DB_NAME = "miao-studio";
const DB_VERSION = 1;

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new LibraryError("这台浏览器没有可用的本地数据库"));
  }
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("works")) db.createObjectStore("works", { keyPath: "id" });
      if (!db.objectStoreNames.contains("prompts")) db.createObjectStore("prompts", { keyPath: "id" });
      if (!db.objectStoreNames.contains("exampleStars")) {
        db.createObjectStore("exampleStars", { keyPath: "exampleId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new LibraryError("打不开本地作品库"));
    };
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new LibraryError("本地库写入失败"));
    tx.onabort = () => reject(tx.error ?? new LibraryError("本地库写入中断"));
  });
}

function ask<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new LibraryError("本地库读取失败"));
  });
}

export function storageErrorMessage(error: unknown): string {
  if (error instanceof LibraryError) return error.message;
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
    return "这台浏览器的本地空间满了。可以先删掉一些作品。";
  }
  return "没能写进这台浏览器的本地库。";
}

export async function listWorks(): Promise<WorkRecord[]> {
  const db = await openDb();
  const tx = db.transaction("works", "readonly");
  const finishing = done(tx);
  const rows = await ask(tx.objectStore("works").getAll() as IDBRequest<WorkRecord[]>);
  await finishing;
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveWork(work: WorkRecord): Promise<void> {
  if (work.images.length < 1 || work.images.length > LIMITS.maxCount) {
    throw new LibraryError("要留下的图片数量不对");
  }
  if (work.images.some((image) => image.blob.size > LIMITS.maxResultBytes)) {
    throw new LibraryError("有一张图超过了本地保存上限");
  }
  const existing = await listWorks();
  if (!existing.some((item) => item.id === work.id) && existing.length >= LIMITS.maxWorks) {
    const oldest = [...existing].reverse().find((item) => !item.favorite);
    if (!oldest) throw new LibraryError(`作品集已有 ${LIMITS.maxWorks} 张，而且都在收藏里。先腾出位置。`);
    await deleteWork(oldest.id);
  }
  const db = await openDb();
  const tx = db.transaction("works", "readwrite");
  const finishing = done(tx);
  tx.objectStore("works").put(work);
  await finishing;
}

export async function setWorkFavorite(id: string, favorite: boolean): Promise<void> {
  const current = (await listWorks()).find((item) => item.id === id);
  if (!current) throw new LibraryError("没有找到这张作品");
  const db = await openDb();
  const tx = db.transaction("works", "readwrite");
  const finishing = done(tx);
  tx.objectStore("works").put({ ...current, favorite });
  await finishing;
}

export async function deleteWork(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("works", "readwrite");
  const finishing = done(tx);
  tx.objectStore("works").delete(id);
  await finishing;
}

export async function listPrompts(): Promise<PromptRecord[]> {
  const db = await openDb();
  const tx = db.transaction("prompts", "readonly");
  const finishing = done(tx);
  const rows = await ask(tx.objectStore("prompts").getAll() as IDBRequest<PromptRecord[]>);
  await finishing;
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function savePrompt(prompt: PromptRecord): Promise<"created" | "exists"> {
  if ([...prompt.text].length > LIMITS.maxPrompt) throw new LibraryError(`提示最多 ${LIMITS.maxPrompt} 字`);
  const existing = await listPrompts();
  if (existing.some((item) => item.text === prompt.text)) return "exists";
  if (existing.length >= LIMITS.maxPrompts) {
    throw new LibraryError(`提示词已有 ${LIMITS.maxPrompts} 条。先删掉几条。`);
  }
  const db = await openDb();
  const tx = db.transaction("prompts", "readwrite");
  const finishing = done(tx);
  tx.objectStore("prompts").put(prompt);
  await finishing;
  return "created";
}

export async function setPromptFavorite(id: string, favorite: boolean): Promise<void> {
  const current = (await listPrompts()).find((item) => item.id === id);
  if (!current) throw new LibraryError("没有找到这句提示");
  const db = await openDb();
  const tx = db.transaction("prompts", "readwrite");
  const finishing = done(tx);
  tx.objectStore("prompts").put({ ...current, favorite });
  await finishing;
}

export async function deletePrompt(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("prompts", "readwrite");
  const finishing = done(tx);
  tx.objectStore("prompts").delete(id);
  await finishing;
}

export async function listExampleStars(): Promise<ExampleStar[]> {
  const db = await openDb();
  const tx = db.transaction("exampleStars", "readonly");
  const finishing = done(tx);
  const rows = await ask(tx.objectStore("exampleStars").getAll() as IDBRequest<ExampleStar[]>);
  await finishing;
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function setExampleStar(exampleId: string, on: boolean): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("exampleStars", "readwrite");
  const finishing = done(tx);
  const store = tx.objectStore("exampleStars");
  if (on) store.put({ exampleId, createdAt: Date.now() } satisfies ExampleStar);
  else store.delete(exampleId);
  await finishing;
}
