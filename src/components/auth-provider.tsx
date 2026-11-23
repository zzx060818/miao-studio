"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { bindDraftOwner } from "@/lib/draft";
import type { PublicUser } from "@/lib/roles";

type AuthValue = {
  user: PublicUser | null;
  needsSetup: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("登录状态还没准备好");
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [boundFor, setBoundFor] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const json = (await response.json()) as { user?: PublicUser | null; needsSetup?: boolean };
      setUser(json.user ?? null);
      setNeedsSetup(json.needsSetup === true);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) {
      setBoundFor("");
      return;
    }
    bindDraftOwner(user.id);
    setBoundFor(user.id);
  }, [user]);

  const loginPage = path === "/login";
  const guestOk = loginPage || path === "/marks";
  const ready = !user || boundFor === user.id;

  useEffect(() => {
    if (loading || !ready) return;
    if (!user && !guestOk) router.replace("/login");
    if (user && loginPage) router.replace("/");
  }, [loading, ready, user, guestOk, loginPage, router]);

  let body: ReactNode = children;
  if (loading || !ready) {
    body = <p className="sample-line">正在确认是谁在用这台创作台…</p>;
  } else if (!user && !guestOk) {
    body = <p className="sample-line">正在去登录…</p>;
  } else if (user && loginPage) {
    body = <p className="sample-line">已经登录，正在回到创作台…</p>;
  }

  return (
    <AuthContext.Provider value={{ user, needsSetup, loading, refresh }}>
      <div key={user?.id ?? "signed-out"}>{body}</div>
    </AuthContext.Provider>
  );
}
