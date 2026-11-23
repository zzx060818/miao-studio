import type { Role } from "./roles";

export type CallRecord = {
  id: string;
  createdAt: number;
  userId: string;
  username: string;
  displayName: string;
  role: Role;
  prompt: string;
  model: string;
  aspect: string;
  count: number | null;
  ok: boolean;
  status: number;
  error: string;
};
