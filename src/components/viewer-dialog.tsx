"use client";

import { useEffect, useRef } from "react";

export type ViewerData = {
  src: string;
  alt: string;
  title: string;
  example: boolean;
  onDownload: () => void;
  onReuse?: () => void;
  onRegenerate?: () => void;
};

export function ViewerDialog({ data, onClose }: { data: ViewerData | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (data && !dialog.open) dialog.showModal();
    if (!data && dialog.open) dialog.close();
  }, [data]);

  return (
    <dialog
      ref={ref}
      className="viewer"
      aria-label={data?.title ?? "图片"}
      onClose={onClose}
    >
      {data ? (
        <div className="viewer-body">
          <div className="viewer-bar">
            <div>
              {data.example ? <span className="badge static">示例</span> : <span className="badge static fresh">作品</span>}
              <strong>{data.title}</strong>
            </div>
            <button type="button" className="text-btn" onClick={onClose} autoFocus>
              关闭
            </button>
          </div>
          <img src={data.src} alt={data.alt} />
          <div className="viewer-actions">
            <button type="button" className="ghost" onClick={data.onDownload}>
              下载
            </button>
            {data.onReuse ? (
              <button type="button" className="ghost" onClick={data.onReuse}>
                复用参数
              </button>
            ) : null}
            {data.onRegenerate ? (
              <button type="button" className="ghost" onClick={data.onRegenerate}>
                再生成
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
