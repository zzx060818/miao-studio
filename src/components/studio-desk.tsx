"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckMark } from "./cat-mark";
import { ProviderSetup } from "./provider-setup";
import { ViewerDialog, type ViewerData } from "./viewer-dialog";
import {
  listExampleStars,
  listWorks,
  savePrompt,
  saveWork,
  setExampleStar,
  setWorkFavorite,
  storageErrorMessage,
  type WorkRecord,
} from "@/lib/db";
import { downloadBlob, downloadHref, safeFilename } from "@/lib/download";
import { defaultDraft, readDraft, takeApply, writeDraft, type StoredDraft } from "@/lib/draft";
import { EXAMPLES, type Example } from "@/lib/examples";
import { imageFromPayload } from "@/lib/image-payload";
import { LIMITS } from "@/lib/limits";
import {
  ASPECTS,
  STYLES,
  UI_MODELS,
  capsForModel,
  modelNote,
  styleLabel,
  toPublicCaps,
  type AspectId,
  type PublicCaps,
  type StyleId,
} from "@/lib/models";
import { readReferenceFile } from "@/lib/read-image";

type ServiceStatus =
  | { kind: "loading" }
  | { kind: "unconfigured"; detail: string; editable: boolean }
  | { kind: "configured"; model: string; detail: string; caps: PublicCaps; editable: boolean; baseUrl: string }
  | { kind: "unknown" };

type ActionNote = { tone: "info" | "error"; title: string; detail?: string } | null;

type RefItem = { id: string; name: string; mime: string; url: string; data: string };

type ResultImage = { mime: string; url: string; blob: Blob };

type ResultView = {
  workId: string;
  title: string;
  prompt: string;
  images: ResultImage[];
  index: number;
  favorite: boolean;
  aspect: AspectId;
  styles: StyleId[];
  negativePrompt: string;
  seed: number | null;
  steps: number | null;
  modelLabel: string;
};

type GenerateResponse = {
  ok?: boolean;
  error?: string;
  detail?: string;
  model?: string;
  images?: { mime?: string; b64?: string }[];
};

const starter = defaultDraft();

