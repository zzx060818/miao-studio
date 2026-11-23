import { describe, expect, it, vi } from "vitest";
import { handleGenerate, publicStatus, sanitizeProviderMessage, type EnvLike } from "./provider";
import type { Buckets } from "./rate-limit";

const SECRET = "sk-test-secret-value";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const WEBP = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";

const valid = {
  prompt: "海边的旧铁路",
  aspect: "4:3",
  count: 1,
  styles: ["pixel"],
};

function buckets(): Buckets {
  return { ip: new Map(), global: new Map() };
}

function configured(extra: EnvLike = {}): EnvLike {
  return {
    IMAGE_API_BASE_URL: "https://api.example.com/v1",
    IMAGE_API_KEY: SECRET,
    IMAGE_API_MODEL: "gpt-image-1",
    ...extra,
  };
}

describe("provider state", () => {
  it("stays unconfigured until base, key, and model are all set", async () => {
    const fetchImpl = vi.fn();
    const result = await handleGenerate(valid, {
      env: { IMAGE_API_KEY: SECRET },
      buckets: buckets(),
      fetchImpl,
      lookup: async () => ["8.8.8.8"],
    });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("尚未配置生图服务");
    expect(JSON.stringify(result.body)).not.toContain(SECRET);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("validates an empty prompt before reporting that the service is missing", async () => {
    const result = await handleGenerate(
      { ...valid, prompt: "" },
      { env: {}, buckets: buckets(), fetchImpl: vi.fn() },
    );
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/写下/);
  });

  it("does not put the api key in the public status", () => {
    const status = publicStatus(configured());
    expect(status.configured).toBe(true);
    expect(status.model).toBe("gpt-image-1");
    expect(JSON.stringify(status)).not.toContain(SECRET);
    const missing = publicStatus({});
    expect(missing.configured).toBe(false);
    expect(missing.message).toBe("尚未配置生图服务");
  });

  it("reports reference support for Flare and shares explicit capability overrides", () => {
    const status = publicStatus(configured({ IMAGE_API_MODEL: "gpt-image-2.6-flare", IMAGE_API_CAPABILITIES: "reference" }));
    expect(status.capabilities).toMatchObject({ reference: true, referenceMimes: ["image/png", "image/jpeg", "image/webp"] });
    expect(status.extras).toEqual(["reference"]);
    expect(JSON.stringify(status)).not.toContain(SECRET);
  });
});

describe("reference image forwarding", () => {
  it.each([
    ["image/png", PNG, "png"],
    ["image/webp", WEBP, "webp"],
  ])("sends a %s reference to the selected Flare model", async (mime, data, extension) => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.example.com/v1/images/edits");
      const form = init?.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(form.get("model")).toBe("gpt-image-2.6-flare");
      expect(form.get("prompt")).toContain(valid.prompt);
      expect(form.get("size")).toBe("1536x1024");
      expect(form.get("n")).toBe("1");
      const image = form.get("image") as File;
      expect(image.type).toBe(mime);
      expect(image.name).toBe(`ref-0.${extension}`);
      expect(Buffer.from(await image.arrayBuffer())).toEqual(Buffer.from(data, "base64"));
      expect(new Headers(init?.headers).has("content-type")).toBe(false);
      return Response.json({ data: [{ b64_json: PNG }] });
    });
    const result = await handleGenerate(
      { ...valid, model: "gpt-image-2.6-flare", references: [{ mime, data }] },
      { env: configured(), buckets: buckets(), fetchImpl, lookup: async () => ["8.8.8.8"] },
    );
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    "gpt-image-2",
    "gpt-image-2.5",
    "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst",
    "gpt-image-2.6",
    "gpt-image-2.6-flare",
    "gpt-image-2.6-sunburst",
  ])("forwards a reference when the page selects %s", async (model) => {
    const status = publicStatus(configured({ IMAGE_API_MODEL: model }));
    expect(status.capabilities).toMatchObject({ reference: true });
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.example.com/v1/images/edits");
      const form = init?.body as FormData;
      expect(form.get("model")).toBe(model);
      const image = form.get("image") as File;
      expect(Buffer.from(await image.arrayBuffer())).toEqual(Buffer.from(PNG, "base64"));
      return Response.json({ data: [{ b64_json: PNG }] });
    });
    const result = await handleGenerate(
      { ...valid, model, references: [{ mime: "image/png", data: PNG }] },
      { env: configured(), buckets: buckets(), fetchImpl, lookup: async () => ["8.8.8.8"] },
    );
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends every reference in order using the multipart array field", async () => {
    const references = [{ mime: "image/png", data: PNG }, { mime: "image/webp", data: WEBP }];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("/images/edits");
      const form = init?.body as FormData;
      expect(form.has("image")).toBe(false);
      const images = form.getAll("image[]") as File[];
      expect(images).toHaveLength(2);
      for (const [index, image] of images.entries()) {
        expect(image.type).toBe(references[index].mime);
        expect(Buffer.from(await image.arrayBuffer())).toEqual(Buffer.from(references[index].data, "base64"));
      }
      return Response.json({ data: [{ b64_json: PNG }] });
    });
    const result = await handleGenerate(
      { ...valid, model: "gpt-image-2.6-flare", references },
      { env: configured(), buckets: buckets(), fetchImpl, lookup: async () => ["8.8.8.8"] },
    );
    expect(result.status).toBe(200);
  });

  it.each(["dall-e-3", "unknown-model"])("rejects references for %s instead of generating without them", async (model) => {
    const fetchImpl = vi.fn();
    const result = await handleGenerate(
      { ...valid, model, references: [{ mime: "image/png", data: PNG }] },
      { env: configured(), buckets: buckets(), fetchImpl },
    );
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("当前模型不支持参考图");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("provider safety", () => {
  it("does not call a private or redirected endpoint", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1" } }));
    const blocked = await handleGenerate(valid, {
      env: configured({ IMAGE_API_BASE_URL: "https://169.254.169.254/latest" }),
      buckets: buckets(),
      fetchImpl,
    });
    expect(blocked.status).toBe(500);
    expect(fetchImpl).not.toHaveBeenCalled();

    const metadata = await handleGenerate(valid, {
      env: configured(),
      buckets: buckets(),
      fetchImpl,
      lookup: async () => ["169.254.169.254"],
    });
    expect(metadata.status).toBe(500);
    expect(metadata.body.code).toBe("ssrf");
    expect(fetchImpl).not.toHaveBeenCalled();

    const lan = await handleGenerate(valid, {
      env: configured(),
      buckets: buckets(),
      fetchImpl,
      lookup: async () => ["10.0.0.8"],
    });
    expect(lan.status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    fetchImpl.mockClear();
    const redirect = await handleGenerate(valid, {
      env: configured(),
      buckets: buckets(),
      fetchImpl,
      lookup: async () => ["8.8.8.8"],
    });
    expect(redirect.status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported negative prompts without calling the provider", async () => {
    const fetchImpl = vi.fn();
    const result = await handleGenerate(
      { ...valid, negativePrompt: "模糊" },
      { env: configured(), buckets: buckets(), fetchImpl, lookup: async () => ["8.8.8.8"] },
    );
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("unsupported");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the model and count chosen on the page", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model?: string; n?: number };
      expect(body.model).toBe("vendor/flux");
      expect(body.n).toBe(3);
      return Response.json({ data: [{ b64_json: PNG }] });
    });
    const result = await handleGenerate(
      { ...valid, model: "vendor/flux", count: 3 },
      { env: configured(), buckets: buckets(), fetchImpl, lookup: async () => ["8.8.8.8"] },
    );
    expect(result.status).toBe(200);
    expect(result.body.model).toBe("vendor/flux");
  });

  it("sends a generation request without leaking the key back to the browser", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(`Bearer ${SECRET}`);
      const body = JSON.parse(String(init?.body)) as { prompt: string; response_format?: string };
      expect(body.prompt).toContain("风格：像素插画");
      expect(body.response_format).toBeUndefined();
      return Response.json({ data: [{ b64_json: PNG }] });
    });
    const result = await handleGenerate(valid, {
      env: configured(),
      buckets: buckets(),
      fetchImpl,
      lookup: async () => ["8.8.8.8"],
    });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(JSON.stringify(result.body)).not.toContain(SECRET);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("https://api.example.com/v1/images/generations");
  });

  it("downloads a signed image url and follows one public redirect", async () => {
    const png = Buffer.from(PNG, "base64");
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes("/images/generations")) {
        return Response.json({ data: [{ url: "https://cdn.example.com/a.png?sig=secret" }] });
      }
      if (href.includes("sig=secret")) {
        return new Response(null, { status: 302, headers: { location: "https://cdn.example.com/final.png" } });
      }
      return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
    });
    const result = await handleGenerate(valid, {
      env: configured(),
      buckets: buckets(),
      fetchImpl,
      lookup: async () => ["8.8.8.8"],
    });
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result.body)).not.toContain("sig=secret");
  });

  it("downloads a returned image url without sending the api key", async () => {
    const png = Buffer.from(PNG, "base64");
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/images/generations")) {
        return Response.json({ data: [{ url: "https://cdn.example.com/a.png" }] });
      }
      expect(new Headers(init?.headers).get("authorization")).toBeNull();
      return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
    });
    const result = await handleGenerate(valid, {
      env: configured(),
      buckets: buckets(),
      fetchImpl,
      lookup: async () => ["8.8.8.8"],
    });
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("redacts secrets from provider errors and rate limits repeated calls", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: `bad ${SECRET}` } }, { status: 401 }));
    const result = await handleGenerate(valid, {
      env: configured(),
      buckets: buckets(),
      fetchImpl,
      lookup: async () => ["8.8.8.8"],
    });
    expect(result.status).toBe(502);
    expect(String(result.body.detail)).not.toContain(SECRET);
    expect(sanitizeProviderMessage(`see ${SECRET}`)).toContain("[redacted]");

    const shared = buckets();
    let last = 0;
    for (let index = 0; index < 9; index += 1) {
      const response = await handleGenerate(valid, { env: {}, ip: "203.0.113.8", buckets: shared });
      last = response.status;
    }
    expect(last).toBe(429);
  });

  it("explains a refused connection to a LAN image service", async () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 192.168.2.18:80"), { code: "ECONNREFUSED" });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause });
    });
    const result = await handleGenerate(valid, {
      env: { ...configured(), IMAGE_API_BASE_URL: "http://192.168.2.18/v1" },
      buckets: buckets(),
      fetchImpl,
      lookup: async () => ["192.168.2.18"],
    });
    expect(result.status).toBe(502);
    expect(result.body.detail).toMatch(/192\.168\.2\.18/);
    expect(result.body.detail).toMatch(/端口/);
    expect(JSON.stringify(result.body)).not.toContain(SECRET);
  });

  it("reports a slow image service as a timeout", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const result = await handleGenerate(valid, {
      env: configured(),
      buckets: buckets(),
      fetchImpl,
      lookup: async () => ["8.8.8.8"],
    });
    expect(result.status).toBe(504);
    expect(result.body.error).toMatch(/超时/);
  });
});
