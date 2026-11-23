"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deletePrompt, listPrompts, setPromptFavorite, storageErrorMessage, type PromptRecord } from "@/lib/db";
import { writeApply } from "@/lib/draft";
import { formatWhen } from "@/lib/download";
import { styleLabel } from "@/lib/models";

export function PromptsView() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function reload() {
    try {
      setPrompts(await listPrompts());
      setError("");
    } catch (caught) {
      setError(storageErrorMessage(caught));
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function apply(prompt: PromptRecord) {
    writeApply({
      prompt: prompt.text,
      aspect: prompt.aspect,
      count: 1,
      styles: prompt.styles,
      modelId: prompt.modelId,
      negative: "",
      seed: "",
      steps: "",
    });
    router.push("/");
  }

  return (
    <section className="library">
      <div className="library-head">
        <div>
          <h1>提示词</h1>
          <p>常用的句子按账号存在这台服务器上，最多 100 条。</p>
        </div>
        <Link className="ghost linkish" href="/">
          回创作台
        </Link>
      </div>
      {error ? <p className="alert bad" role="alert">{error}</p> : null}
      {prompts.length === 0 ? (
        <div className="empty-sticky">
          <span className="tape" aria-hidden="true" />
          <h2>还没有存过提示词</h2>
          <p>在创作台写好后，点「存下这句」。</p>
        </div>
      ) : (
        <ul className="prompt-list">
          {prompts.map((prompt) => (
            <li key={prompt.id} className="prompt-card">
              <span className="tape tape-right" aria-hidden="true" />
              <h2>{prompt.title}</h2>
              <p>{prompt.text}</p>
              <span className="prompt-meta">
                {prompt.styles.map((style) => styleLabel(style)).join("、") || "未选风格"} · {prompt.aspect} · {formatWhen(prompt.createdAt)}
              </span>
              <div className="actions">
                <button type="button" className="ghost" onClick={() => apply(prompt)}>
                  用这句
                </button>
                <button
                  type="button"
                  className="ghost"
                  aria-pressed={prompt.favorite}
                  onClick={() => {
                    void setPromptFavorite(prompt.id, !prompt.favorite).then(reload).catch((caught) => setError(storageErrorMessage(caught)));
                  }}
                >
                  {prompt.favorite ? "已收藏" : "收藏"}
                </button>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => {
                    if (pendingDelete !== prompt.id) {
                      setPendingDelete(prompt.id);
                      return;
                    }
                    void deletePrompt(prompt.id).then(() => {
                      setPendingDelete(null);
                      return reload();
                    });
                  }}
                >
                  {pendingDelete === prompt.id ? "确认删除" : "删除"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
