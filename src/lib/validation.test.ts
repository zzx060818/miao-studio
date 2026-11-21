import { describe, expect, it } from "vitest";
import { DALLE2_CAPS, GPT_IMAGE_CAPS } from "./models";
import { sniffImage } from "./sniff";
import { enforceCapabilities, parseGenerateBody, parseJsonLimited } from "./validation";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const WIDE = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4z8AARAAI/gH/xp559wAAAABJRU5ErkJggg==";

const valid = {
  prompt: "海边的旧铁路",
  aspect: "4:3",
  count: 1,
  styles: ["pixel"],
};

describe("parseGenerateBody", () => {
  it("accepts a small valid request", () => {
    const parsed = parseGenerateBody(valid);
    expect(parsed.ok).toBe(true);
  });

  it("requires a prompt before anything else", () => {
    const parsed = parseGenerateBody({ ...valid, prompt: "   " });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/写下/);
  });

  it("rejects a reference whose bytes do not match the declared type", () => {
    const parsed = parseGenerateBody({
      ...valid,
      references: [{ mime: "image/webp", data: PNG }],
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects an oversized json body", () => {
    const parsed = parseJsonLimited("{}", 1);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.status).toBe(413);
  });

  it("sniffs the png fixture", () => {
    const bytes = new Uint8Array(Buffer.from(PNG, "base64"));
    expect(sniffImage(bytes)).toBe("image/png");
  });
});

describe("enforceCapabilities", () => {
  it("hides negative prompts, seeds, and steps for GPT Image", () => {
    const parsed = parseGenerateBody({ ...valid, negativePrompt: "模糊", seed: 1, steps: 20 });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(enforceCapabilities(parsed.value, GPT_IMAGE_CAPS)).toMatch(/排除内容|种子|步数/);
  });

  it("requires a square png reference for DALL·E 2", () => {
    const wide = parseGenerateBody({
      ...valid,
      aspect: "1:1",
      references: [{ mime: "image/png", data: WIDE }],
    });
    if (!wide.ok) throw new Error(wide.error);
    expect(enforceCapabilities(wide.value, DALLE2_CAPS)).toMatch(/正方形/);

    const square = parseGenerateBody({
      ...valid,
      aspect: "1:1",
      references: [{ mime: "image/png", data: PNG }],
    });
    if (!square.ok) throw new Error(square.error);
    expect(enforceCapabilities(square.value, DALLE2_CAPS)).toBeNull();
  });
});
