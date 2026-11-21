import { sniffImage } from "./sniff";

export function imageFromPayload(b64: string): { mime: string; blob: Blob; url: string } | null {
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const mime = sniffImage(bytes);
  if (!mime) return null;
  const blob = new Blob([bytes], { type: mime });
  return { mime, blob, url: URL.createObjectURL(blob) };
}
