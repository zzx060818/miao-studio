import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const DUMMY_SALT = "miao-missing-user";
const DUMMY_HASH = Buffer.alloc(32, 7).toString("base64url");

export function validatePassword(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length < 8 || raw.length > 72) return null;
  if (raw.trim().length < 8) return null;
  return raw;
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString("base64url");
  const hash = (await scryptAsync(password, salt, 32)) as Buffer;
  return { salt, hash: hash.toString("base64url") };
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const actual = (await scryptAsync(password, salt, 32)) as Buffer;
  const expected = Buffer.from(hash, "base64url");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function burnPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_SALT, DUMMY_HASH);
}
