import { networkInterfaces } from "node:os";

let ownAddresses: Set<string> | null = null;

export function rememberOwnAddresses(addresses: string[] | null): void {
  ownAddresses = addresses ? new Set(addresses.map((item) => item.toLowerCase())) : null;
}

export function isOwnAddress(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (name === "localhost" || name === "127.0.0.1" || name === "::1") return true;
  return currentOwnAddresses().has(name);
}

export function preferLoopbackUrl(raw: string): string {
  const url = new URL(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return raw;
  if (!currentOwnAddresses().has(host)) return raw;
  url.hostname = "127.0.0.1";
  return url.toString();
}

export async function fetchUpstream(
  raw: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const primary = preferLoopbackUrl(raw);
  try {
    return await fetchImpl(primary, init);
  } catch (error) {
    if (primary === raw || !isConnectFailure(error)) throw error;
    return fetchImpl(raw, init);
  }
}

export function upstreamFailureMessage(error: unknown, url?: string): string {
  const code = causeCode(error);
  const where = url ? `（${safeHost(url)}）` : "";
  if (code === "ECONNREFUSED") return `连不上生图服务${where}。请核对 IP 和端口，本机服务可以写 127.0.0.1`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `找不到生图服务的主机${where}`;
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH" || code === "ECONNRESET") return `到生图服务的网络中断了${where}`;
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") {
    return `连接生图服务超时${where}。如果服务就在这台电脑上，请改用 http://127.0.0.1:端口/v1`;
  }
  if (error instanceof Error && error.message && error.message !== "fetch failed") return error.message;
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error && cause.message) return cause.message;
  return "没有连上生图服务";
}

function currentOwnAddresses(): Set<string> {
  if (ownAddresses) return ownAddresses;
  const found = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (!entry || entry.internal) continue;
      found.add(entry.address.toLowerCase().replace(/^\[|\]$/g, ""));
    }
  }
  ownAddresses = found;
  return found;
}

function isConnectFailure(error: unknown): boolean {
  const code = causeCode(error);
  return code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "EHOSTUNREACH";
}

function causeCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = error instanceof Error ? error.cause : undefined;
  if (!cause || typeof cause !== "object") return "";
  const code = (cause as { code?: unknown }).code;
  if (typeof code === "string") return code;
  const nested = (cause as { errors?: unknown }).errors;
  if (!Array.isArray(nested)) return "";
  for (const item of nested) {
    const found = causeCode(item);
    if (found) return found;
  }
  return "";
}

function safeHost(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}
