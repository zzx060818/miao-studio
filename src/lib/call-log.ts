import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CallRecord } from "./call-record";
import { dataDir } from "./data-dir";
import { isRole } from "./roles";

export type { CallRecord };

const MAX_CALLS = 400;

let chain: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function filePath(): string {
  return join(dataDir(), "calls.json");
}

function redact(text: string, max: number): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]{6,}/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isCall(value: unknown): value is CallRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CallRecord>;
  return (
    typeof row.id === "string" &&
    typeof row.createdAt === "number" &&
    typeof row.userId === "string" &&
    typeof row.username === "string" &&
    typeof row.displayName === "string" &&
    isRole(row.role) &&
    typeof row.prompt === "string" &&
    typeof row.model === "string" &&
    typeof row.aspect === "string" &&
    (row.count === null || typeof row.count === "number") &&
    typeof row.ok === "boolean" &&
    typeof row.status === "number" &&
    typeof row.error === "string"
  );
}

async function readCalls(): Promise<CallRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(filePath(), "utf8")) as { calls?: unknown };
    if (!Array.isArray(parsed.calls)) return [];
    return parsed.calls.filter(isCall);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
}

async function writeCalls(calls: CallRecord[]): Promise<void> {
  const file = filePath();
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ calls }), { mode: 0o600 });
  await rename(tmp, file);
}

export function recordCall(input: Omit<CallRecord, "id" | "createdAt">): Promise<void> {
  return locked(async () => {
    const calls = await readCalls();
    calls.push({
      id: randomUUID(),
      createdAt: Date.now(),
      userId: input.userId,
      username: input.username.slice(0, 40),
      displayName: input.displayName.slice(0, 40),
      role: input.role,
      prompt: redact(input.prompt, 500),
      model: redact(input.model, 120),
      aspect: input.aspect.slice(0, 16),
      count: input.count,
      ok: input.ok,
      status: input.status,
      error: redact(input.error, 300),
    });
    const kept = calls.length > MAX_CALLS ? calls.slice(calls.length - MAX_CALLS) : calls;
    await writeCalls(kept);
  });
}

export async function listCalls(): Promise<CallRecord[]> {
  const calls = await readCalls();
  return calls.slice().sort((a, b) => b.createdAt - a.createdAt);
}
