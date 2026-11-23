import { type AspectId, type StyleId, isAspect, isStyle } from "./models";

export const APPLY_KEY = "miao.apply";
export const DRAFT_KEY = "miao.draft.v1";

let applyKey = APPLY_KEY;
let draftKey = DRAFT_KEY;

export function bindDraftOwner(userId: string) {
  const id = userId.trim();
  applyKey = id ? `${APPLY_KEY}:${id}` : APPLY_KEY;
  draftKey = id ? `${DRAFT_KEY}:${id}` : DRAFT_KEY;
}

export type StoredDraft = {
  prompt: string;
  aspect: AspectId;
  count: number;
  styles: StyleId[];
  modelId: string;
  negative: string;
  seed: string;
  steps: string;
  auto?: boolean;
};

export function defaultDraft(): StoredDraft {
  return {
    prompt: "海边的旧铁路，开往夏天的列车。\n落日把云染成杏色，野花随风摇动，\n一只小猫坐在石墙上看海。",
    aspect: "4:3",
    count: 1,
    styles: ["pixel"],
    modelId: "placeholder",
    negative: "",
    seed: "",
    steps: "",
  };
}

export function writeApply(draft: StoredDraft, auto = false) {
  sessionStorage.setItem(applyKey, JSON.stringify({ ...draft, auto }));
}

export function takeApply(): StoredDraft | null {
  const raw = sessionStorage.getItem(applyKey);
  sessionStorage.removeItem(applyKey);
  return parseDraft(raw);
}

export function readDraft(): StoredDraft | null {
  return parseDraft(localStorage.getItem(draftKey));
}

export function writeDraft(draft: StoredDraft) {
  localStorage.setItem(draftKey, JSON.stringify({ ...draft, auto: undefined }));
}

function parseDraft(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredDraft>;
    if (typeof value.prompt !== "string") return null;
    const styles = Array.isArray(value.styles) ? value.styles.filter((item): item is StyleId => typeof item === "string" && isStyle(item)) : [];
    const aspect = typeof value.aspect === "string" && isAspect(value.aspect) ? value.aspect : "4:3";
    const count = typeof value.count === "number" && value.count >= 1 && value.count <= 4 ? value.count : 1;
    return {
      prompt: value.prompt,
      aspect,
      count,
      styles,
      modelId: typeof value.modelId === "string" ? value.modelId : "placeholder",
      negative: typeof value.negative === "string" ? value.negative : "",
      seed: typeof value.seed === "string" ? value.seed : "",
      steps: typeof value.steps === "string" ? value.steps : "",
      auto: value.auto === true,
    };
  } catch {
    return null;
  }
}
