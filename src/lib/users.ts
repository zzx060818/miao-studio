import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { dataDir } from "./data-dir";
import { burnPasswordCheck, hashPassword, validatePassword, verifyPassword } from "./passwords";
import { type PublicUser, type Role, isRole } from "./roles";

type StoredUser = PublicUser & {
  disabled: boolean;
  passwordSalt: string;
  passwordHash: string;
  createdAt: number;
};

export type UserPatch = {
  role?: Role;
  disabled?: boolean;
  displayName?: string;
  password?: string;
};

type Store = { users: StoredUser[] };

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
  return join(dataDir(), "users.json");
}

function isStoredUser(value: unknown): value is StoredUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<StoredUser>;
  return (
    typeof user.id === "string" &&
    typeof user.username === "string" &&
    typeof user.displayName === "string" &&
    isRole(user.role) &&
    typeof user.disabled === "boolean" &&
    typeof user.passwordSalt === "string" &&
    typeof user.passwordHash === "string" &&
    typeof user.createdAt === "number"
  );
}

async function readStore(): Promise<Store> {
  let text: string;
  try {
    text = await readFile(filePath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { users: [] };
    throw new Error("成员名单暂时读不出来");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("成员名单损坏，没有改动");
  }
  const users = parsed && typeof parsed === "object" ? (parsed as { users?: unknown }).users : null;
  if (!Array.isArray(users) || users.some((item) => !isStoredUser(item))) {
    throw new Error("成员名单损坏，没有改动");
  }
  return { users };
}

async function writeStore(store: Store): Promise<void> {
  const file = filePath();
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(store), { mode: 0o600 });
  await rename(tmp, file);
}

export function validateUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const username = raw.trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_.-]{1,23}$/u.test(username)) return null;
  return username;
}

export function validateDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  const length = [...name].length;
  if (length < 1 || length > 24) return null;
  if (/[\u0000-\u001F]/.test(name)) return null;
  return name;
}

