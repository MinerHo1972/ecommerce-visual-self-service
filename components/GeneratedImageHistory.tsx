"use client";

import { Check, Copy, Download, GitBranch, History, MoreHorizontal, RefreshCw, RotateCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedImage, ImageQualityReview, QualityBadge, WorkflowLineageNode, WorkflowLineageViewModel } from "@/lib/types";

type HistoryImage = GeneratedImage & { qualityBadge?: QualityBadge | null };

function getWorkflowSourceLabel(image: GeneratedImage) {
  if (image.operationTrace?.workflowType) return image.operationTrace.workflowType;

  const mode = typeof image.inputsSnapshot?.mode === "string" ? image.inputsSnapshot.mode : null;
  if (image.tags.includes("partial_repaint") || mode === "partial_repaint") return "局部重绘";
  if (image.tags.includes("template_text_edit") || mode === "template_text_edit") return "文字修改";
  if (image.tags.includes("iteration") || image.tags.some((tag) => tag.startsWith("parent:")) || image.inputsSnapshot?.parentImageId) return "历史生成继续优化";
  if (image.tags.includes("template_replace") || image.templateName) return "商品图套模板";
  return "历史生成";
}

function matchesKeyword(image: GeneratedImage, keyword: string) {
  const haystack = `${image.title} ${image.templateName} ${image.platform} ${getWorkflowSourceLabel(image)} ${image.tags.join(" ")}`.toLowerCase();
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

type OperationTrace = NonNullable<GeneratedImage["operationTrace"]>;

type LineageData = WorkflowLineageViewModel;

function formatTraceSummary(trace: OperationTrace) {
  return `${trace.workflowType} · ${trace.constraintPreset} · ${trace.count} 张候选 · ${trace.size}`;
}

function getQualityReviewLabel(review: ImageQualityReview | null | undefined) {
  if (!review) return "未触发";
  if (review.reviewStatus === "pending") return "等待质检";
  if (review.reviewStatus === "running") return "质检中";
  if (review.reviewStatus === "succeeded") {
    if (review.qualityStatus === "pass") return "通过";
    if (review.qualityStatus === "fail") return "建议优化";
    if (review.qualityStatus === "review") return "需人审";
    return "结果缺失";
  }
  if (review.reviewStatus === "timeout") return "超时";
  if (review.reviewStatus === "skipped") return "已跳过";
  return "暂不可用";
}

function getQualityReviewTone(review: ImageQualityReview | null | undefined) {
  if (!review) return "idle";
  if (review.reviewStatus === "pending" || review.reviewStatus === "running") return "pending";
  if (review.reviewStatus === "succeeded" && review.qualityStatus === "pass") return "pass";
  if (review.reviewStatus === "succeeded" && review.qualityStatus === "fail") return "fail";
  if (review.reviewStatus === "succeeded") return "review";
  if (review.reviewStatus === "skipped") return "idle";
  return "review";
}

function formatScore(score: number | undefined) {
  return typeof score === "number" ? `${Math.round(score * 100)}分` : "--";
}

function formatDateTime(value: string | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function getQualityActionLabel(action: ImageQualityReview["suggestedAction"] | undefined) {
  if (action === "accept") return "接受候选";
  if (action === "retry") return "建议重试";
  if (action === "manual_review") return "人工复核";
  return "--";
}

function getBadgeLabel(badge: QualityBadge | null | undefined) {
  if (!badge) return null;
  if (badge.reviewStatus === "pending") return "质检等待中";
  if (badge.reviewStatus === "running") return "质检中…";
  if (badge.reviewStatus === "succeeded") {
    if (badge.qualityStatus === "pass") return "质检通过";
    if (badge.qualityStatus === "fail") return "建议优化";
    if (badge.qualityStatus === "review") return "质检待审";
    return "质检结果缺失";
  }
  if (badge.reviewStatus === "timeout") return "质检超时";
  if (badge.reviewStatus === "skipped") return "质检跳过";
  return "质检暂不可用";
}

function getBadgeTone(badge: QualityBadge | null | undefined) {
  if (!badge) return null;
  if (badge.reviewStatus === "pending" || badge.reviewStatus === "running") return "pending";
  if (badge.reviewStatus === "succeeded" && badge.qualityStatus === "pass") return "pass";
  if (badge.reviewStatus === "succeeded" && badge.qualityStatus === "fail") return "review";
  if (badge.reviewStatus === "succeeded") return "review";
  if (badge.reviewStatus === "skipped") return null;
  return "review";
}

function canRerunQualityReview(badge: QualityBadge | null | undefined) {
  if (!badge) return false;
  if (badge.reviewStatus === "failed" || badge.reviewStatus === "timeout") return true;
  return badge.reviewStatus === "succeeded" && badge.qualityStatus === "fail";
}

function getQualityReviewHint(review: ImageQualityReview | null | undefined) {
  if (!review) return "AI 质检是辅助判断，不影响图片继续使用。";
  if (review.reviewStatus === "succeeded" && review.qualityStatus === "fail") return "这张图可能需要优化。可以带回工作台继续调整，或重新质检。";
  if (review.reviewStatus === "succeeded" && review.qualityStatus === "review") return "建议人工看一眼，再决定是否继续使用。";
  if (review.reviewStatus === "failed" || review.reviewStatus === "timeout") return "质检链路异常，不代表图片不可用；可以重新质检。";
  return "AI 质检是旁路建议，不会拦截候选图使用。";
}

export function GeneratedImageHistory({ refreshKey, onReuseImage }: GeneratedImageHistoryProps) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [feedback, setFeedback] = useState("all");
  const [apiImages, setApiImages] = useState<HistoryImage[]>([]);
  const [qualityReviewEnabled, setQualityReviewEnabled] = useState(true);
  const [recyclingId, setRecyclingId] = useState<number | null>(null);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<number>>(() => new Set());
  const [batchRecycling, setBatchRecycling] = useState(false);
  const [qualityBatchRerunning, setQualityBatchRerunning] = useState(false);
  const [lineageData, setLineageData] = useState<LineageData | null>(null);
  const [lineageLoadingId, setLineageLoadingId] = useState<number | null>(null);
  const [qualityRerunId, setQualityRerunId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
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
          setQualityReviewEnabled(data.data.qualityReviewEnabled !== false);
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

  const handleReuse = useCallback((image: GeneratedImage) => {
    setLineageData(null);
    setOpenActionsId(null);
    onReuseImage?.(image);
  }, [onReuseImage]);

  const handleOpenLineage = useCallback(async (imageId: number) => {
    setLineageLoadingId(imageId);
    setError(null);
    try {
      const res = await fetch(`/api/generated-images/${imageId}/lineage`, { cache: "no-store" });
      const data = await res.json();
      if (data.success && data.data) {
        setOpenActionsId(null);
        setLineageData(data.data);
      } else {
        setError(data.error?.message ?? "谱系加载失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLineageLoadingId(null);
    }
  }, []);

  const handleRefreshLineage = useCallback(() => {
    if (!lineageData) return;
    void handleOpenLineage(lineageData.currentImageId);
  }, [handleOpenLineage, lineageData]);

  const handleCopyText = useCallback(async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setError(message);
    } catch {
      setError("复制失败，请手动复制链接");
    }
  }, []);

  const handleRerunQualityReview = useCallback(async (imageId: number) => {
    setQualityRerunId(imageId);
    setError(null);
    try {
      const res = await fetch(`/api/generated-images/${imageId}/quality-review`, { method: "POST", cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setError("已重新提交质检，稍后刷新状态");
        fetchImages();
        if (lineageData?.currentImageId === imageId) {
          void handleOpenLineage(imageId);
        }
      } else {
        setError(data.error?.message ?? "重新质检失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setQualityRerunId(null);
    }
  }, [fetchImages, handleOpenLineage, lineageData?.currentImageId]);

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
      return true;
    });
  }, [keyword, status, feedback, apiImages]);

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


  function renderQualityReviewPanel() {
    const review = lineageData?.qualityReview;
    const imageDebugPath = lineageData ? `/api/generated-images/${lineageData.currentImageId}/quality-review` : "";
    const runDebugPath = review?.workflowRunId ? `/api/workflow-runs/${encodeURIComponent(review.workflowRunId)}/quality-reviews` : "";

    return (
      <div className={`quality-review-summary quality-review-panel ${getQualityReviewTone(review)}`}>
        <div className="quality-review-main">
          <span className={`quality-status-badge ${getQualityReviewTone(review)}`}>质检：{getQualityReviewLabel(review)}</span>
          <span className="muted">{getQualityReviewHint(review)}</span>
          <button className="button compact-button" disabled={lineageLoadingId === lineageData?.currentImageId} onClick={handleRefreshLineage}>
            <RefreshCw size={14} />刷新状态
          </button>
          {qualityReviewEnabled && lineageData && (
            <button className="button compact-button" disabled={qualityRerunId === lineageData.currentImageId} onClick={() => handleRerunQualityReview(lineageData.currentImageId)}>
              <ShieldCheck size={14} />{qualityRerunId === lineageData.currentImageId ? "提交中" : "重新质检"}
            </button>
          )}
        </div>
        {review ? (
          <>
            <div className="quality-debug-grid">
              <span>Review #{review.id}</span>
              <span>Run {review.workflowRunId ?? "--"}</span>
              <span>来源 {review.reviewSource}</span>
              <span>建议 {getQualityActionLabel(review.suggestedAction)}</span>
              <span>置信度 {formatScore(review.confidence)}</span>
              <span>更新时间 {formatDateTime(review.updatedAt)}</span>
            </div>
            <div className="quality-debug-actions">
              <code>{imageDebugPath}</code>
              <button className="button compact-button" onClick={() => handleCopyText(imageDebugPath, "图片质检调试接口已复制")}>
                <Copy size={14} />复制图片接口
              </button>
              {runDebugPath && (
                <button className="button compact-button" onClick={() => handleCopyText(runDebugPath, "运行质检调试接口已复制")}>
                  <Copy size={14} />复制 Run 接口
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="quality-debug-actions">
            <span className="muted">当前图片还没有质检记录</span>
            <code>{imageDebugPath}</code>
            <button className="button compact-button" onClick={() => handleCopyText(imageDebugPath, "图片质检调试接口已复制")}>
              <Copy size={14} />复制调试接口
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderLineageCard(node: WorkflowLineageNode) {
    return (
      <article className={`lineage-card ${node.role}`} key={`${node.role}-${node.image.id}`}>
        <div className="lineage-card-head">
          <span className="count-pill">{node.roleLabel}</span>
          <span className="tag">#{node.image.id}</span>
        </div>
        <div className="thumb-wrap"><img alt={node.image.title} src={node.image.thumbnailUrl} loading="lazy" decoding="async" /></div>
        <div className="history-card-body">
          <h3>{node.image.title}</h3>
          <p className="muted">{node.modeLabel} · {node.image.width}x{node.image.height}</p>
          <div className="lineage-meta">
            <span>反馈：{node.feedback ?? "未标记"}</span>
            <span>状态：{node.image.status}</span>
            <span>来源：{node.sourceLabel}</span>
            {node.parentImageId && <span>上一步：#{node.parentImageId}</span>}
          </div>
          <div className="tag-row">
            {node.image.tags.slice(0, 6).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
          </div>
          {node.image.operationTrace && (
            <details className="operation-trace">
              <summary>查看生图参数</summary>
              <div className="operation-trace-meta">
                <span>工作流：{node.image.operationTrace.workflowType}</span>
                <span>操作：{node.image.operationTrace.operationMode}</span>
                <span>约束：{node.image.operationTrace.constraintPreset}</span>
                <span>尺寸：{node.image.operationTrace.size}</span>
                <span>候选：{node.image.operationTrace.count} 张</span>
              </div>
              <div className="operation-trace-meta">
                {node.image.operationTrace.referenceImageHashes.map((hash, index) => (
                  <span key={hash}>引用图 {index + 1}：{hash.slice(0, 12)}</span>
                ))}
              </div>
              <textarea readOnly value={node.image.operationTrace.prompt} />
            </details>
          )}
          <div className="history-actions">
            <button className="button primary" onClick={() => handleReuse(node.image)}>
              <RotateCw size={16} />带回工作台
            </button>
            <a className="button" href={node.image.thumbnailUrl} download target="_blank" rel="noreferrer">
              <Download size={16} />下载
            </a>
          </div>
        </div>
      </article>
    );
  }


  const handleBatchRerunQualityReviews = useCallback(async () => {
    setQualityBatchRerunning(true);
    setError(null);
    try {
      const res = await fetch("/api/generated-images/quality-reviews/rerun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: images.map((image) => image.id), limit: 50 }),
      });
      const data = await res.json();
      if (data.success) {
        const submitted = Number(data.data?.summary?.submitted ?? 0);
        const skipped = Number(data.data?.summary?.skipped ?? 0);
        const failed = Number(data.data?.summary?.failed ?? 0);
        setError(`已提交补检 ${submitted} 张，跳过 ${skipped} 张，失败 ${failed} 张`);
        fetchImages();
      } else {
        setError(data.error?.message ?? "批量补检失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setQualityBatchRerunning(false);
    }
  }, [fetchImages, images]);

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
        </div>
        <div className="bulk-action-bar">
          <label className="check-row">
            <input type="checkbox" checked={allVisibleSelected} disabled={images.length === 0} onChange={handleToggleAllVisible} />
            全选当前筛选结果
          </label>
          <span className="muted">已选 {batchSelectedIds.size} 张</span>
          {qualityReviewEnabled && (
            <button className="button" disabled={images.length === 0 || qualityBatchRerunning} onClick={handleBatchRerunQualityReviews}>
              <ShieldCheck size={16} />{qualityBatchRerunning ? "补检中" : "补检异常质检"}
            </button>
          )}
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
            </div>
            <div className="history-card-body">
              <div className="history-title-row">
                <h3>{image.title}</h3>
                <span className={`status-chip ${image.status}`}>{image.status === "succeeded" ? "已完成" : image.status}</span>
              </div>
              <p className="muted">{image.templateName} · {image.width}x{image.height}</p>
              <div className="workflow-source-row">
                <span className="workflow-source-chip">来源：{getWorkflowSourceLabel(image)}</span>
                {(() => {
                  const tone = getBadgeTone(image.qualityBadge);
                  const label = getBadgeLabel(image.qualityBadge);
                  if (!tone || !label) return null;
                  return (
                    <span className={`quality-status-badge compact ${tone}`}>
                      <ShieldCheck size={12} />
                      {label}
                      {image.qualityBadge?.confidence !== undefined && image.qualityBadge.reviewStatus === "succeeded"
                        ? ` ${Math.round(image.qualityBadge.confidence * 100)}%`
                        : ""}
                    </span>
                  );
                })()}
              </div>
              {canRerunQualityReview(image.qualityBadge) && (
                <p className="muted">AI 质检只是辅助建议。可带回工作台调整，或在“更多”里重新质检。</p>
              )}
              <div className="tag-row">
                {image.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
              </div>
              <div className="history-actions">
                <button className="button primary" onClick={() => handleReuse(image)}>
                  <RotateCw size={16} />带回工作台
                </button>
                <details
                  className="more-actions"
                  open={openActionsId === image.id}
                  onToggle={(event) => setOpenActionsId(event.currentTarget.open ? image.id : null)}
                >
                  <summary className="button icon-button" title="更多操作" aria-label="更多操作">
                    <MoreHorizontal size={16} />更多
                  </summary>
                  <div className="more-actions-menu">
                    <button className="button" disabled={lineageLoadingId === image.id} onClick={() => handleOpenLineage(image.id)}>
                      <GitBranch size={16} />运行路径
                    </button>
                    {qualityReviewEnabled && canRerunQualityReview(image.qualityBadge) && (
                      <button className="button" disabled={qualityRerunId === image.id} onClick={() => handleRerunQualityReview(image.id)}>
                        <ShieldCheck size={16} />{qualityRerunId === image.id ? "提交中" : "重新质检"}
                      </button>
                    )}
                    <a className="button" href={image.thumbnailUrl} download target="_blank" rel="noreferrer" onClick={() => setOpenActionsId(null)}>
                      <Download size={16} />下载
                    </a>
                    <button className="button danger" disabled={recyclingId === image.id} onClick={() => handleRecycle(image.id)}>
                      <Trash2 size={16} />移入回收站
                    </button>
                  </div>
                </details>
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

      {lineageData && (
        <div className="lineage-overlay" onClick={() => setLineageData(null)}>
          <div className="lineage-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">工作流运行</p>
                <h2>运行路径</h2>
                <p className="muted">
                  这里按工作流视角解释这张图从哪里来：上一步输入、AI 生成的当前产物、同批候选，以及基于当前图继续优化产生的后续分支。
                </p>
                <p className="muted">
                  Run {lineageData.run.workflowRunId ?? "未知"} · Job {lineageData.job?.id ?? "未知"} · {lineageData.run.summaryText}
                </p>
                <p className="muted">
                  同批候选 {lineageData.summary.siblingCount + 1} 张 · 后续分支 {lineageData.summary.childCount} 张
                </p>
                {lineageData.sections.flatMap((section) => section.nodes).find((node) => node.role === "current")?.image.operationTrace && (
                  <p className="muted">
                    本次生图操作：{formatTraceSummary(lineageData.sections.flatMap((section) => section.nodes).find((node) => node.role === "current")!.image.operationTrace!)}
                  </p>
                )}
                {renderQualityReviewPanel()}
              </div>
              <button className="button" onClick={() => setLineageData(null)}>关闭</button>
            </div>
            <div className="lineage-sections">
              {lineageData.sections.map((section) => (
                <section className="lineage-section" key={section.key}>
                  <div className="lineage-section-head">
                    <div>
                      <h3>{section.title}</h3>
                      <p className="muted">{section.description}</p>
                    </div>
                    <span className="count-pill">{section.nodes.length} 张</span>
                  </div>
                  {section.nodes.length > 0 ? (
                    <div className="lineage-grid">
                      {section.nodes.map((node) => renderLineageCard(node))}
                    </div>
                  ) : (
                    <div className="lineage-empty">{section.emptyText}</div>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
