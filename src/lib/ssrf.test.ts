import { describe, expect, it } from "vitest";
import { assertImageSource, assertProviderAddresses, assertResolvedAddresses, inspectProviderUrl, isBlockedAddress } from "./ssrf";

describe("inspectProviderUrl", () => {
  it("accepts a public https origin", () => {
    const verdict = inspectProviderUrl("https://api.example.com/v1");
    expect(verdict.ok).toBe(true);
  });

  it.each([
    ["https://127.0.0.1/v1"],
    ["https://10.1.2.3/v1"],
    ["https://192.168.0.8:8080/v1"],
    ["https://localhost/v1"],
    ["http://192.168.1.8:8000/v1"],
    ["http://192.168.2.18/"],
    ["http://192.168.2.18"],
    ["http://127.0.0.1:7860/v1"],
  ])("accepts a local provider %s", (raw) => {
    expect(inspectProviderUrl(raw).ok).toBe(true);
  });

  it.each([
    ["http://api.example.com/v1", "https"],
    ["https://user:pass@api.example.com/v1", "账号"],
    ["https://api.example.com/v1?token=secret", "查询"],
    ["https://printer/v1", "域名"],
    ["https://169.254.169.254/latest", "元数据"],
    ["http://169.254.169.254/latest", "元数据"],
    ["https://metadata.google.internal/", "元数据"],
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

  it("downloads a result image from the same LAN address and still refuses a public name that points inward", () => {
    expect(assertImageSource("192.168.2.18", ["192.168.2.18"])).toBeNull();
    expect(assertImageSource("localhost", ["127.0.0.1"])).toBeNull();
    expect(assertImageSource("api.example.com", ["192.168.2.18"])).toMatch(/内网|保留/);
    expect(assertImageSource("192.168.2.18", ["169.254.169.254"])).toMatch(/元数据|链路/);
  });

  it("allows a configured provider on a private network and still blocks metadata", () => {
    expect(assertProviderAddresses(["10.0.0.8"])).toBeNull();
    expect(assertProviderAddresses(["192.168.1.8"])).toBeNull();
    expect(assertProviderAddresses(["127.0.0.1"])).toBeNull();
    expect(assertProviderAddresses(["169.254.169.254"])).toMatch(/元数据|链路/);
    expect(assertProviderAddresses([])).toMatch(/没有解析/);
  });
});
