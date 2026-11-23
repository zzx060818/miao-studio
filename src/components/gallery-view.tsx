"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ViewerDialog, type ViewerData } from "./viewer-dialog";
import { deleteWork, listWorks, setWorkFavorite, storageErrorMessage, type WorkRecord } from "@/lib/db";
import { downloadBlob, formatWhen, safeFilename } from "@/lib/download";
import { writeApply } from "@/lib/draft";
import { styleLabel } from "@/lib/models";

export function GalleryView() {
  const router = useRouter();
  const [works, setWorks] = useState<WorkRecord[]>([]);
  const [filter, setFilter] = useState<"all" | "saved">("all");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerData | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  async function reload() {
    try {
      setWorks(await listWorks());
      setError("");
    } catch (caught) {
      setError(storageErrorMessage(caught));
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    const created: Record<string, string> = {};
    for (const work of works) {
      const blob = work.images[0]?.blob;
      if (blob) created[work.id] = URL.createObjectURL(blob);
    }
    setUrls(created);
    return () => {
      Object.values(created).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [works]);

  const visible = filter === "saved" ? works.filter((work) => work.favorite) : works;

  function reuse(work: WorkRecord, auto: boolean) {
    writeApply(
      {
        prompt: work.prompt,
        aspect: work.aspect,
        count: Math.min(work.images.length, 4) || 1,
        styles: work.styles,
        modelId: work.modelLabel || "placeholder",
        negative: work.negativePrompt,
        seed: work.seed?.toString() ?? "",
        steps: work.steps?.toString() ?? "",
      },
      auto,
    );
    router.push("/");
  }

  return (
    <section className="library">
      <div className="library-head">
        <div>
          <h1>作品集</h1>
          <p>生成的图按账号存在这台服务器上。示例不会被记成历史。</p>
        </div>
        <div className="filters" role="tablist" aria-label="作品筛选">
          <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
            全部
          </button>
          <button type="button" role="tab" aria-selected={filter === "saved"} className={filter === "saved" ? "on" : ""} onClick={() => setFilter("saved")}>
            收藏
          </button>
        </div>
      </div>
      {error ? <p className="alert bad" role="alert">{error}</p> : null}
      {visible.length === 0 ? (
        <div className="empty-board">
          <div className="empty-polaroid">
            <div className="blank-frame tall" />
            <h2>{filter === "saved" ? "还没有收藏" : "还没有作品"}</h2>
            <p>{filter === "saved" ? "在作品上点星，会留在这个筛选里。" : "回到创作台写下想画的话。服务没配置好时，这里会继续是空的。"}</p>
            <Link className="ghost linkish" href="/">
              去创作台
            </Link>
          </div>
        </div>
      ) : (
        <ul className="work-grid">
          {visible.map((work) => (
            <li key={work.id} className="work-card">
              <button
                type="button"
                className="shot-btn"
                onClick={() =>
                  setViewer({
                    src: urls[work.id] ?? "",
                    alt: `作品：${work.prompt.split("\n")[0] ?? ""}`,
                    title: work.prompt.split("\n")[0]?.slice(0, 18) || "未命名",
                    example: false,
                    onDownload: () => {
                      const image = work.images[0];
                      if (!image) return;
                      const ext = image.mime === "image/jpeg" ? "jpg" : image.mime === "image/webp" ? "webp" : "png";
                      downloadBlob(image.blob, `${safeFilename(work.prompt)}.${ext}`);
                    },
                    onReuse: () => {
                      setViewer(null);
                      reuse(work, false);
                    },
                    onRegenerate: () => {
                      setViewer(null);
                      reuse(work, true);
                    },
                  })
                }
                aria-label={`查看作品 ${work.prompt.split("\n")[0] ?? ""}`}
              >
                {urls[work.id] ? (
                  <img src={urls[work.id]} alt="" />
                ) : (
                  <span className="blank-frame" />
                )}
              </button>
              <div className="work-copy">
                <strong>{work.prompt.split("\n")[0]}</strong>
                <span>
                  {work.styles.map((style) => styleLabel(style)).join("、") || "未标风格"} · {formatWhen(work.createdAt)}
                </span>
              </div>
              <div className="actions">
                <button type="button" className="ghost" onClick={() => reuse(work, false)}>
                  复用参数
                </button>
                <button type="button" className="ghost" onClick={() => reuse(work, true)}>
                  再生成
                </button>
                <button
                  type="button"
                  className="ghost"
                  aria-pressed={work.favorite}
                  onClick={() => {
                    void setWorkFavorite(work.id, !work.favorite).then(reload).catch((caught) => setError(storageErrorMessage(caught)));
                  }}
                >
                  {work.favorite ? "已收藏" : "收藏"}
                </button>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => {
                    if (pendingDelete !== work.id) {
                      setPendingDelete(work.id);
                      return;
                    }
                    void deleteWork(work.id).then(() => {
                      setPendingDelete(null);
                      return reload();
                    });
                  }}
                >
                  {pendingDelete === work.id ? "确认删除" : "删除"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ViewerDialog data={viewer} onClose={() => setViewer(null)} />
    </section>
  );
}
