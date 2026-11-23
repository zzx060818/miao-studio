import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listCalls, recordCall } from "./call-log";

const previous = process.env.MIAO_DATA_DIR;

afterEach(() => {
  if (previous === undefined) delete process.env.MIAO_DATA_DIR;
  else process.env.MIAO_DATA_DIR = previous;
});

describe("call log", () => {
  it("keeps the newest calls and strips a key pasted into the prompt", async () => {
    process.env.MIAO_DATA_DIR = await mkdtemp(join(tmpdir(), "miao-calls-"));
    await recordCall({
      userId: "11111111-1111-1111-1111-111111111111",
      username: "painter",
      displayName: "画画的",
      role: "artist",
      prompt: "猫 sk-secretkeyvalue",
      model: "gpt-image-1",
      aspect: "1:1",
      count: 1,
      ok: false,
      status: 503,
      error: "尚未配置生图服务",
    });
    await recordCall({
      userId: "22222222-2222-2222-2222-222222222222",
      username: "miaoadmin",
      displayName: "喵管",
      role: "admin",
      prompt: "火车",
      model: "gpt-image-1",
      aspect: "4:3",
      count: 2,
      ok: true,
      status: 200,
      error: "",
    });
    const calls = await listCalls();
    expect(calls.map((call) => call.displayName)).toEqual(["喵管", "画画的"]);
    expect(calls[1]?.prompt).toBe("猫 [redacted]");
    expect(calls[1]?.prompt.includes("secret")).toBe(false);
  });
});