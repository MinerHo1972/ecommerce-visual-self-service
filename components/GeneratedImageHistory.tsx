"use client";

import { Check, Download, History, RotateCw, Search, Star, StarOff, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedImage } from "@/lib/types";

function matchesKeyword(image: GeneratedImage, keyword: string) {
  const haystack = `${image.title} ${image.templateName} ${image.platform} ${image.tags.join(" ")}`.toLowerCase();
  return haystack.includes(keyword.trim().toLowerCase());
}

const feedbackFilters = [
  { value: "all", label: "全部反馈" },
  { value: "product_wrong", label: "产品不对" },
  { value: "template_drift", label: "模板跑偏" },
  { value: "text_changed", label: "文案变了" },
  { value: "usable", label: "可用" },
  { value: "none", label: "未标记" },
];

type GeneratedImageHistoryProps = {
  refreshKey?: number;
  onReuseImage?: (image: GeneratedImage) => void;
};

export function GeneratedImageHistory({ refreshKey, onReuseImage }: GeneratedImageHistoryProps) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [feedback, setFeedback] = useState("all");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [apiImages, setApiImages] = useState<GeneratedImage[]>([]);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [recyclingId, setRecyclingId] = useState<number | null>(null);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<number>>(() => new Set());
  const [batchRecycling, setBatchRecycling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-clear error after 3 seconds (P2 fix)
  useEffect(() => {
    if (error) {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setError(null), 3000);
    }
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [error]);

  const fetchImages = useCallback(() => {
    fetch(`/api/generated-images?page_size=100&_=${Date.now()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.items) {
          setApiImages(data.data.items);
        }
      })
      .catch(() => {
        setError("历史成图加载失败，请稍后重试");
        setApiImages([]);
      });
  }, []);

  useEffect(() => {
    fetchImages();
  }, [refreshKey, fetchImages]);

  const handleToggleSelection = useCallback(async (imageId: number, currentSelected: boolean) => {
    setTogglingId(imageId);
    setError(null);
    try {
      const res = await fetch(`/api/generated-images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: !currentSelected }),
      });
      const data = await res.json();
      if (data.success) {
        fetchImages();
      } else {
        setError(data.error?.message ?? "操作失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setTogglingId(null);
    }
  }, [fetchImages]);

  const handleReuse = useCallback((image: GeneratedImage) => {
    onReuseImage?.(image);
  }, [onReuseImage]);

  const handleRecycle = useCallback(async (imageId: number) => {
    if (!confirm("确定把这张历史成图移入回收站吗？")) return;
    setRecyclingId(imageId);
    setError(null);
    try {
      const res = await fetch(`/api/generated-images/${imageId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchImages();
      } else {
        setError(data.error?.message ?? "移入回收站失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setRecyclingId(null);
    }
  }, [fetchImages]);

  const dynamicFeedbackFilters = useMemo(() => {
    const labels = new Set<string>();
    apiImages.forEach((image) => {
      image.tags.forEach((tag) => {
        if (tag.startsWith("feedback:")) labels.add(tag.replace("feedback:", ""));
      });
    });
    const staticValues = new Set(feedbackFilters.map((item) => item.value));
    return Array.from(labels)
      .filter((label) => label && !staticValues.has(label))
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
      .map((label) => ({ value: label, label }));
  }, [apiImages]);

  const images = useMemo(() => {
    return apiImages.filter((image) => {
      if (keyword && !matchesKeyword(image, keyword)) return false;
      if (status !== "all" && image.status !== status) return false;
      if (feedback !== "all") {
        const currentFeedback = image.tags.find((tag) => tag.startsWith("feedback:"))?.replace("feedback:", "");
        if (feedback === "none" && currentFeedback) return false;
        if (feedback !== "none" && currentFeedback !== feedback) return false;
      }
      if (selectedOnly && !image.selected) return false;
      return true;
    });
  }, [keyword, selectedOnly, status, feedback, apiImages]);

  useEffect(() => {
    setBatchSelectedIds((prev) => {
      const currentIds = new Set(apiImages.map((image) => image.id));
      const next = new Set(Array.from(prev).filter((id) => currentIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [apiImages]);

  const visibleImageIds = useMemo(() => images.map((image) => image.id), [images]);
  const visibleSelectedCount = visibleImageIds.filter((id) => batchSelectedIds.has(id)).length;
  const allVisibleSelected = visibleImageIds.length > 0 && visibleSelectedCount === visibleImageIds.length;

  const handleToggleBatchSelection = useCallback((imageId: number) => {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  }, []);

  const handleToggleAllVisible = useCallback(() => {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleImageIds.forEach((id) => next.delete(id));
      } else {
        visibleImageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allVisibleSelected, visibleImageIds]);

  const handleBatchRecycle = useCallback(async () => {
    const imageIds = Array.from(batchSelectedIds);
    if (imageIds.length === 0) return;
    if (!confirm(`确定把选中的 ${imageIds.length} 张历史成图移入回收站吗？`)) return;
    setBatchRecycling(true);
    setError(null);
    try {
      const res = await fetch("/api/generated-images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds }),
      });
      const data = await res.json();
      if (data.success) {
        const archivedIdList = Array.isArray(data.data?.archivedIds) ? data.data.archivedIds.map(Number) : [];
        const archivedIds = new Set<number>(archivedIdList);
        const remainingIds = imageIds.filter((id) => !archivedIds.has(id));

        if (remainingIds.length > 0) {
          const fallbackResults = await Promise.allSettled(
            remainingIds.map(async (id) => {
              const singleRes = await fetch(`/api/generated-images/${id}`, { method: "DELETE", cache: "no-store" });
              const singleData = await singleRes.json();
              if (!singleRes.ok || !singleData.success) {
                throw new Error(singleData.error?.message ?? `图片 ${id} 移入回收站失败`);
              }
              return id;
            })
          );

          fallbackResults.forEach((result) => {
            if (result.status === "fulfilled") archivedIds.add(result.value);
          });
        }

        if (archivedIds.size === 0) {
          const notFoundCount = Array.isArray(data.data?.notFoundIds) ? data.data.notFoundIds.length : 0;
          setError(`批量移入回收站未生效：后端没有归档任何图片（未命中 ${notFoundCount} 张）`);
          fetchImages();
          return;
        }

        setApiImages((prev) => prev.filter((image) => !archivedIds.has(image.id)));
        setBatchSelectedIds((prev) => new Set(Array.from(prev).filter((id) => !archivedIds.has(id))));
        if (archivedIds.size < imageIds.length) {
          setError(`已移入回收站 ${archivedIds.size} 张，${imageIds.length - archivedIds.size} 张失败`);
        }
        fetchImages();
      } else {
        setError(data.error?.message ?? "批量移入回收站失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setBatchRecycling(false);
    }
  }, [batchSelectedIds, fetchImages]);

  return (
    <div className="grid history-layout">
      <section className="panel">
        <div className="panel-head">
          <h2>历史成图</h2>
          <span className="count-pill">{images.length} 张</span>
        </div>
        <div className="history-filters">
          <div className="field search-field">
            <label>搜索</label>
            <div className="input-wrap">
              <Search size={16} />
              <input className="input" value={keyword} placeholder="模板 / 活动 / 平台" onChange={(event) => setKeyword(event.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>状态</label>
            <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">全部</option>
              <option value="succeeded">已完成</option>
              <option value="running">生成中</option>
              <option value="failed">失败</option>
            </select>
          </div>
          <div className="field">
            <label>反馈标签</label>
            <select className="select" value={feedback} onChange={(event) => setFeedback(event.target.value)}>
              {[...feedbackFilters, ...dynamicFeedbackFilters].map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)} />
            只看已选中
          </label>
        </div>
        <div className="bulk-action-bar">
          <label className="check-row">
            <input type="checkbox" checked={allVisibleSelected} disabled={images.length === 0} onChange={handleToggleAllVisible} />
            全选当前筛选结果
          </label>
          <span className="muted">已选 {batchSelectedIds.size} 张</span>
          <button className="button danger" disabled={batchSelectedIds.size === 0 || batchRecycling} onClick={handleBatchRecycle}>
            <Trash2 size={16} />批量移入回收站
          </button>
          {batchSelectedIds.size > 0 && (
            <button className="button" disabled={batchRecycling} onClick={() => setBatchSelectedIds(new Set())}>清空选择</button>
          )}
        </div>
      </section>

      {error && (
        <div style={{ color: "#e53e3e", fontSize: "0.875rem", padding: "0.25rem 1rem" }}>{error}</div>
      )}

      <section className="history-grid">
        {images.map((image) => (
          <article className={`history-card ${batchSelectedIds.has(image.id) ? "batch-selected" : ""}`} key={image.id}>
            <div className="thumb-wrap">
              <label className="batch-select-badge" title="选择这张图用于批量清理">
                <input
                  type="checkbox"
                  checked={batchSelectedIds.has(image.id)}
                  onChange={() => handleToggleBatchSelection(image.id)}
                />
              </label>
              <img alt={image.title} src={image.thumbnailUrl} loading="lazy" decoding="async" />
              {image.selected && <span className="selected-badge"><Check size={14} />最终图</span>}
            </div>
            <div className="history-card-body">
              <div className="history-title-row">
                <h3>{image.title}</h3>
                <span className={`status-chip ${image.status}`}>{image.status === "succeeded" ? "已完成" : image.status}</span>
              </div>
              <p className="muted">{image.templateName} · {image.width}x{image.height}</p>
              <div className="tag-row">
                {image.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
              </div>
              <div className="history-actions">
                <button
                  className="button"
                  disabled={togglingId === image.id}
                  onClick={() => handleToggleSelection(image.id, image.selected)}
                  title={image.selected ? "取消选中" : "设为选中"}
                >
                  {image.selected ? <StarOff size={16} /> : <Star size={16} />}
                  {image.selected ? "取消选中" : "设为选中"}
                </button>
                <button className="button" onClick={() => handleReuse(image)}>
                  <RotateCw size={16} />带回工作台
                </button>
                <button className="button"><Download size={16} />导出</button>
                <button className="button" disabled={recyclingId === image.id} onClick={() => handleRecycle(image.id)}>
                  <Trash2 size={16} />移入回收站
                </button>
              </div>
            </div>
          </article>
        ))}
        {images.length === 0 && (
          <div className="empty-state">
            <History size={28} />
            <p>没有匹配的历史成图</p>
          </div>
        )}
      </section>
    </div>
  );
}
