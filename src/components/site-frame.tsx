"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { roleLabel } from "@/lib/roles";
import { AuthProvider, useAuth } from "./auth-provider";
import { CatMark } from "./cat-mark";

const LINKS = [
  { href: "/", label: "创作台" },
  { href: "/gallery", label: "作品集" },
  { href: "/prompts", label: "提示词" },
];

export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Frame>{children}</Frame>
    </AuthProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const links =
    user?.role === "admin" ? [...LINKS, { href: "/members", label: "成员" }, { href: "/calls", label: "调用记录" }] : LINKS;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
    router.replace("/login");
  }

  return (
    <div className="desk">
      <a className="skip" href="#content">
        跳到内容
      </a>
      <div className="wrap">
        <header className="topbar">
          <Link className="brand" href={user ? "/" : "/login"} aria-label="喵绘，回到创作台">
            <span className="wordmark">MIAO.</span>
            <span className="brand-lockup">
              <CatMark className="cat" />
              <span className="brand-copy">
                <span className="brand-name">喵绘</span>
                <span className="brand-tag">把想象，留在纸上。</span>
              </span>
            </span>
          </Link>
          {user ? (
            <nav aria-label="主导航">
              {links.map((item) => {
                const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? "nav-link active" : "nav-link"}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <span className="who">
                <span className="who-name">{user.displayName}</span>
                <span className="role-pill">{roleLabel(user.role)}</span>
              </span>
              <Link href="/account" className={path.startsWith("/account") ? "nav-link active" : "nav-link"}>
                账号
              </Link>
              <button type="button" className="nav-link" onClick={() => void logout()}>
                退出
              </button>
            </nav>
          ) : null}
        </header>
        <div id="content">{children}</div>
      </div>
    </div>
  );
}
