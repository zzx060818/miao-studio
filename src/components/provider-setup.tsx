"use client";

import { useState } from "react";

const MODELS = [
  { id: "gpt-image-1", label: "gpt-image-1" },
  { id: "dall-e-3", label: "dall-e-3" },
  { id: "dall-e-2", label: "dall-e-2" },
  { id: "custom", label: "其他模型" },
];

export function ProviderSetup({ onSaved }: { onSaved: () => void }) {
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [modelChoice, setModelChoice] = useState("gpt-image-1");
  const [customModel, setCustomModel] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    const model = modelChoice === "custom" ? customModel.trim() : modelChoice;
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
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <label>
        模型
        <select aria-label="生图模型" value={modelChoice} onChange={(event) => setModelChoice(event.target.value)}>
          {MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
      </label>
      {modelChoice === "custom" ? (
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
