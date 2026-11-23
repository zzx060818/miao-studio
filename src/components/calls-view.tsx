"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import type { CallRecord } from "@/lib/call-record";
import { formatWhen } from "@/lib/download";
import { roleLabel } from "@/lib/roles";

export function CallsView() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [error, setError] = useState("");
  const [person, setPerson] = useState("all");

  useEffect(() => {
    if (user?.role !== "admin") return;
    void fetch("/api/calls", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { ok?: boolean; error?: string; calls?: CallRecord[] }) => {
        if (!json.calls) {
          setError(json.error || "没能读到调用记录");
          return;
        }
        setCalls(json.calls);
        setError("");
      })
      .catch(() => setError("没能读到调用记录"));
  }, [user]);

  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <section className="library">
        <div className="empty-sticky">
          <h2>调用记录</h2>
          <p>只有管理员能看谁在什么时候请求过生图。作品仍然只有本人能看。</p>
        </div>
      </section>
    );
  }

  const people = Array.from(new Map(calls.map((call) => [call.userId, call.displayName])).entries());
  const visible = person === "all" ? calls : calls.filter((call) => call.userId === person);

  return (
    <section className="library">
      <header className="library-head">
        <div>
          <h1>调用记录</h1>
          <p>每次生图请求记在这里，包含失败的。作品图只在各人自己的作品集里，这里不放图。</p>
        </div>
        <label className="field-card">
          <span>成员</span>
          <select aria-label="按成员筛选" value={person} onChange={(event) => setPerson(event.target.value)}>
            <option value="all">全部</option>
            {people.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </header>
      {error ? (
        <div className="alert bad" role="alert">
          <strong>{error}</strong>
        </div>
      ) : null}
      {visible.length === 0 ? (
        <div className="empty-sticky">
          <span className="tape" aria-hidden="true" />
          <h2>还没有调用</h2>
          <p>有人按开始生成之后，成功和失败都会出现在这里。</p>
        </div>
      ) : (
        <ul className="prompt-list">
          {visible.map((call) => (
            <li key={call.id} className="prompt-card">
              <span className="tape tape-right" aria-hidden="true" />
              <h2>
                {call.displayName}
                <span className="role-pill">{roleLabel(call.role)}</span>
                <span className={call.ok ? "role-pill" : "role-pill muted-pill"}>{call.ok ? "成功" : "失败"}</span>
              </h2>
              <p>{call.prompt || "没有写下提示"}</p>
              <span className="prompt-meta">
                {call.username} · {formatWhen(call.createdAt)} · {call.model || "默认模型"} · {call.aspect || "未写画幅"} ·{" "}
                {call.count ?? "?"} 张{call.error ? ` · ${call.error}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
