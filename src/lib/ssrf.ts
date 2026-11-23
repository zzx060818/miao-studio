import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type UrlVerdict =
  | { ok: true; url: URL; host: string }
  | { ok: false; reason: string };

const METADATA_HOSTS = new Set(["metadata", "metadata.google.internal"]);

export function inspectProviderUrl(raw: string): UrlVerdict {
  return inspectUrl(raw, { allowQuery: false, label: "生图服务地址" });
}

export function inspectResultUrl(raw: string): UrlVerdict {
  return inspectUrl(raw, { allowQuery: true, label: "结果图地址" });
}

function inspectUrl(raw: string, options: { allowQuery: boolean; label: string }): UrlVerdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: `${options.label}不是合法 URL` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: `${options.label}不能带账号或密码` };
  }
  if (!options.allowQuery && (url.search || url.hash)) {
    return { ok: false, reason: `${options.label}不能带查询参数或片段` };
  }
  url.hash = "";
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) return { ok: false, reason: `${options.label}缺少主机名` };
  if (isMetadataHost(host)) {
    return { ok: false, reason: `${options.label}指向了云元数据地址` };
  }
  const local = isLocalProviderHost(host);
  if (url.protocol === "http:") {
    if (!local) return { ok: false, reason: options.allowQuery ? "公网结果图只接受 https 地址" : "公网生图服务只接受 https 地址" };
  } else if (url.protocol !== "https:") {
    return { ok: false, reason: options.allowQuery ? "结果图只接受 http 或 https 地址" : "生图服务只接受 http 或 https 地址" };
  }
  if (!local && isIP(host) === 0 && !host.includes(".")) {
    return { ok: false, reason: options.allowQuery ? "结果图地址需要完整的公网域名" : "生图服务地址需要完整的公网域名" };
  }
  return { ok: true, url, host };
}

function isMetadataHost(host: string): boolean {
  return METADATA_HOSTS.has(host) || host.endsWith(".metadata.google.internal") || (isIP(host) !== 0 && isMetadataAddress(host));
}

export function isLocalProviderHost(host: string): boolean {
  if (host === "localhost" || host === "localhost.localdomain" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  return isIP(host) !== 0 && isBlockedAddress(host) && !isMetadataAddress(host);
}

export function assertImageSource(host: string, addresses: string[], allowLocal = true): string | null {
  if (!allowLocal && isLocalProviderHost(host)) return "结果图跳到了内网地址";
  if (allowLocal && isLocalProviderHost(host)) return assertProviderAddresses(addresses);
  return assertResolvedAddresses(addresses);
}

export function assertResolvedAddresses(addresses: string[]): string | null {
  if (addresses.length === 0) return "生图服务地址没有解析出任何 IP";
  for (const address of addresses) {
    if (!isIP(address) || isBlockedAddress(address)) {
      return "生图服务地址解析到了内网或保留地址";
    }
  }
  return null;
}

export function assertProviderAddresses(addresses: string[]): string | null {
  if (addresses.length === 0) return "生图服务地址没有解析出任何 IP";
  for (const address of addresses) {
    if (!isIP(address)) return "生图服务地址没有解析出任何 IP";
    if (isMetadataAddress(address)) return "生图服务地址指向了云元数据或链路本地地址";
  }
  return null;
}

export function isMetadataAddress(address: string): boolean {
  let ip = address.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (ip.startsWith("::ffff:")) {
    const mapped = ip.slice("::ffff:".length);
    if (isIP(mapped) === 4) ip = mapped;
  }
  if (isIP(ip) === 4) {
    const parts = ip.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a] = parts;
    if (a === 0 || a >= 224) return true;
    if (a === 169 && parts[1] === 254) return true;
    return false;
  }
  if (isIP(ip) === 6) {
    if (ip === "::") return true;
    const first = (ip.split("::")[0] ?? "").split(":")[0] ?? "";
    return /^fe[89ab]/i.test(first);
  }
  return true;
}

export async function resolvePublicHost(host: string): Promise<string[]> {
  if (isIP(host)) return [host];
  const records = await lookup(host, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export function isBlockedAddress(address: string): boolean {
  let ip = address.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (ip.startsWith("::ffff:")) {
    const mapped = ip.slice("::ffff:".length);
    if (isIP(mapped) === 4) ip = mapped;
  }
  if (isIP(ip) === 4) return blockedV4(ip);
  if (isIP(ip) === 6) return blockedV6(ip);
  return true;
}

function blockedV4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function blockedV6(ip: string): boolean {
  if (ip === "::" || ip === "::1") return true;
  const head = ip.split("::")[0] ?? "";
  const first = head.split(":")[0] ?? "";
  if (first === "fe80" || first === "fe8" || first === "fe9" || first === "fea" || first === "feb") {
    return true;
  }
  if (/^fe[89ab]/i.test(first)) return true;
  if (first.startsWith("fc") || first.startsWith("fd")) return true;
  if (ip.startsWith("2001:db8")) return true;
  return false;
}

export function endpointUrl(base: URL, path: string): string {
  const url = new URL(base.toString());
  const prefix = url.pathname.replace(/\/$/, "");
  url.pathname = `${prefix}${path.startsWith("/") ? path : `/${path}`}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
