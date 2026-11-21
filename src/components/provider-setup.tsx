"use client";

import { useState } from "react";

const MODELS = [
  { id: "gpt-image-1", label: "gpt-image-1" },
  { id: "dall-e-3", label: "dall-e-3" },
  { id: "dall-e-2", label: "dall-e-2" },
  { id: "custom", label: "其他模型" },
];

export function ProviderSetup({
  initialBaseUrl = "https://api.openai.com/v1",
  initialModel = "gpt-image-1",
  hasSavedKey = false,
  onSaved,
}: {
  initialBaseUrl?: string;
  initialModel?: string;
  hasSavedKey?: boolean;
  onSaved: () => void;
}) {
  const known = MODELS.some((model) => model.id === initialModel);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [modelChoice, setModelChoice] = useState(known ? initialModel : "custom");
  const [customModel, setCustomModel] = useState(known ? "" : initialModel);
  const [listed, setListed] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  const model = listed.includes(modelChoice) ? modelChoice : modelChoice === "custom" ? customModel.trim() : modelChoice;

  async function loadModels() {
    setLoadingModels(true);
    setError("");
    try {
      const response = await fetch("/api/provider/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string; models?: string[] };
      if (!response.ok || json.ok === false || !json.models?.length) {
        setError(json.error || "没有获取到模型列表");
        return;
      }
      setListed(json.models);
      setModelChoice(json.models.includes(model) ? model : json.models[0]);
    } catch {
      setError("没能连上模型列表接口");
    } finally {
      setLoadingModels(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey, model }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || json.ok === false) {
        setError(json.error || "没能保存生图服务");
        return;
      }
      setApiKey("");
      onSaved();
    } catch {
      setError("没能连上这台电脑上的配置接口");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="setup-card"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="section-head tight">
        <h3>配置生图服务</h3>
      </div>
      <p>填写接口地址、密钥和模型。密钥只写在这台电脑上，保存后页面不再显示它。</p>
      <label>
        接口地址
        <input
          value={baseUrl}
          autoComplete="off"
          spellCheck={false}
          aria-label="生图服务地址"
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </label>
      <label>
        密钥
        <input
          type="password"
          value={apiKey}
          autoComplete="off"
          aria-label="生图服务密钥"
          placeholder={hasSavedKey ? "留空则继续使用已保存的密钥" : ""}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <div className="setup-model">
        <label>
          模型
          {listed.length > 0 ? (
            <select aria-label="生图模型" value={modelChoice} onChange={(event) => setModelChoice(event.target.value)}>
              {listed.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          ) : (
            <select aria-label="生图模型" value={modelChoice} onChange={(event) => setModelChoice(event.target.value)}>
              {MODELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          )}
        </label>
        <button type="button" className="setup-fetch" onClick={() => void loadModels()} disabled={loadingModels}>
          {loadingModels ? "正在获取" : "获取模型列表"}
        </button>
      </div>
      {listed.length === 0 && modelChoice === "custom" ? (
        <label>
          模型名称
          <input
            value={customModel}
            autoComplete="off"
            spellCheck={false}
            aria-label="自定义模型名称"
            placeholder="例如 gpt-image-1"
            onChange={(event) => setCustomModel(event.target.value)}
          />
        </label>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="setup-save" disabled={saving}>
        {saving ? "正在保存" : "保存配置"}
      </button>
    </form>
  );
}
