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

type WorkMeta = Omit<WorkRecord, "images"> & { images: { mime: string }[] };

export function storageErrorMessage(error: unknown): string {
  if (error instanceof LibraryError) return error.message;
  return "没能写进这台服务器的作品库。";
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || json.ok === false) {
    throw new LibraryError(typeof json.error === "string" ? json.error : "没能读写作品库");
  }
  return json;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function listWorks(): Promise<WorkRecord[]> {
  const response = await fetch("/api/library", { cache: "no-store" });
  const json = await readJson(response);
  const metas = Array.isArray(json.works) ? (json.works as WorkMeta[]) : [];
  return Promise.all(
    metas.map(async (work) => ({
      ...work,
      images: await Promise.all(
        work.images.map(async (image, index) => {
          const file = await fetch(`/api/library/works/${work.id}/images/${index}`, { cache: "no-store" });
          if (!file.ok) throw new LibraryError("有一张图没能读出来");
          return { mime: image.mime || file.headers.get("content-type") || "image/png", blob: await file.blob() };
        }),
      ),
    })),
  );
}

export async function saveWork(work: WorkRecord): Promise<void> {
  const images = await Promise.all(
    work.images.map(async (image) => ({
      mime: image.mime,
      data: bytesToBase64(new Uint8Array(await image.blob.arrayBuffer())),
    })),
  );
  const response = await fetch("/api/library/works", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...work, images }),
  });
  await readJson(response);
}

export async function setWorkFavorite(id: string, favorite: boolean): Promise<void> {
  const response = await fetch(`/api/library/works/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorite }),
  });
  await readJson(response);
}

export async function deleteWork(id: string): Promise<void> {
  const response = await fetch(`/api/library/works/${id}`, { method: "DELETE" });
  await readJson(response);
}

export async function listPrompts(): Promise<PromptRecord[]> {
  const response = await fetch("/api/library", { cache: "no-store" });
  const json = await readJson(response);
  return Array.isArray(json.prompts) ? (json.prompts as PromptRecord[]) : [];
}

export async function savePrompt(prompt: PromptRecord): Promise<"created" | "exists"> {
  const response = await fetch("/api/library/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prompt),
  });
  const json = await readJson(response);
  return json.status === "exists" ? "exists" : "created";
}

export async function setPromptFavorite(id: string, favorite: boolean): Promise<void> {
  const response = await fetch(`/api/library/prompts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorite }),
  });
  await readJson(response);
}

export async function deletePrompt(id: string): Promise<void> {
  const response = await fetch(`/api/library/prompts/${id}`, { method: "DELETE" });
  await readJson(response);
}

export async function listExampleStars(): Promise<ExampleStar[]> {
  const response = await fetch("/api/library", { cache: "no-store" });
  const json = await readJson(response);
  return Array.isArray(json.stars) ? (json.stars as ExampleStar[]) : [];
}

export async function setExampleStar(exampleId: string, on: boolean): Promise<void> {
  const response = await fetch("/api/library/stars", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exampleId, on }),
  });
  await readJson(response);
}
