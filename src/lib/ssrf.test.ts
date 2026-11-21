import { describe, expect, it } from "vitest";
import { assertResolvedAddresses, inspectProviderUrl, isBlockedAddress } from "./ssrf";

describe("inspectProviderUrl", () => {
  it("accepts a public https origin", () => {
    const verdict = inspectProviderUrl("https://api.example.com/v1");
    expect(verdict.ok).toBe(true);
  });

  it.each([
    ["http://api.example.com/v1", "https"],
    ["https://user:pass@api.example.com/v1", "账号"],
    ["https://api.example.com/v1?token=secret", "查询"],
    ["https://localhost/v1", "本地"],
    ["https://printer/v1", "域名"],
    ["https://169.254.169.254/latest", "保留"],
    ["https://127.0.0.1/v1", "保留"],
    ["https://10.1.2.3/v1", "保留"],
    ["https://192.168.0.8/v1", "保留"],
    ["https://[::1]/v1", "保留"],
    ["https://metadata.google.internal/", "本地"],
  ])("rejects %s", (raw, fragment) => {
    const verdict = inspectProviderUrl(raw);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain(fragment);
  });
});

describe("address blocking", () => {
  it("blocks loopback, link-local, private, and mapped ipv6", () => {
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
    expect(isBlockedAddress("1.1.1.1")).toBe(false);
    expect(isBlockedAddress("127.0.0.1")).toBe(true);
    expect(isBlockedAddress("169.254.169.254")).toBe(true);
    expect(isBlockedAddress("10.0.0.1")).toBe(true);
    expect(isBlockedAddress("172.16.0.1")).toBe(true);
    expect(isBlockedAddress("192.168.1.1")).toBe(true);
    expect(isBlockedAddress("::1")).toBe(true);
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("fe80::1")).toBe(true);
    expect(isBlockedAddress("fd00::1")).toBe(true);
  });

  it("rejects a public name that resolves privately", () => {
    expect(assertResolvedAddresses(["8.8.8.8"])).toBeNull();
    expect(assertResolvedAddresses(["127.0.0.1"])).toMatch(/内网|保留/);
    expect(assertResolvedAddresses([])).toMatch(/没有解析/);
  });
});
