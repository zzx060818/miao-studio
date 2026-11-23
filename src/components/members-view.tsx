"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";
import { ROLES, roleLabel, type Role } from "@/lib/roles";

type Member = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disabled: boolean;
};

export function MembersView() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("artist");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [nextPassword, setNextPassword] = useState("");

  async function reload() {
    const response = await fetch("/api/users", { cache: "no-store" });
    const json = (await response.json()) as { ok?: boolean; error?: string; users?: Member[] };
    if (!response.ok || !json.users) {
      setError(json.error || "没能读到成员");
      return;
    }
    setMembers(json.users);
    setError("");
  }

  useEffect(() => {
    if (user?.role === "admin") void reload();
  }, [user]);

  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <section className="library">
        <div className="empty-sticky">
          <h2>成员</h2>
          <p>只有管理员可以添加账号、改角色和停用成员。</p>
        </div>
      </section>
    );
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, username, password, role }),
    });
    const json = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || json.ok === false) {
      setError(json.error || "没能添加");
      return;
    }
    setDisplayName("");
    setUsername("");
    setPassword("");
    setRole("artist");
    setNotice("已经添加。把账号和初始密码告诉对方，对方登录后可以自己改密码。");
    await reload();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setNotice("");
    const response = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || json.ok === false) {
      setError(json.error || "没能改");
      return;
    }
    setError("");
    setResetFor(null);
    setNextPassword("");
    await reload();
  }

  async function remove(member: Member) {
    setNotice("");
    const response = await fetch(`/api/users/${member.id}`, { method: "DELETE" });
    const json = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || json.ok === false) {
      setError(json.error || "没能删除");
      return;
    }
    setError("");
    await reload();
  }

  return (
    <section className="library">
      <header className="library-head">
        <h1>成员</h1>
        <p>管理员配置渠道。作品只有本人能看。谁调用过生图，记在「调用记录」里。</p>
      </header>
      <form className="setup-card" onSubmit={(event) => void create(event)}>
        <h2>添加成员</h2>
        <label>
          显示名
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        </label>
        <label>
          账号
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" required />
        </label>
        <label>
          初始密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
        </label>
        <label>
          角色
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {roleLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="setup-save">
          添加
        </button>
      </form>
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
      <ul className="prompt-list">
        {members.map((member) => (
          <li key={member.id} className="prompt-card">
            <strong>
              {member.displayName}
              <span className="role-pill">{roleLabel(member.role)}</span>
              {member.disabled ? <span className="role-pill muted-pill">已停用</span> : null}
            </strong>
            <p>账号 {member.username}</p>
            <div className="member-actions">
              <label>
                角色
                <select
                  aria-label={`${member.displayName}的角色`}
                  value={member.role}
                  onChange={(event) => void patch(member.id, { role: event.target.value })}
                >
                  {ROLES.map((item) => (
                    <option key={item} value={item}>
                      {roleLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="ghost" onClick={() => void patch(member.id, { disabled: !member.disabled })}>
                {member.disabled ? "启用" : "停用"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setResetFor(resetFor === member.id ? null : member.id);
                  setNextPassword("");
                }}
              >
                重置密码
              </button>
              <button type="button" className="ghost" onClick={() => void remove(member)} disabled={member.id === user.id}>
                删除
              </button>
            </div>
            {resetFor === member.id ? (
              <form
                className="member-actions"
                onSubmit={(event) => {
                  event.preventDefault();
                  void patch(member.id, { password: nextPassword });
                }}
              >
                <input
                  type="password"
                  aria-label={`${member.displayName}的新密码`}
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                  placeholder="新密码，至少 8 位"
                  required
                />
                <button type="submit" className="ghost">
                  保存新密码
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
