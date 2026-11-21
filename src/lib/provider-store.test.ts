import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearSavedProvider,
  envLocksProvider,
  listProviderModels,
  mergeProviderEnv,
  parseProviderSetup,
  readSavedProvider,
  setupHostAllowed,
  writeSavedProvider,
} from "./provider-store";

const SECRET = "sk-test-secret-value";

describe("provider setup", () => {
  it("accepts a public https endpoint and keeps the key out of status text", () => {
    const setup = parseProviderSetup({
      baseUrl: "https://api.openai.com/v1",
      apiKey: SECRET,
      model: "gpt-image-1",
    });
    expect(setup.ok).toBe(true);
    if (!setup.ok) return;
    expect(setup.value.baseUrl).toBe("https://api.openai.com/v1");
    expect(setupHostAllowed("127.0.0.1:43123")).toBe(true);
    expect(setupHostAllowed("localhost:43123")).toBe(true);
    expect(setupHostAllowed("192.168.1.8:43123")).toBe(true);
    expect(setupHostAllowed("miao.example.com")).toBe(false);
    expect(setupHostAllowed("8.8.8.8:43123")).toBe(false);
  });

  it("rejects missing, local, and malformed settings", () => {
    expect(parseProviderSetup({ baseUrl: "http://api.openai.com/v1", apiKey: SECRET, model: "gpt-image-1" }).ok).toBe(false);
    expect(parseProviderSetup({ baseUrl: "https://169.254.169.254/latest", apiKey: SECRET, model: "gpt-image-1" }).ok).toBe(false);
    expect(parseProviderSetup({ baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-image-1" }).ok).toBe(false);
    expect(parseProviderSetup({ baseUrl: "https://api.openai.com/v1", apiKey: "short", model: "gpt-image-1" }).ok).toBe(false);
    expect(parseProviderSetup({ baseUrl: "https://api.openai.com/v1", apiKey: `${SECRET} tail`, model: "gpt-image-1" }).ok).toBe(false);
    expect(parseProviderSetup({ baseUrl: "https://api.openai.com/v1", apiKey: SECRET, model: "模型" }).ok).toBe(false);
    expect(parseProviderSetup({ baseUrl: "https://10.0.0.8:8000/v1", apiKey: SECRET, model: "vendor/flux" }).ok).toBe(true);
  });

  it("lets a complete environment win over the page file", () => {
    const saved = { baseUrl: "https://api.openai.com/v1", apiKey: SECRET, model: "gpt-image-1" };
    expect(envLocksProvider({ IMAGE_API_BASE_URL: "https://api.example.com/v1", IMAGE_API_KEY: "env-key-value", IMAGE_API_MODEL: "dall-e-3" })).toBe(true);
    const merged = mergeProviderEnv(
      { IMAGE_API_BASE_URL: "https://api.example.com/v1", IMAGE_API_KEY: "env-key-value", IMAGE_API_MODEL: "dall-e-3" },
      saved,
    );
    expect(merged.IMAGE_API_MODEL).toBe("dall-e-3");
    expect(merged.IMAGE_API_KEY).toBe("env-key-value");
    const filled = mergeProviderEnv({}, saved);
    expect(filled.IMAGE_API_KEY).toBe(SECRET);
    expect(filled.IMAGE_API_MODEL).toBe("gpt-image-1");
  });

  it("writes the key to disk and does not require it to come back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "miao-provider-"));
    const file = join(dir, "provider.json");
    const value = { baseUrl: "https://api.openai.com/v1", apiKey: SECRET, model: "dall-e-2" };
    await writeSavedProvider(value, file);
    const mode = (await stat(file)).mode & 0o777;
    expect(mode).toBe(0o600);
    const stored = JSON.parse(await readFile(file, "utf8")) as { apiKey: string };
    expect(stored.apiKey).toBe(SECRET);
    expect(await readSavedProvider(file)).toEqual(value);
    await clearSavedProvider(file);
    expect(await readSavedProvider(file)).toBeNull();
  });

  it("reads model ids from an OpenAI-compatible list and does not return the key", async () => {
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${SECRET}`);
      return Response.json({ data: [{ id: "gpt-image-1" }, { id: "vendor/flux" }, { id: "跳过" }] });
    };
    const listed = await listProviderModels(
      { baseUrl: "https://api.example.com/v1", apiKey: SECRET },
      { fetchImpl, lookup: async () => ["10.1.2.3"] },
    );
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.models).toEqual(["gpt-image-1", "vendor/flux"]);
    expect(JSON.stringify(listed)).not.toContain(SECRET);
  });
});
