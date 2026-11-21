"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CatMark } from "./cat-mark";

const LINKS = [
  { href: "/", label: "创作台" },
  { href: "/gallery", label: "作品集" },
  { href: "/prompts", label: "提示词" },
];

export function SiteFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="desk">
      <a className="skip" href="#content">
        跳到内容
      </a>
      <div className="wrap">
        <header className="topbar">
          <Link className="brand" href="/" aria-label="喵绘，回到创作台">
            <span className="wordmark">MIAO.</span>
            <span className="brand-lockup">
              <CatMark className="cat" />
              <span className="brand-copy">
                <span className="brand-name">喵绘</span>
                <span className="brand-tag">把想象，留在纸上。</span>
              </span>
            </span>
          </Link>
          <nav aria-label="主导航">
            {LINKS.map((item) => {
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
          </nav>
        </header>
        <div id="content">{children}</div>
      </div>
    </div>
  );
}
