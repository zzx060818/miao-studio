import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { issueSession, readSession } from "./session";
import { authenticate, createFirstAdmin, createMember, deleteMember, updateMember } from "./users";

const previous = process.env.MIAO_DATA_DIR;

afterEach(() => {
  if (previous === undefined) delete process.env.MIAO_DATA_DIR;
  else process.env.MIAO_DATA_DIR = previous;
});

async function freshDir(): Promise<void> {
  process.env.MIAO_DATA_DIR = await mkdtemp(join(tmpdir(), "miao-auth-"));
}

describe("sessions", () => {
  it("rejects a tampered or expired cookie", () => {
    const token = issueSession("user-1", "secret", 1_000);
    expect(readSession(token, "secret", 1_000)?.sub).toBe("user-1");
    expect(readSession(`${token}x`, "secret", 1_000)).toBeNull();
    expect(readSession(token, "other-secret", 1_000)).toBeNull();
    expect(readSession(token, "secret", 1_000 + 15 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});

describe("members", () => {
  it("creates an admin, then keeps the last admin", async () => {
    await freshDir();
    const admin = await createFirstAdmin({ username: "喵管", displayName: "管理员", password: "password-1" });
    expect(admin.ok).toBe(true);
    if (!admin.ok) return;
    const again = await createFirstAdmin({ username: "other", displayName: "另一个", password: "password-1" });
    expect(again.ok).toBe(false);

    const artist = await createMember({ username: "painter", displayName: "画画的", password: "password-2", role: "artist" });
    expect(artist.ok).toBe(true);
    if (!artist.ok) return;

    const signedIn = await authenticate("Painter", "password-2");
    expect(signedIn.ok).toBe(true);
    if (signedIn.ok) expect(signedIn.user.role).toBe("artist");
    expect((await authenticate("painter", "nope-nope")).ok).toBe(false);

    const demote = await updateMember(admin.user.id, { role: "viewer" });
    expect(demote.ok).toBe(false);
    const removed = await deleteMember(admin.user.id);
    expect(removed.ok).toBe(false);

    const stopped = await updateMember(artist.user.id, { disabled: true });
    expect(stopped.ok).toBe(true);
    const lockedOut = await authenticate("painter", "password-2");
    expect(lockedOut.ok).toBe(false);
    if (!lockedOut.ok) expect(lockedOut.error).toMatch(/停用/);
  });
});
