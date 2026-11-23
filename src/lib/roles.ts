export const ROLES = ["admin", "artist", "viewer"] as const;

export type Role = (typeof ROLES)[number];

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
};

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "artist" || value === "viewer";
}

export function roleLabel(role: Role): string {
  if (role === "admin") return "管理员";
  if (role === "artist") return "创作者";
  return "查看者";
}

export function canGenerate(role: Role): boolean {
  return role === "admin" || role === "artist";
}

export function canManage(role: Role): boolean {
  return role === "admin";
}
