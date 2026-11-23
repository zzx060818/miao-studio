import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { listLibrary, readWorkImage, saveLibraryPrompt, saveLibraryWork, setLibraryStar } from "./library-store";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const previous = process.env.MIAO_DATA_DIR;

afterEach(() => {
  if (previous === undefined) delete process.env.MIAO_DATA_DIR;
  else process.env.MIAO_DATA_DIR = previous;
});

describe("library store", () => {
  it("keeps one account's picture away from another account", async () => {
    process.env.MIAO_DATA_DIR = await mkdtemp(join(tmpdir(), "miao-library-"));
    const owner = randomUUID();
    const other = randomUUID();
    const saved = await saveLibraryWork(owner, {
      prompt: "一只小猫",
      aspect: "1:1",
      images: [{ mime: "image/png", data: PNG }],
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const listed = await listLibrary(owner);
    expect(listed.works).toHaveLength(1);
    expect(listed.works[0]?.prompt).toBe("一只小猫");
    const image = await readWorkImage(owner, saved.work.id, 0);
    expect(image?.mime).toBe("image/png");
    expect(await readWorkImage(other, saved.work.id, 0)).toBeNull();
    expect((await listLibrary(other)).works).toHaveLength(0);

    const prompt = await saveLibraryPrompt(owner, { text: "窗边的鸢尾", aspect: "4:3", styles: ["still"], title: "鸢尾" });
    expect(prompt.ok && prompt.status).toBe("created");
    const again = await saveLibraryPrompt(owner, { text: "窗边的鸢尾", aspect: "4:3" });
    expect(again.ok && again.status).toBe("exists");
    expect((await setLibraryStar(owner, "missing", true)).ok).toBe(false);
    expect((await setLibraryStar(owner, "art-0", true)).ok).toBe(true);
  });
});