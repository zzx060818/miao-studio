"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";

export function LoginPanel() {
  const { needsSetup, loading, refresh } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (needsSetup && password !== again) {
      setError("两次密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(needsSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(needsSetup ? { displayName, username, password } : { username, password }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || json.ok === false) {
        setError(json.error || "没能登录");
        return;
      }
      await refresh();
    } catch {
      setError("没有连上服务器");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="sample-line">正在确认是谁在用这台创作台…</p>;

  return (
    <section className="library">
      <form className="setup-card auth-sheet" onSubmit={(event) => void submit(event)}>
        <h1>{needsSetup ? "先创建管理员" : "登录喵绘"}</h1>
        <p>
          {needsSetup
            ? "这台创作台还没有成员。第一位是管理员，之后才能添加创作者和查看者。"
            : "管理员配置渠道并管理成员。创作者可以生成。查看者只能看。"}
        </p>
        {needsSetup ? (
          <label>
            显示名
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="nickname" required />
          </label>
        ) : null}
        <label>
          账号
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={needsSetup ? "new-password" : "current-password"}
            required
          />
        </label>
        {needsSetup ? (
          <label>
            再输一次密码
            <input type="password" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" required />
          </label>
        ) : null}
        {error ? (
          <div className="alert bad" role="alert">
            <strong>{error}</strong>
          </div>
        ) : null}
        <button type="submit" className="setup-save" disabled={busy}>
          {busy ? "请稍等" : needsSetup ? "创建并进入" : "登录"}
        </button>
        <p>账号、作品和提示词存在这台服务器上。换一台电脑，用同一个账号还能看到。</p>
      </form>
    </section>
  );
}
