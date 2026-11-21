import { LIMITS } from "./limits";
import { type ImageMime, sniffImage } from "./sniff";

export type LoadedReference = {
  mime: ImageMime;
  data: string;
  name: string;
};

export async function readReferenceFile(file: File): Promise<{ ok: true; value: LoadedReference } | { ok: false; error: string }> {
  if (file.size <= 0) return { ok: false, error: "这张图是空的" };
  if (file.size > LIMITS.maxRefBytes) return { ok: false, error: "参考图需要小于 4MB" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return { ok: false, error: "只接受 PNG、JPEG 或 WebP" };
  if (file.type && file.type !== mime && file.type !== "image/jpg") {
    return { ok: false, error: "文件类型和内容对不上" };
  }
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    const { width, height } = bitmap;
    bitmap.close();
    if (width > LIMITS.maxEdge || height > LIMITS.maxEdge) {
      return { ok: false, error: "参考图边长需要在 4096 像素以内" };
    }
  } catch {
    return { ok: false, error: "这张图读不出来" };
  }
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return {
    ok: true,
    value: { mime, data: btoa(binary), name: file.name || "参考图" },
  };
}
