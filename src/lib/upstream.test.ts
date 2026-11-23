import { describe, expect, it, vi } from "vitest";
import { fetchUpstream, preferLoopbackUrl, rememberOwnAddresses, upstreamFailureMessage } from "./upstream";

describe("loopback preference", () => {
  it("calls this machine through 127.0.0.1 and leaves other hosts alone", async () => {
    rememberOwnAddresses(["192.168.2.18"]);
    expect(preferLoopbackUrl("http://192.168.2.18:8000/v1/models")).toBe("http://127.0.0.1:8000/v1/models");
    expect(preferLoopbackUrl("http://127.0.0.1:8000/v1/models")).toBe("http://127.0.0.1:8000/v1/models");
    expect(preferLoopbackUrl("https://api.example.com/v1/models")).toBe("https://api.example.com/v1/models");

    const fetchImpl = vi.fn(async (url: string | URL | Request) => Response.json({ url: String(url) }));
    const response = await fetchUpstream("http://192.168.2.18:8000/v1/models", { method: "GET" }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("http://127.0.0.1:8000/v1/models");
    expect(response.ok).toBe(true);
    rememberOwnAddresses(null);
  });

  it("falls back to the LAN address when loopback refuses the connection", async () => {
    rememberOwnAddresses(["192.168.2.18"]);
    const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8000"), { code: "ECONNREFUSED" });
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("127.0.0.1")) throw new TypeError("fetch failed", { cause });
      return Response.json({ ok: true });
    });
    const response = await fetchUpstream("http://192.168.2.18:8000/v1/models", { method: "GET" }, fetchImpl);
    expect(response.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    rememberOwnAddresses(null);
  });

  it("names a connect timeout", () => {
    const cause = Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" });
    expect(upstreamFailureMessage(new TypeError("fetch failed", { cause }), "http://192.168.2.18/v1/models")).toMatch(/超时/);
    expect(upstreamFailureMessage(new TypeError("fetch failed", { cause }), "http://192.168.2.18/v1/models")).toMatch(/127\.0\.0\.1/);
  });
});