function toPublic(user: StoredUser): PublicUser {
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

function sameName(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function keepsAnAdmin(users: StoredUser[], id: string, patch: UserPatch): boolean {
  return users.some((user) => {
    if (user.id !== id) return user.role === "admin" && !user.disabled;
    const role = patch.role ?? user.role;
    const disabled = patch.disabled ?? user.disabled;
    return role === "admin" && !disabled;
  });
}

export async function userCount(): Promise<number> {
  return (await readStore()).users.length;
}

export type ListedUser = PublicUser & { disabled: boolean };

export async function listMemberRows(): Promise<ListedUser[]> {
  const { users } = await readStore();
  return users
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((user) => ({ ...toPublic(user), disabled: user.disabled }));
}

export async function findUser(id: string): Promise<(PublicUser & { disabled: boolean }) | null> {
  const user = (await readStore()).users.find((item) => item.id === id);
  return user ? { ...toPublic(user), disabled: user.disabled } : null;
}

async function insertUnlocked(input: {
  username: string;
  displayName: string;
  password: string;
  role: Role;
}): Promise<{ ok: true; user: PublicUser } | { ok: false; error: string }> {
  const username = validateUsername(input.username);
  const displayName = validateDisplayName(input.displayName);
  const password = validatePassword(input.password);
  if (!username) return { ok: false, error: "账号用 2 到 24 位字母、数字、下划线或中文，开头不要符号" };
  if (!displayName) return { ok: false, error: "显示名用 1 到 24 个字" };
  if (!password) return { ok: false, error: "密码至少 8 位，最长 72 位" };
  if (!isRole(input.role)) return { ok: false, error: "角色无法识别" };
  const store = await readStore();
  if (store.users.some((user) => sameName(user.username, username))) {
    return { ok: false, error: "这个账号已经有人用了" };
  }
  const hashed = await hashPassword(password);
  const user: StoredUser = {
    id: randomUUID(),
    username,
    displayName,
    role: input.role,
    disabled: false,
    passwordSalt: hashed.salt,
    passwordHash: hashed.hash,
    createdAt: Date.now(),
  };
  store.users.push(user);
  await writeStore(store);
  return { ok: true, user: toPublic(user) };
}

export function createFirstAdmin(input: { username: string; displayName: string; password: string }) {
  return locked(async () => {
    if ((await readStore()).users.length > 0) return { ok: false as const, error: "管理员已经创建过了" };
    return insertUnlocked({ ...input, role: "admin" });
  });
}

export function createMember(input: { username: string; displayName: string; password: string; role: Role }) {
  return locked(() => insertUnlocked(input));
}

export function authenticate(
  usernameRaw: string,
  passwordRaw: string,
): Promise<{ ok: true; user: PublicUser } | { ok: false; error: string }> {
  return locked(async () => {
    const username = usernameRaw.trim();
    const password = typeof passwordRaw === "string" ? passwordRaw : "";
    const user = (await readStore()).users.find((item) => sameName(item.username, username));
    if (!user) {
      await burnPasswordCheck(password);
      return { ok: false, error: "账号或密码不对" };
    }
    const match = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!match) return { ok: false, error: "账号或密码不对" };
    if (user.disabled) return { ok: false, error: "这个账号已停用" };
    return { ok: true, user: toPublic(user) };
  });
}

export function updateMember(
  id: string,
  patch: UserPatch,
): Promise<{ ok: true; user: ListedUser } | { ok: false; error: string }> {
  return locked(async () => {
    const store = await readStore();
    const current = store.users.find((user) => user.id === id);
    if (!current) return { ok: false, error: "没有这个成员" };
    const displayName = patch.displayName === undefined ? current.displayName : validateDisplayName(patch.displayName);
    if (!displayName) return { ok: false, error: "显示名用 1 到 24 个字" };
    if (patch.role !== undefined && !isRole(patch.role)) return { ok: false, error: "角色无法识别" };
    const password = patch.password === undefined ? null : validatePassword(patch.password);
    if (patch.password !== undefined && !password) return { ok: false, error: "密码至少 8 位，最长 72 位" };
    if (!keepsAnAdmin(store.users, id, patch)) {
      return { ok: false, error: "至少要留一位可用的管理员" };
    }
    current.displayName = displayName;
    if (patch.role !== undefined) current.role = patch.role;
    if (patch.disabled !== undefined) current.disabled = patch.disabled;
    if (password) {
      const hashed = await hashPassword(password);
      current.passwordSalt = hashed.salt;
      current.passwordHash = hashed.hash;
    }
    await writeStore(store);
    return { ok: true, user: { ...toPublic(current), disabled: current.disabled } };
  });
}

export function deleteMember(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return locked(async () => {
    const store = await readStore();
    const current = store.users.find((user) => user.id === id);
    if (!current) return { ok: false, error: "没有这个成员" };
    const next = store.users.filter((user) => user.id !== id);
    if (!next.some((user) => user.role === "admin" && !user.disabled)) {
      return { ok: false, error: "至少要留一位可用的管理员" };
    }
    await writeStore({ users: next });
    return { ok: true };
  });
}

export function changeOwnPassword(
  id: string,
  currentPassword: string,
  nextPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return locked(async () => {
    const store = await readStore();
    const current = store.users.find((user) => user.id === id);
    if (!current || current.disabled) return { ok: false, error: "没有这个成员" };
    const match = await verifyPassword(currentPassword, current.passwordSalt, current.passwordHash);
    if (!match) return { ok: false, error: "当前密码不对" };
    const password = validatePassword(nextPassword);
    if (!password) return { ok: false, error: "新密码至少 8 位，最长 72 位" };
    const hashed = await hashPassword(password);
    current.passwordSalt = hashed.salt;
    current.passwordHash = hashed.hash;
    await writeStore(store);
    return { ok: true };
  });
}
