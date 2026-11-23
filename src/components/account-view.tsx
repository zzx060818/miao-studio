"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";
import { roleLabel } from "@/lib/roles";

export function AccountView() {
  const { user, refresh } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!user) return null;

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        currentPassword,
        nextPassword,
      }),
    });
    const json = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || json.ok === false) {
      setError(json.error || "没能保存");
      return;
    }
    setCurrentPassword("");
    setNextPassword("");
    setNotice(nextPassword ? "显示名和密码已更新" : "显示名已更新");
    await refresh();
  }

  return (
    <section className="library">
    <form className="setup-card auth-sheet" onSubmit={(event) => void save(event)}>
      <h1>账号</h1>
      <p>
        {user.username} · {roleLabel(user.role)}
      </p>
      <label>
        显示名
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
      </label>
      <label>
        当前密码
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          required={nextPassword.length > 0}
        />
      </label>
      <label>
        新密码
        <input
          type="password"
          value={nextPassword}
          onChange={(event) => setNextPassword(event.target.value)}
          autoComplete="new-password"
          placeholder="留空则不改密码"
        />
      </label>
      {error ? (
        <div className="alert bad" role="alert">
          <strong>{error}</strong>
        </div>
      ) : null}
      {notice ? (
        <div className="alert" role="status">
          <strong>{notice}</strong>
        </div>
      ) : null}
      <button type="submit" className="setup-save">
        保存
      </button>
    </form>
    </section>
  );
}