export function StudioDesk() {
  const fileRef = useRef<HTMLInputElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const submitRef = useRef<(draft: StoredDraft) => Promise<void>>(async () => {});
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pendingAuto = useRef<StoredDraft | null>(null);
  const styleMenuId = useId();
  const advancedId = useId();

  const [draft, setDraft] = useState<StoredDraft>(starter);
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [result, setResult] = useState<ResultView | null>(null);
  const [status, setStatus] = useState<ServiceStatus>({ kind: "loading" });
  const [action, setAction] = useState<ActionNote>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"create" | "saved">("create");
  const [advanced, setAdvanced] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [providerModels, setProviderModels] = useState<string[]>([]);
  const [modelsNote, setModelsNote] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [refError, setRefError] = useState("");
  const [works, setWorks] = useState<WorkRecord[]>([]);
  const [stars, setStars] = useState<string[]>([]);
  const [libraryError, setLibraryError] = useState("");
  const [viewer, setViewer] = useState<ViewerData | null>(null);

  const activeCaps = capsFor(status, draft.modelId);
  const matched = result ? null : matchExample(draft);
  const capsKey = `${activeCaps.aspects.map((item) => item.id).join(",")}|${activeCaps.counts.join(",")}`;

  useEffect(() => {
    const applied = takeApply();
    if (applied) {
      setDraft(applied);
      if (applied.auto) pendingAuto.current = applied;
    } else {
      const saved = readDraft();
      if (saved) setDraft(saved);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeDraft(draft);
  }, [draft, hydrated]);

  const loadStatus = useCallback((alive: { current: boolean } = { current: true }) => {
    fetch("/api/provider", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { configured?: boolean; editable?: boolean; model?: string; detail?: string; baseUrl?: string; capabilities?: PublicCaps }) => {
        if (!alive.current) return;
        if (json.configured && json.model && json.capabilities) {
          setStatus({
            kind: "configured",
            model: json.model,
            detail: json.detail ?? "生图服务已配置。",
            caps: json.capabilities,
            editable: json.editable === true,
            baseUrl: json.baseUrl ?? "",
          });
          setDraft((current) => ({ ...current, modelId: json.model ?? current.modelId }));
          return;
        }
        setStatus({
          kind: "unconfigured",
          editable: json.editable === true,
          detail: json.detail ?? "服务器还没有配置生图服务。",
        });
      })
      .catch(() => {
        if (alive.current) setStatus({ kind: "unknown" });
      });
  }, []);

  useEffect(() => {
    const alive = { current: true };
    loadStatus(alive);
    return () => {
      alive.current = false;
    };
  }, [loadStatus]);

  useEffect(() => {
    if (!hydrated || status.kind === "loading" || !pendingAuto.current) return;
    const next = pendingAuto.current;
    pendingAuto.current = null;
    void submitRef.current(next);
  }, [hydrated, status.kind]);

  useEffect(() => {
    setDraft((current) => {
      const aspect = activeCaps.aspects.some((item) => item.id === current.aspect)
        ? current.aspect
        : (activeCaps.aspects[0]?.id ?? current.aspect);
      const count = activeCaps.counts.includes(current.count) ? current.count : (activeCaps.counts[0] ?? 1);
      if (aspect === current.aspect && count === current.count) return current;
      return { ...current, aspect, count };
    });
  }, [capsKey, activeCaps]);

  useEffect(() => {
    void refreshLibrary();
  }, []);

  useEffect(() => {
    if (!styleOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!styleRef.current?.contains(event.target as Node)) setStyleOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStyleOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [styleOpen]);

  const providerBase = status.kind === "configured" ? status.baseUrl : "";
  useEffect(() => {
    if (!providerBase) {
      setProviderModels([]);
      setModelsNote("");
      return;
    }
    let ignore = false;
    setModelsNote("正在获取模型列表…");
    fetch("/api/provider/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: providerBase }),
    })
      .then((response) => response.json())
      .then((json: { ok?: boolean; error?: string; models?: string[] }) => {
        if (ignore) return;
        if (json.ok && json.models && json.models.length > 0) {
          setProviderModels(json.models);
          setModelsNote("");
          return;
        }
        setProviderModels([]);
        setModelsNote(json.error || "没有获取到模型列表");
      })
      .catch(() => {
        if (!ignore) setModelsNote("没有获取到模型列表");
      });
    return () => {
      ignore = true;
    };
  }, [providerBase]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function patch(partial: Partial<StoredDraft>) {
    setAction(null);
    setDraft((current) => ({ ...current, ...partial }));
  }

  async function chooseModel(modelId: string) {
    patch({ modelId });
    if (status.kind !== "configured" || modelId === status.model) return;
    try {
      const response = await fetch("/api/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: status.baseUrl, apiKey: "", model: modelId }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || json.ok === false) {
        setAction({ tone: "error", title: json.error || "没能更换模型" });
        return;
      }
      setAction({ tone: "info", title: `已换成 ${modelId}` });
      loadStatus();
    } catch {
      setAction({ tone: "error", title: "没能更换模型" });
    }
  }

  function replaceResult(next: ResultView | null) {
    setResult((current) => {
      current?.images.forEach((image) => URL.revokeObjectURL(image.url));
      return next;
    });
  }

  async function refreshLibrary() {
    try {
      const [nextWorks, nextStars] = await Promise.all([listWorks(), listExampleStars()]);
      setWorks(nextWorks);
      setStars(nextStars.map((item) => item.exampleId));
      setLibraryError("");
    } catch (error) {
      setLibraryError(storageErrorMessage(error));
    }
  }

  function applyExample(example: Example) {
    replaceResult(null);
    setAction({ tone: "info", title: `已填入示例「${example.cardTitle}」`, detail: "左侧仍是示例图片，并没有生成新图。" });
    setDraft((current) => ({
      ...current,
      prompt: example.prompt,
      aspect: example.aspect,
      styles: [example.styleId],
      count: 1,
    }));
    setMode("create");
  }

  function resetSheet() {
    refs.forEach((item) => URL.revokeObjectURL(item.url));
    setRefs([]);
    replaceResult(null);
    setAction({ tone: "info", title: "新的一张，还没有画面。" });
    setDraft({
      ...defaultDraft(),
      prompt: "",
      styles: [],
      modelId: status.kind === "configured" ? status.model : "placeholder",
    });
    promptRef.current?.focus();
  }

  async function onFiles(files: FileList | File[]) {
    const incoming = [...files];
    if (incoming.length === 0) return;
    const next = [...refs];
    const errors: string[] = [];
    for (const file of incoming) {
      if (next.length >= LIMITS.maxRefs) {
        errors.push(`参考图最多 ${LIMITS.maxRefs} 张`);
        break;
      }
      const loaded = await readReferenceFile(file);
      if (!loaded.ok) {
        errors.push(`${file.name || "图片"}：${loaded.error}`);
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        name: loaded.value.name,
        mime: loaded.value.mime,
        data: loaded.value.data,
        url: URL.createObjectURL(file),
      });
    }
    setRefs(next);
    setRefError(errors[0] ?? "");
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeRef(id: string) {
    setRefs((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  }

  async function keepPrompt() {
    const text = draft.prompt.trim();
    if (!text) {
      setAction({ tone: "error", title: "先写下想画的内容" });
      return;
    }
    try {
      const title = text.split("\n")[0]?.trim() || "未命名";
      const outcome = await savePrompt({
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        title: [...title].slice(0, 18).join(""),
        text,
        favorite: false,
        aspect: draft.aspect,
        styles: draft.styles,
        modelId: draft.modelId,
      });
      setAction({
        tone: "info",
        title: outcome === "exists" ? "这句已经在提示词里" : "已存进提示词",
        detail: "存在这台浏览器里。",
      });
    } catch (error) {
      setAction({ tone: "error", title: storageErrorMessage(error) });
    }
  }

  async function toggleCurrentFavorite() {
    try {
      if (result) {
        await setWorkFavorite(result.workId, !result.favorite);
        setResult((current) => (current ? { ...current, favorite: !current.favorite } : current));
        await refreshLibrary();
        return;
      }
      if (!matched) {
        setAction({ tone: "info", title: "还没有可以收藏的画面" });
        return;
      }
      const on = !stars.includes(matched.id);
      await setExampleStar(matched.id, on);
      await refreshLibrary();
      setAction({ tone: "info", title: on ? "示例已放进收藏" : "已从收藏拿下", detail: "示例仍会标成示例，不会变成生成记录。" });
    } catch (error) {
      setAction({ tone: "error", title: storageErrorMessage(error) });
    }
  }

  async function submit(source: StoredDraft) {
    if (busyRef.current) return;
    const prompt = source.prompt.trim();
    if (!prompt) {
      setAction({ tone: "error", title: "先写下想画的内容" });
      promptRef.current?.focus();
      return;
    }
    const caps = capsFor(status, source.modelId);
    if (caps.reference) {
      if (refs.length > caps.referenceMax) {
        setAction({ tone: "error", title: `当前模型最多接受 ${caps.referenceMax} 张参考图` });
        return;
      }
      const wrong = refs.find((item) => !caps.referenceMimes.includes(item.mime));
      if (wrong) {
        setAction({ tone: "error", title: "当前模型不接受这种参考图", detail: wrong.name });
        return;
      }
    }
    const payload: Record<string, unknown> = {
      prompt,
      aspect: source.aspect,
      count: source.count,
      styles: source.styles,
    };
    if (source.modelId && source.modelId !== "placeholder") payload.model = source.modelId;
    if (caps.negative && source.negative.trim()) payload.negativePrompt = source.negative.trim();
    if (caps.seed && source.seed.trim()) {
      const seed = Number(source.seed);
      if (!Number.isInteger(seed)) {
        setAction({ tone: "error", title: "种子需要是整数" });
        return;
      }
      payload.seed = seed;
    }
    if (caps.steps && source.steps.trim()) {
      const steps = Number(source.steps);
      if (!Number.isInteger(steps)) {
        setAction({ tone: "error", title: "步数需要是整数" });
        return;
      }
      payload.steps = steps;
    }
    if (caps.reference && refs.length > 0) {
      payload.references = refs.map((item) => ({ mime: item.mime, data: item.data }));
    }

    const controller = new AbortController();
    abortRef.current = controller;
    busyRef.current = true;
    setBusy(true);
    setAction({ tone: "info", title: "正在请求生图服务", detail: "完成之前不会出现新图片。" });
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const json = (await response.json()) as GenerateResponse;
      if (!response.ok || !json.ok || !json.images?.length) {
        setAction({
          tone: "error",
          title: json.error || "没有生成图片",
          detail: json.detail,
        });
        return;
      }
      const images = json.images.flatMap((item) => {
        if (!item.b64) return [];
        const parsed = imageFromPayload(item.b64);
        return parsed ? [parsed] : [];
      });
      if (images.length === 0) {
        setAction({ tone: "error", title: "服务没有返回可用的图片" });
        return;
      }
      const workId = crypto.randomUUID();
      const view: ResultView = {
        workId,
        title: shortTitle(prompt),
        prompt,
        images,
        index: 0,
        favorite: false,
        aspect: source.aspect,
        styles: source.styles,
        negativePrompt: typeof payload.negativePrompt === "string" ? payload.negativePrompt : "",
        seed: typeof payload.seed === "number" ? payload.seed : null,
        steps: typeof payload.steps === "number" ? payload.steps : null,
        modelLabel: json.model || source.modelId,
      };
      try {
        await saveWork({
          id: workId,
          createdAt: Date.now(),
          favorite: false,
          prompt,
          negativePrompt: view.negativePrompt,
          modelLabel: view.modelLabel,
          aspect: view.aspect,
          styles: view.styles,
          seed: view.seed,
          steps: view.steps,
          images: images.map((image) => ({ mime: image.mime, blob: image.blob })),
        });
        await refreshLibrary();
        replaceResult(view);
        setAction({ tone: "info", title: "生成完成", detail: "已放进这台浏览器的作品集。" });
      } catch (error) {
        replaceResult(view);
        setAction({
          tone: "error",
          title: "图已经出来了，但没能写进作品集",
          detail: storageErrorMessage(error),
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setAction({ tone: "info", title: "已取消，没有生成图片" });
        return;
      }
      setAction({ tone: "error", title: "没有连上服务器", detail: "这次没有新图片。" });
    } finally {
      busyRef.current = false;
      abortRef.current = null;
      setBusy(false);
    }
  }

  submitRef.current = submit;

  function cancel() {
    abortRef.current?.abort();
  }

  function openViewer() {
    if (result) {
      const image = result.images[result.index];
      if (!image) return;
      setViewer({
        src: image.url,
        alt: `生成结果：${result.title}`,
        title: result.title,
        example: false,
        onDownload: () => downloadBlob(image.blob, `${safeFilename(result.title)}.${extensionFor(image.mime)}`),
        onReuse: () => {
          setViewer(null);
          setAction({ tone: "info", title: "参数已留在右侧" });
        },
        onRegenerate: () => {
          setViewer(null);
          void submit(draft);
        },
      });
      return;
    }
    if (!matched) return;
    setViewer({
      src: matched.image,
      alt: matched.alt,
      title: matched.title,
      example: true,
      onDownload: () => downloadHref(matched.image, `喵绘-示例-${safeFilename(matched.title)}.jpg`),
      onReuse: () => {
        setViewer(null);
        applyExample(matched);
      },
      onRegenerate: () => {
        setViewer(null);
        void submit(draft);
      },
    });
  }

  const modelOptions =
    status.kind === "configured"
      ? Array.from(new Set([status.model, draft.modelId, ...providerModels].filter((id) => id && id !== "placeholder")))
      : UI_MODELS.map((model) => model.id);
  const modelValue = modelOptions.includes(draft.modelId) ? draft.modelId : modelOptions[0];
  const serviceLine = serviceCopy(status);
  const sampleLine = result
    ? "这张是刚生成的作品，不是示例。"
    : matched
      ? status.kind === "configured"
        ? "这张仍是示例，还不是你的作品。"
        : status.kind === "loading"
          ? "示例图片"
          : "示例图片 · 未接入生图"
      : "左侧还是空白。生成成功后，新图才会出现。";
  const preview = result?.images[result.index];
  const currentStarred = result ? result.favorite : matched ? stars.includes(matched.id) : false;

  return (
    <div className="studio">
      <div className="headline-row">
        <h1>今天，画点不一样的。</h1>
        <button type="button" className="plus desk-only" onClick={resetSheet} aria-label="新开一张">
          +
        </button>
        <p className="slogan desk-only">
          <CheckMark />
          一页灵感，无限可能
        </p>
      </div>
      <p className="sample-line">{sampleLine}</p>

      <div className="mode-switch" role="tablist" aria-label="创作或收藏">
        <button type="button" role="tab" aria-selected={mode === "create"} className={mode === "create" ? "on" : ""} onClick={() => setMode("create")}>
          创作
        </button>
        <button type="button" role="tab" aria-selected={mode === "saved"} className={mode === "saved" ? "on" : ""} onClick={() => setMode("saved")}>
          收藏
        </button>
      </div>

      <div className="stage" id="studio">
        <section className="notebook" aria-label="创作手账">
          <div className="page-left">
            <article className="polaroid">
              <span className="tape" aria-hidden="true" />
              <div className="frame">
                {preview ? (
                  <img src={preview.url} alt={`生成结果：${result?.title ?? ""}`} />
                ) : matched ? (
                  <img src={matched.image} alt={matched.alt} />
                ) : (
                  <div className="blank-frame">
                    <p>这里还是空白的</p>
                  </div>
                )}
                {matched && !result ? <span className="badge">示例作品 {matched.indexLabel}</span> : null}
                {result ? <span className="badge fresh">新作品</span> : null}
                <button type="button" className="expand" onClick={openViewer} aria-label="查看大图" disabled={!matched && !result}>
                  <ExpandIcon />
                </button>
                {busy ? (
                  <div className="pending" role="status">
                    正在请求。完成前不会换上新图。
                  </div>
                ) : null}
              </div>
              <div className="polaroid-copy">
                <h2>{result ? result.title : matched ? matched.title : "还没有标题"}</h2>
                <div className="polaroid-meta">
                  <p>{result ? resultMeta(result) : matched ? matched.meta : "参数还在右侧"}</p>
                  <div className="actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        if (matched) applyExample(matched);
                        else setAction({ tone: "info", title: "参数已经在右侧" });
                      }}
                    >
                      复用参数
                    </button>
                    <button type="button" className="ghost regen" onClick={() => void submit(draft)}>
                      再生成
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        if (preview && result) {
                          downloadBlob(preview.blob, `${safeFilename(result.title)}.${extensionFor(preview.mime)}`);
                          return;
                        }
                        if (matched) downloadHref(matched.image, `喵绘-示例-${safeFilename(matched.title)}.jpg`);
                      }}
                      disabled={!preview && !matched}
                    >
                      下载
                    </button>
                  </div>
                </div>
              </div>
              {result && result.images.length > 1 ? (
                <div className="thumbs" aria-label="本次的几张图">
                  {result.images.map((image, index) => (
                    <button
                      key={image.url}
                      type="button"
                      className={index === result.index ? "thumb on" : "thumb"}
                      onClick={() => setResult({ ...result, index })}
                      aria-label={`第 ${index + 1} 张`}
                      aria-pressed={index === result.index}
                    >
                      <img src={image.url} alt="" />
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          </div>
          <div className="spiral" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <div className="page-right">
            {mode === "create" ? (
              <>
                <div className="section-head">
                  <h3>
                    <span>01 / </span>
                    <span className="desk-only">你的灵感</span>
                    <span className="mob-only">写下你的灵感</span>
                  </h3>
                  <div className="quiet-actions">
                    <button type="button" className="text-btn" onClick={() => patch({ prompt: "" })}>
                      清空
                    </button>
                    <button type="button" className="text-btn" onClick={() => void keepPrompt()}>
                      存下这句
                    </button>
                  </div>
                </div>
                <label className="sticky">
                  <span className="tape tape-right" aria-hidden="true" />
                  <span className="sticky-title">我想画……</span>
                  <textarea
                    ref={promptRef}
                    value={draft.prompt}
                    maxLength={LIMITS.maxPrompt}
                    aria-label="画面描述"
                    aria-invalid={action?.title === "先写下想画的内容"}
                    placeholder="画面、光线、情绪，都可以告诉我。"
                    onChange={(event) => patch({ prompt: event.target.value })}
                  />
                  <span className="hint">画面、光线、情绪，都可以告诉我。</span>
                </label>
                <div className="ref-row">
                  <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
                    + 添加参考图
                  </button>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => applyExample(EXAMPLES[(EXAMPLES.findIndex((item) => item.id === matched?.id) + 1) % EXAMPLES.length] ?? EXAMPLES[0])}
                  >
                    找点灵感 ↗
                  </button>
                  <input
                    ref={fileRef}
                    className="file-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(event) => {
                      if (event.target.files) void onFiles(event.target.files);
                    }}
                  />
                </div>
                <div
                  className="drop-zone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void onFiles(event.dataTransfer.files);
                  }}
                >
                  {refs.length > 0 ? (
                    <ul className="refs">
                      {refs.map((item) => (
                        <li key={item.id}>
                          <img src={item.url} alt={item.name} />
                          <button type="button" aria-label={`移除参考图 ${item.name}`} onClick={() => removeRef(item.id)}>
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="drop-hint">也可以把图片拖到这里。PNG、JPEG、WebP，单张小于 4MB。</p>
                  )}
                </div>
                {refError ? <p className="field-error" role="alert">{refError}</p> : null}
                {!activeCaps.reference && refs.length > 0 ? (
                  <p className="field-error">参考图先留在这张纸上。当前模型不会把它们交给生图服务。</p>
                ) : null}

                <div className="section-head tight">
                  <h3>02 / 画面设定</h3>
                </div>
                <div className="field-grid">
                  <label className="field-card">
                    <span>模型</span>
                    <select
                      aria-label="模型"
                      value={modelValue}
                      onChange={(event) => void chooseModel(event.target.value)}
                    >
                      {modelOptions.map((modelId) => (
                        <option key={modelId} value={modelId}>
                          {modelLabel(modelId)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-card">
                    <span>画幅</span>
                    <select value={draft.aspect} onChange={(event) => patch({ aspect: event.target.value as AspectId })}>
                      {(activeCaps.aspects.length > 0 ? activeCaps.aspects : ASPECTS.map((item) => ({ ...item, size: "" }))).map((aspect) => (
                        <option key={aspect.id} value={aspect.id}>
                          {aspect.size ? `${aspect.label} · ${aspect.size.replace("x", "×")}` : aspect.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-card">
                    <span>数量</span>
                    <select aria-label="数量" value={String(draft.count)} onChange={(event) => patch({ count: Number(event.target.value) })}>
                      {activeCaps.counts.map((count) => (
                        <option key={count} value={String(count)}>
                          {count} 张
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {draft.modelId !== "placeholder" || status.kind === "configured" ? (
                  <p className="model-note">{activeCaps.note}</p>
                ) : null}
                {modelsNote ? <p className="field-error">{modelsNote}</p> : null}
                <div className="style-row">
                  <span className="style-label">风格</span>
                  {draft.styles.map((style) => (
                    <button key={style} type="button" className="chip" onClick={() => patch({ styles: draft.styles.filter((item) => item !== style) })} aria-label={`移除风格 ${styleLabel(style)}`}>
                      {styleLabel(style)} ×
                    </button>
                  ))}
                  <div className="style-menu" ref={styleRef}>
                    <button
                      type="button"
                      className="text-btn"
                      aria-expanded={styleOpen}
                      aria-controls={styleMenuId}
                      onClick={() => setStyleOpen((open) => !open)}
                    >
                      更多风格 →
                    </button>
                    {styleOpen ? (
                      <ul id={styleMenuId} role="listbox" aria-label="风格" aria-multiselectable="true">
                        {STYLES.map((style) => {
                          const selected = draft.styles.includes(style.id);
                          return (
                            <li key={style.id} role="option" aria-selected={selected}>
                              <button
                                type="button"
                                onClick={() => {
                                  const styles = selected
                                    ? draft.styles.filter((item) => item !== style.id)
                                    : draft.styles.length >= LIMITS.maxStyles
                                      ? draft.styles
                                      : [...draft.styles, style.id];
                                  patch({ styles });
                                }}
                              >
                                {selected ? "● " : "○ "}
                                {style.label}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                </div>
                <p className="style-note">风格会写进提示，不是模型的单独参数。</p>

                <div className="advanced">
                  <button type="button" className="advanced-toggle" aria-expanded={advanced} aria-controls={advancedId} onClick={() => setAdvanced((open) => !open)}>
                    <span>
                      <strong>高级设置</strong>
                      <em>种子、排除内容等</em>
                    </span>
                    <span aria-hidden="true">{advanced ? "–" : "+"}</span>
                  </button>
                  {advanced ? (
                    <div id={advancedId} className="advanced-body">
                      {activeCaps.negative ? (
                        <label>
                          排除内容
                          <textarea value={draft.negative} maxLength={LIMITS.maxNegative} onChange={(event) => patch({ negative: event.target.value })} />
                        </label>
                      ) : null}
                      {activeCaps.seed ? (
                        <label>
                          种子
                          <input inputMode="numeric" value={draft.seed} onChange={(event) => patch({ seed: event.target.value.replace(/[^\d]/g, "") })} />
                        </label>
                      ) : null}
                      {activeCaps.steps ? (
                        <label>
                          步数
                          <input inputMode="numeric" value={draft.steps} onChange={(event) => patch({ steps: event.target.value.replace(/[^\d]/g, "") })} />
                        </label>
                      ) : null}
                      {!activeCaps.negative || !activeCaps.seed || !activeCaps.steps ? (
                        <p>
                          当前模型不支持
                          {[!activeCaps.negative ? "排除内容" : "", !activeCaps.seed ? "种子" : "", !activeCaps.steps ? "步数" : ""]
                            .filter(Boolean)
                            .join("、")}
                          。这些栏不会被送出，也不会被当成已经生效。
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {status.kind === "unconfigured" && status.editable ? <ProviderSetup onSaved={() => loadStatus()} /> : null}
                {status.kind === "configured" && status.editable && setupOpen ? (
                  <ProviderSetup
                    initialBaseUrl={status.baseUrl || "https://api.openai.com/v1"}
                    initialModel={status.model}
                    hasSavedKey
                    onSaved={() => {
                      setSetupOpen(false);
                      loadStatus();
                    }}
                  />
                ) : null}
                {action ? (
                  <div className={action.tone === "error" ? "alert bad" : "alert"} role="alert">
                    <strong>{action.title}</strong>
                    {action.detail ? <p>{action.detail}</p> : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="generate"
                  onClick={() => (busy ? cancel() : void submit(draft))}
                  aria-label={busy ? "取消生成" : "开始生成"}
                >
                  {busy ? "取消" : "+ 开始生成"}
                </button>
                <p className="service-line" role="status">
                  {serviceLine}
                  {status.kind === "configured" && status.editable ? (
                    <button type="button" className="service-edit" onClick={() => setSetupOpen((open) => !open)}>
                      {setupOpen ? "收起配置" : "更换生图服务"}
                    </button>
                  ) : null}
                </p>
              </>
            ) : (
              <FavoritePanel
                works={works.filter((work) => work.favorite)}
                stars={stars}
                currentStarred={currentStarred}
                libraryError={libraryError}
                onToggleCurrent={() => void toggleCurrentFavorite()}
                onUseExample={(example) => applyExample(example)}
                onUseWork={(work) => {
                  replaceResult(null);
                  setMode("create");
                  setAction({ tone: "info", title: "已把这张作品的参数放回创作台", detail: "画面不会被重新生成，除非你再按一次开始生成。" });
                  setDraft((current) => ({
                    ...current,
                    prompt: work.prompt,
                    aspect: work.aspect,
                    styles: work.styles,
                    negative: work.negativePrompt,
                    seed: work.seed?.toString() ?? "",
                    steps: work.steps?.toString() ?? "",
                  }));
                }}
              />
            )}
          </div>
        </section>
        <div className="side-tabs">
          <button type="button" className={mode === "create" ? "side-tab on" : "side-tab"} aria-pressed={mode === "create"} onClick={() => setMode("create")}>
            创作
          </button>
          <button type="button" className={mode === "saved" ? "side-tab fav on" : "side-tab fav"} aria-pressed={mode === "saved"} onClick={() => setMode("saved")}>
            收藏
          </button>
        </div>
      </div>

      <section className="inspire" aria-labelledby="inspire-title">
        <div className="section-head spread">
          <h2 id="inspire-title">灵感不止一种样子。</h2>
          <Link href="/gallery">打开作品集 ↗</Link>
        </div>
        <div className="inspire-grid">
          {EXAMPLES.map((example) => (
            <button
              key={example.id}
              type="button"
              className={matched?.id === example.id ? "inspire-card is-current" : "inspire-card"}
              onClick={() => applyExample(example)}
              aria-label={`用示例「${example.cardTitle}」填进提示`}
            >
              <span className="shot">
                <img src={example.image} alt="" />
              </span>
              <span className="card-copy">
                <span>{example.cardTitle}</span>
                <span>{example.styleLabel}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="foot-line">
          <p className="desk-only">三种示例，三种想象。示例不是生成记录。</p>
          <p className="mob-only">示例风格不代表产品只支持像素插画。</p>
          <p>MIAO STUDIO</p>
        </div>
      </section>
      <ViewerDialog data={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

function FavoritePanel({
  works,
  stars,
  currentStarred,
  libraryError,
  onToggleCurrent,
  onUseExample,
  onUseWork,
}: {
  works: WorkRecord[];
  stars: string[];
  currentStarred: boolean;
  libraryError: string;
  onToggleCurrent: () => void;
  onUseExample: (example: Example) => void;
  onUseWork: (work: WorkRecord) => void;
}) {
  const starredExamples = EXAMPLES.filter((example) => stars.includes(example.id));
  const empty = works.length === 0 && starredExamples.length === 0;
  return (
    <div className="favorites">
      <div className="section-head">
        <h3>收藏</h3>
        <button type="button" className="text-btn" onClick={onToggleCurrent}>
          {currentStarred ? "取消收藏眼前这张" : "收藏眼前这张"}
        </button>
      </div>
      {libraryError ? <p className="field-error" role="alert">{libraryError}</p> : null}
      {empty ? <p className="empty-copy">收藏还是空的。示例收藏会一直标着「示例」，不会混进作品集。</p> : null}
      <ul className="fav-list">
        {starredExamples.map((example) => (
          <li key={example.id}>
            <img src={example.image} alt="" />
            <div>
              <strong>{example.cardTitle}</strong>
              <span className="badge static">示例</span>
            </div>
            <button type="button" className="text-btn" onClick={() => onUseExample(example)}>
              放回创作台
            </button>
          </li>
        ))}
        {works.map((work) => (
          <li key={work.id}>
            {work.images[0] ? <WorkThumb blob={work.images[0].blob} /> : <span className="shot" />}
            <div>
              <strong>{shortTitle(work.prompt)}</strong>
              <span>作品</span>
            </div>
            <button type="button" className="text-btn" onClick={() => onUseWork(work)}>
              放回创作台
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkThumb({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  if (!url) return null;
  return <img src={url} alt="" />;
}

function modelLabel(id: string): string {
  return UI_MODELS.find((model) => model.id === id)?.label ?? id;
}

function capsFor(status: ServiceStatus, modelId: string): PublicCaps {
  if (status.kind === "configured") {
    const id = modelId && modelId !== "placeholder" ? modelId : status.model;
    if (id === status.model) return status.caps;
    return toPublicCaps(capsForModel(id, []), modelNote(id));
  }
  const model = UI_MODELS.find((item) => item.id === modelId) ?? UI_MODELS[0];
  return toPublicCaps(model.caps, model.note);
}

function matchExample(draft: StoredDraft): Example | null {
  return (
    EXAMPLES.find(
      (example) =>
        example.prompt === draft.prompt &&
        example.aspect === draft.aspect &&
        draft.styles.length === 1 &&
        draft.styles[0] === example.styleId,
    ) ?? null
  );
}

function shortTitle(prompt: string): string {
  const line = prompt.split("\n")[0]?.trim() || "未命名";
  return [...line].slice(0, 18).join("");
}

function resultMeta(result: ResultView): string {
  const style = result.styles.map((style) => styleLabel(style)).join("、") || "未选风格";
  return `${style} / ${result.aspect} / ${result.modelLabel}`;
}

function serviceCopy(status: ServiceStatus): string {
  if (status.kind === "loading") return "正在确认生图服务…";
  if (status.kind === "configured") return "生图服务已配置。密钥只留在这台电脑上。";
  if (status.kind === "unknown") return "没能确认生图服务状态。提交时以服务器的回答为准。";
  if (status.kind === "unconfigured" && status.editable) return "还没接入生图服务。先在上面保存接口地址、密钥和模型。";
  return "尚未配置生图服务。可以先写提示和调参数，现在按生成会明确失败。";
}

function extensionFor(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 2 H2 V6 M10 2 H14 V6 M6 14 H2 V10 M10 14 H14 V10" fill="none" stroke="#1c1915" strokeWidth="1.6" />
    </svg>
  );
}
