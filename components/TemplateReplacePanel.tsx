"use client";

import { Check, Download, FolderOpen, ImagePlus, Loader2, RefreshCw, RotateCw, Square, Star, UploadCloud, WandSparkles } from "lucide-react";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GeneratedImage, GenerationJob } from "@/lib/types";

type LibraryTemplate = {
  id: number;
  name: string;
  thumbnailUrl: string;
};

type LibraryProduct = {
  id: number;
  name: string;
  thumbnailUrl: string;
};

type UploadedAsset = {
  name: string;
  url: string;
  thumbnailUrl: string;
};

type ProductRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RepaintDraft = {
  image: GeneratedImage;
  region: ProductRegion | null;
  instruction: string;
  referenceAsset: UploadedAsset | null;
};

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: { message: string };
};

const feedbackOptions = [
  { key: "product_wrong", label: "产品不对" },
  { key: "template_drift", label: "模板跑偏" },
  { key: "text_changed", label: "文案变了" },
  { key: "usable", label: "可用" },
] as const;

const optimizeDirectionOptions = [
  { key: "template_fidelity", label: "更像模板原图", note: "固定版式、文案、背景和区域外元素，只提升商品融合度。" },
  { key: "product_prominence", label: "产品更突出", note: "固定模板结构，小幅优化商品大小、清晰度和主体存在感。" },
  { key: "defect_fix", label: "修瑕疵", note: "固定当前最佳图，只修边缘、变形、文字污染和局部破坏。" },
] as const;

type OptimizeDirection = (typeof optimizeDirectionOptions)[number]["key"];

const candidateCountOptions = [1, 2, 3, 4] as const;

function getOptimizeDirectionLabel(direction: OptimizeDirection): string {
  return optimizeDirectionOptions.find((option) => option.key === direction)?.label ?? "继续优化";
}

async function uploadReference(file: File): Promise<UploadedAsset> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/references", { method: "POST", body: formData });
  const data = (await res.json()) as ApiResult<{ image: UploadedAsset }>;
  if (!res.ok || !data.success || !data.data?.image.url) {
    throw new Error(data.error?.message ?? "图片上传失败");
  }
  return data.data.image;
}

function getPointerRatio(event: MouseEvent<HTMLDivElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function buildRegion(start: { x: number; y: number }, end: { x: number; y: number }): ProductRegion {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    width: Number(Math.abs(end.x - start.x).toFixed(4)),
    height: Number(Math.abs(end.y - start.y).toFixed(4)),
  };
}

function isUsableRegion(region: ProductRegion | null): region is ProductRegion {
  return Boolean(region && region.width >= 0.03 && region.height >= 0.03);
}

export function TemplateReplacePanel() {
  const [productAsset, setProductAsset] = useState<UploadedAsset | null>(null);
  const [templateAsset, setTemplateAsset] = useState<UploadedAsset | null>(null);
  const [productRegion, setProductRegion] = useState<ProductRegion | null>(null);
  const [regionStart, setRegionStart] = useState<{ x: number; y: number } | null>(null);
  const [productNote, setProductNote] = useState("保留连咖啡产品包装、口味标识、品牌识别");
  const [templateNote, setTemplateNote] = useState("严格保留模板图构图、背景、文案、装饰和商品位置");
  const [customInstruction, setCustomInstruction] = useState("保证输出图里产品数量和输入产品图一致");
  const [candidateCount, setCandidateCount] = useState(3);
  const [optimizeDirection, setOptimizeDirection] = useState<OptimizeDirection>("template_fidelity");
  const [parentImage, setParentImage] = useState<GeneratedImage | null>(null);
  const [uploading, setUploading] = useState<"product" | "template" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedbackSavingId, setFeedbackSavingId] = useState<number | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<number, string>>({});
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [repaintDraft, setRepaintDraft] = useState<RepaintDraft | null>(null);
  const [repaintRegionStart, setRepaintRegionStart] = useState<{ x: number; y: number } | null>(null);
  const [repainting, setRepainting] = useState(false);
  const [repaintReferenceUploading, setRepaintReferenceUploading] = useState(false);
  const [libraryTemplates, setLibraryTemplates] = useState<LibraryTemplate[]>([]);
  const [productLibraryImages, setProductLibraryImages] = useState<LibraryProduct[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [productLibraryLoading, setProductLibraryLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await fetch("/api/template-library");
      const data = (await res.json()) as ApiResult<{ templates: LibraryTemplate[] }>;
      if (data.success && data.data) setLibraryTemplates(data.data.templates);
    } catch { /* ignore */ }
    finally { setLibraryLoading(false); }
  }, []);


  const fetchProductLibrary = useCallback(async () => {
    setProductLibraryLoading(true);
    try {
      const res = await fetch("/api/product-library");
      const data = (await res.json()) as ApiResult<{ products: LibraryProduct[] }>;
      if (data.success && data.data) setProductLibraryImages(data.data.products);
    } catch { /* ignore */ }
    finally { setProductLibraryLoading(false); }
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);
  useEffect(() => { fetchProductLibrary(); }, [fetchProductLibrary]);

  useEffect(() => {
    if (!generating) {
      setElapsedSeconds(0);
      return;
    }
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  async function handleUpload(kind: "product" | "template", file?: File) {
    if (!file) return;
    setUploading(kind);
    setError(null);
    try {
      if (kind === "product") {
        // Upload to product library, then auto-select
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/product-library", { method: "POST", body: formData });
        const data = (await res.json()) as ApiResult<{ product: LibraryProduct }>;
        if (!res.ok || !data.success || !data.data?.product) {
          throw new Error(data.error?.message ?? "产品图上传失败");
        }
        setProductAsset({ name: data.data.product.name, url: data.data.product.thumbnailUrl, thumbnailUrl: data.data.product.thumbnailUrl });
        fetchProductLibrary();
      } else {
        const asset = await uploadReference(file);
        setTemplateAsset(asset);
        setParentImage(null);
        setProductRegion(null);
        setRegionStart(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(null);
    }
  }

  function handleRegionPointerDown(event: MouseEvent<HTMLDivElement>) {
    if (!templateAsset) return;
    const point = getPointerRatio(event);
    setRegionStart(point);
    setProductRegion({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function handleRegionPointerMove(event: MouseEvent<HTMLDivElement>) {
    if (!regionStart) return;
    setProductRegion(buildRegion(regionStart, getPointerRatio(event)));
  }

  function handleRegionPointerUp(event: MouseEvent<HTMLDivElement>) {
    if (!regionStart) return;
    const nextRegion = buildRegion(regionStart, getPointerRatio(event));
    setProductRegion(isUsableRegion(nextRegion) ? nextRegion : null);
    setRegionStart(null);
  }

  async function handleGenerate() {
    if (!productAsset || !templateAsset || !isUsableRegion(productRegion) || generating) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setGenerating(true);
    setElapsedSeconds(0);
    setError(null);
    setImages([]);
    setJob({ id: "pending", status: "running", templateId: 91001, candidateCount, createdAt: new Date().toISOString() });
    try {
      const res = await fetch("/api/generation-jobs", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: 91001,
          templateName: "模板换产品生产模式",
          candidateCount,
          exportSize: { name: "tmall_main", width: 800, height: 800 },
          inputs: {
            mode: "template_replace",
            productImageUrl: productAsset.url,
            templateImageUrl: templateAsset.url,
            productRegion,
            productNote,
            templateNote,
            customInstruction,
            optimizeDirection,
            optimizeDirectionLabel: getOptimizeDirectionLabel(optimizeDirection),
            parentImageId: parentImage?.id,
            parentJobId: parentImage?.jobId,
            parentImageUrl: parentImage?.thumbnailUrl,
          },
        }),
      });
      const data = (await res.json()) as ApiResult<{ job: GenerationJob; images: GeneratedImage[] }>;
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error?.message ?? "模板换产品生成失败");
      }
      setJob(data.data.job);
      setImages(data.data.images);
      if (data.data.job.status === "failed") setError("AI 生成失败，请换图或稍后重试。");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setJob((prev) => prev ? { ...prev, status: "failed" } : prev);
        setError("已停止等待。本次生成可能仍在后台完成，稍后可到历史成图查看。");
      } else {
        setJob((prev) => prev ? { ...prev, status: "failed" } : prev);
        setError(err instanceof Error ? err.message : "生成失败");
      }
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setGenerating(false);
    }
  }

  function handleCancelGenerating() {
    abortControllerRef.current?.abort();
  }

  async function handleFeedback(image: GeneratedImage, feedback: string) {
    setFeedbackSavingId(image.id);
    setError(null);
    try {
      const res = await fetch(`/api/generated-images/${image.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      const data = (await res.json()) as ApiResult<{ image: GeneratedImage }>;
      if (!res.ok || !data.success || !data.data?.image) {
        throw new Error(data.error?.message ?? "反馈保存失败");
      }
      setImages((items) => items.map((item) => item.id === image.id ? data.data!.image : item));
      setFeedbackDrafts((drafts) => ({ ...drafts, [image.id]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "反馈保存失败");
    } finally {
      setFeedbackSavingId(null);
    }
  }

  async function handleSelectFinal(image: GeneratedImage) {
    setSelectingId(image.id);
    setError(null);
    try {
      const res = await fetch(`/api/generated-images/${image.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: true }),
      });
      const data = (await res.json()) as ApiResult<{ image: GeneratedImage }>;
      if (!res.ok || !data.success || !data.data?.image) {
        throw new Error(data.error?.message ?? "最终图保存失败");
      }
      setImages((items) => items.map((item) => item.id === image.id ? data.data!.image : { ...item, selected: false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "最终图保存失败");
    } finally {
      setSelectingId(null);
    }
  }

  function handleContinueOptimize(image: GeneratedImage, direction: OptimizeDirection = optimizeDirection) {
    setParentImage(image);
    setOptimizeDirection(direction);
    setTemplateAsset({ name: image.title, url: image.thumbnailUrl, thumbnailUrl: image.thumbnailUrl });
    setRegionStart(null);
    setJob(null);
    setImages([]);
    setTemplateNote(`${getOptimizeDirectionLabel(direction)}：以上一轮选中候选作为当前最佳基准图，固定版式、文案、背景和区域外元素，只围绕框选商品区域做小步变化；必须保留可回退基准。`);
  }

  function openPartialRepaint(image: GeneratedImage) {
    setRepaintDraft({ image, region: null, instruction: "参考上传图片，把框选区域内绘制偏差的内容物修正准确，其他区域保持不变", referenceAsset: null });
    setRepaintRegionStart(null);
    setError(null);
  }

  function updateRepaintDraft(next: Partial<Omit<RepaintDraft, "image">>) {
    setRepaintDraft((current) => current ? { ...current, ...next } : current);
  }

  async function handleRepaintReferenceUpload(file?: File) {
    if (!file) return;
    setRepaintReferenceUploading(true);
    setError(null);
    try {
      const asset = await uploadReference(file);
      updateRepaintDraft({ referenceAsset: asset });
    } catch (err) {
      setError(err instanceof Error ? err.message : "参考图上传失败");
    } finally {
      setRepaintReferenceUploading(false);
    }
  }

  function handleRepaintPointerDown(event: MouseEvent<HTMLDivElement>) {
    if (!repaintDraft) return;
    const point = getPointerRatio(event);
    setRepaintRegionStart(point);
    updateRepaintDraft({ region: { x: point.x, y: point.y, width: 0, height: 0 } });
  }

  function handleRepaintPointerMove(event: MouseEvent<HTMLDivElement>) {
    if (!repaintDraft || !repaintRegionStart) return;
    updateRepaintDraft({ region: buildRegion(repaintRegionStart, getPointerRatio(event)) });
  }

  function handleRepaintPointerUp(event: MouseEvent<HTMLDivElement>) {
    if (!repaintDraft || !repaintRegionStart) return;
    const nextRegion = buildRegion(repaintRegionStart, getPointerRatio(event));
    updateRepaintDraft({ region: isUsableRegion(nextRegion) ? nextRegion : null });
    setRepaintRegionStart(null);
  }

  async function handlePartialRepaintSubmit() {
    if (!repaintDraft || !isUsableRegion(repaintDraft.region) || repainting) return;
    setRepainting(true);
    setError(null);
    try {
      const res = await fetch("/api/generation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: repaintDraft.image.templateId || 91002,
          templateName: `${repaintDraft.image.title} 局部重绘`,
          candidateCount: 1,
          exportSize: { name: "tmall_main", width: repaintDraft.image.width || 800, height: repaintDraft.image.height || 800 },
          inputs: {
            mode: "partial_repaint",
            referenceImageUrl: repaintDraft.image.thumbnailUrl,
            repaintReferenceImageUrl: repaintDraft.referenceAsset?.url,
            repaintReferenceName: repaintDraft.referenceAsset?.name,
            repaintRegion: repaintDraft.region,
            repaintInstruction: repaintDraft.instruction,
            parentImageId: repaintDraft.image.id,
            parentJobId: repaintDraft.image.jobId,
          },
        }),
      });
      const data = (await res.json()) as ApiResult<{ job: GenerationJob; images: GeneratedImage[] }>;
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error?.message ?? "局部重绘失败");
      }
      setJob(data.data.job);
      setImages((current) => [...data.data!.images, ...current]);
      setParentImage(repaintDraft.image);
      setRepaintDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "局部重绘失败");
    } finally {
      setRepainting(false);
    }
  }

  function handlePickFromLibrary(t: LibraryTemplate) {
    setTemplateAsset({ name: t.name, url: t.thumbnailUrl, thumbnailUrl: t.thumbnailUrl });
    setParentImage(null);
    setProductRegion(null);
    setRegionStart(null);
    setShowLibraryPicker(false);
  }

  function handlePickProduct(product: LibraryProduct) {
    setProductAsset({ name: product.name, url: product.thumbnailUrl, thumbnailUrl: product.thumbnailUrl });
    setShowProductPicker(false);
  }

  async function handleUploadProductToLibrary(file?: File) {
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/product-library", { method: "POST", body: formData });
      const data = (await res.json()) as ApiResult<{ product: LibraryProduct }>;
      if (data.success && data.data?.product) {
        // Auto-select the just-uploaded product
        handlePickProduct(data.data.product);
        // Refresh list
        fetchProductLibrary();
      }
    } catch { /* ignore */ }
  }

  const canGenerate = Boolean(productAsset && templateAsset && isUsableRegion(productRegion) && !generating);
  const elapsedText = elapsedSeconds < 60 ? `${elapsedSeconds} 秒` : `${Math.floor(elapsedSeconds / 60)} 分 ${elapsedSeconds % 60} 秒`;
  const currentStep = !productAsset || !templateAsset ? 1 : !isUsableRegion(productRegion) ? 2 : generating ? 3 : images.length ? 4 : 2;

  return (
    <div className="grid template-replace-page">
      <section className="panel template-replace-hero">
        <div>
          <p className="eyebrow">生产引擎模式</p>
          <h2>模板换产品</h2>
          <p className="muted">
            上传产品图和模板图，先框选模板里的商品区域，再按选择生成 1~4 张候选；当前是区域约束版，目标是只替换框选商品，尽量不动区域外内容。
          </p>
        </div>
        <div className="generate-actions">
          <label className="candidate-count-control">
            <span>抽卡次数</span>
            <select className="select" value={candidateCount} disabled={generating} onChange={(event) => setCandidateCount(Number(event.target.value))}>
              {candidateCountOptions.map((count) => <option key={count} value={count}>{count} 张</option>)}
            </select>
          </label>
          <button className="button primary" disabled={!canGenerate} onClick={handleGenerate}>
            {generating ? <Loader2 size={16} className="spin" /> : <WandSparkles size={16} />}
            {generating ? `生成中 ${elapsedText}` : `生成 ${candidateCount} 张候选`}
          </button>
          {generating && (
            <button className="button" onClick={handleCancelGenerating}>
              <Square size={14} /> 停止等待
            </button>
          )}
        </div>
      </section>

      <section className="panel template-progress-panel">
        <div className="template-progress-step active"><span>1</span>上传产品图 / 模板图</div>
        <div className={`template-progress-step ${currentStep >= 2 ? "active" : ""}`}><span>2</span>框选模板商品区域</div>
        <div className={`template-progress-step ${currentStep >= 3 ? "active" : ""}`}><span>3</span>生成 {candidateCount} 张候选</div>
        <div className={`template-progress-step ${currentStep >= 4 ? "active" : ""}`}><span>4</span>标记反馈 / 下载 / 继续优化</div>
      </section>

      {error && <div className="alert error"><span>{error}</span><button onClick={() => setError(null)}>关闭</button></div>}

      <section className="grid template-replace-inputs">
        <UploadCard title="产品图" description="建议白底、清晰正面、包装完整；这里只提供商品包装视觉，不提供构图。" asset={productAsset} uploading={uploading === "product"} onUpload={(file) => handleUpload("product", file)} extraActions={
          <button className="button" onClick={() => setShowProductPicker(true)} title="从产品库选择">
            <FolderOpen size={16} /> 从产品库选
          </button>
        } />
        <UploadCard title="模板图" description="建议商品区域明确、文案清晰；后续会优先保留区域外背景、文案和装饰。" asset={templateAsset} uploading={uploading === "template"} onUpload={(file) => handleUpload("template", file)} extraActions={
          <button className="button" onClick={() => setShowLibraryPicker(true)} title="从模板库选择">
            <FolderOpen size={16} /> 从模板库选
          </button>
        } />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>模板商品区域</h2>
            <p className="muted">在模板图上拖拽框出原商品位置。框越准，模型越知道该替换哪里。</p>
          </div>
          <button className="button" disabled={!productRegion} onClick={() => setProductRegion(null)}>重选区域</button>
        </div>
        {templateAsset ? (
          <div className="region-picker" onMouseDown={handleRegionPointerDown} onMouseMove={handleRegionPointerMove} onMouseUp={handleRegionPointerUp} onMouseLeave={() => setRegionStart(null)}>
            <img src={templateAsset.thumbnailUrl} alt={templateAsset.name} draggable={false} />
            {productRegion && (
              <div
                className={`region-box ${isUsableRegion(productRegion) ? "valid" : ""}`}
                style={{ left: `${productRegion.x * 100}%`, top: `${productRegion.y * 100}%`, width: `${productRegion.width * 100}%`, height: `${productRegion.height * 100}%` }}
              />
            )}
          </div>
        ) : (
          <div className="empty-state"><ImagePlus size={24} /><p>先上传模板图，再框选商品区域。</p></div>
        )}
        {productRegion && <p className="muted region-readout">区域：x {Math.round(productRegion.x * 100)}% / y {Math.round(productRegion.y * 100)}% / 宽 {Math.round(productRegion.width * 100)}% / 高 {Math.round(productRegion.height * 100)}%</p>}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>约束说明</h2><span className={`status-chip ${job?.status ?? "queued"}`}>{generating ? "生成中" : job?.status === "succeeded" ? "已生成" : "待生成"}</span></div>
        {parentImage && (
          <div className="iteration-lock-banner">
            <Check size={16} />
            当前基准：候选 #{parentImage.id}。本轮会记录父图和优化方向，生成差了可回退到这张。
          </div>
        )}
        <div className="optimize-direction-grid">
          {optimizeDirectionOptions.map((option) => (
            <button
              className={`optimize-direction-card ${optimizeDirection === option.key ? "active" : ""}`}
              key={option.key}
              type="button"
              onClick={() => setOptimizeDirection(option.key)}
            >
              <strong>{option.label}</strong>
              <span>{option.note}</span>
            </button>
          ))}
        </div>
        <div className="grid two-up">
          <label className="field"><span>产品约束</span><textarea className="textarea" value={productNote} onChange={(event) => setProductNote(event.target.value)} /></label>
          <label className="field"><span>模板约束</span><textarea className="textarea" value={templateNote} onChange={(event) => setTemplateNote(event.target.value)} /></label>
          <label className="field"><span>本轮补充指令</span><textarea className="textarea" value={customInstruction} onChange={(event) => setCustomInstruction(event.target.value)} placeholder="例如：保证输出图里产品数量和输入产品图一致；不要把单件产品复制成两件。" /></label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>候选结果与生产动作</h2><span className="count-pill">{images.length}/{job?.candidateCount ?? candidateCount}</span></div>
        <div className="template-replace-results">
          {images.map((image) => {
            const currentFeedback = image.tags.find((tag) => tag.startsWith("feedback:"))?.replace("feedback:", "");
            return (
              <article className="candidate-card" key={image.id}>
                <div className="thumb-wrap"><img alt={image.title} src={image.thumbnailUrl} />{image.selected && <span className="selected-badge"><Check size={14} />最终图</span>}</div>
                <div className="history-card-body">
                  <h3>{image.title}</h3>
                  <div className="card-action-section">
                    <span className="action-section-label">用户标签</span>
                    <div className="feedback-row">
                      {feedbackOptions.map((option) => (
                      <button className={`feedback-button ${currentFeedback === option.key ? "active" : ""}`} disabled={feedbackSavingId === image.id} key={option.key} onClick={() => handleFeedback(image, option.key)}>
                        {currentFeedback === option.key && <Check size={13} />}{option.label}
                      </button>
                      ))}
                    </div>
                    <form className="feedback-custom-row" onSubmit={(event) => { event.preventDefault(); const value = feedbackDrafts[image.id]?.trim(); if (value) void handleFeedback(image, value); }}>
                      <input
                        className="input"
                        maxLength={24}
                        placeholder="自定义：比例失真 / 数量错误"
                        value={feedbackDrafts[image.id] ?? ""}
                        onChange={(event) => setFeedbackDrafts((drafts) => ({ ...drafts, [image.id]: event.target.value }))}
                      />
                      <button className="button" disabled={feedbackSavingId === image.id || !feedbackDrafts[image.id]?.trim()} type="submit">添加</button>
                    </form>
                  </div>
                  <div className="history-actions compact-actions">
                    <button className="button" disabled={selectingId === image.id} onClick={() => handleSelectFinal(image)}><Star size={16} />最终图</button>
                    <a className="button" href={image.thumbnailUrl} download target="_blank" rel="noreferrer"><Download size={16} />下载</a>
                  </div>
                  <div className="card-action-section">
                    <span className="action-section-label">继续优化</span>
                    <div className="optimize-chip-row">
                      <button className="optimize-chip" onClick={() => openPartialRepaint(image)}><WandSparkles size={14} />局部重绘</button>
                      {optimizeDirectionOptions.map((option) => (
                        <button className="optimize-chip" key={option.key} onClick={() => handleContinueOptimize(image, option.key)}><RotateCw size={14} />{option.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {!generating && images.length === 0 && <div className="empty-state"><ImagePlus size={26} /><p>上传产品图、模板图并框选商品区域后，候选会出现在这里。</p></div>}
          {generating && (
            <div className="empty-state generating-state">
              <RefreshCw size={26} className="spin" />
              <p>正在生成 {candidateCount} 张候选，已等待 {elapsedText}</p>
              <span>生成图耗时可能较长；不想等可以先停止等待，稍后到历史成图查看。</span>
              <button className="button" onClick={handleCancelGenerating}><Square size={14} />停止等待</button>
            </div>
          )}
        </div>
      </section>
      {repaintDraft && (
        <div className="template-picker-overlay" onClick={() => !repainting && setRepaintDraft(null)}>
          <div className="template-picker-modal partial-repaint-modal" onClick={(event) => event.stopPropagation()}>
            <div className="partial-repaint-head">
              <div>
                <p className="eyebrow">局部重绘</p>
                <h3>框选要修的区域</h3>
                <p className="muted">只改框选区域；可上传准确参考图来修正赠品、内容物或局部元素。</p>
              </div>
              <button className="button" disabled={repainting} onClick={() => setRepaintDraft(null)}>关闭</button>
            </div>
            <div className="partial-repaint-layout">
              <div
                className="partial-repaint-canvas"
                onMouseDown={handleRepaintPointerDown}
                onMouseMove={handleRepaintPointerMove}
                onMouseUp={handleRepaintPointerUp}
                onMouseLeave={() => setRepaintRegionStart(null)}
              >
                <img src={repaintDraft.image.thumbnailUrl} alt={repaintDraft.image.title} draggable={false} />
                {repaintDraft.region && (
                  <div
                    className={`region-box ${isUsableRegion(repaintDraft.region) ? "valid" : ""}`}
                    style={{
                      left: `${repaintDraft.region.x * 100}%`,
                      top: `${repaintDraft.region.y * 100}%`,
                      width: `${repaintDraft.region.width * 100}%`,
                      height: `${repaintDraft.region.height * 100}%`,
                    }}
                  />
                )}
              </div>
              <div className="partial-repaint-form">
                <label className="field">
                  <span>准确参考图（可选）</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={repainting || repaintReferenceUploading}
                    onChange={(event) => handleRepaintReferenceUpload(event.target.files?.[0])}
                  />
                  {repaintDraft.referenceAsset ? (
                    <div className="repaint-reference-preview">
                      <img src={repaintDraft.referenceAsset.thumbnailUrl} alt={repaintDraft.referenceAsset.name} />
                      <div>
                        <strong>{repaintDraft.referenceAsset.name}</strong>
                        <span>生成时会作为第 2 张参考图，只约束框选区域。</span>
                      </div>
                      <button className="button" disabled={repainting} onClick={() => updateRepaintDraft({ referenceAsset: null })}>清除</button>
                    </div>
                  ) : (
                    <p className="muted">例如上传准确赠品图，让模型把框选内绘制偏差的赠品修正为参考图形态。</p>
                  )}
                  {repaintReferenceUploading && <p className="muted">参考图上传中...</p>}
                </label>
                <label className="field">
                  <span>修图要求</span>
                  <textarea
                    className="textarea"
                    value={repaintDraft.instruction}
                    onChange={(event) => updateRepaintDraft({ instruction: event.target.value })}
                    placeholder="例如：参考上传图，把框选区域里的赠品画准确；只调整这个赠品，不改变主品和背景"
                  />
                </label>
                {repaintDraft.region && (
                  <p className="muted region-readout">区域：x {Math.round(repaintDraft.region.x * 100)}% / y {Math.round(repaintDraft.region.y * 100)}% / 宽 {Math.round(repaintDraft.region.width * 100)}% / 高 {Math.round(repaintDraft.region.height * 100)}%</p>
                )}
                <div className="partial-repaint-actions">
                  <button className="button" disabled={repainting} onClick={() => updateRepaintDraft({ region: null })}>重选区域</button>
                  <button className="button primary" disabled={repainting || !isUsableRegion(repaintDraft.region) || !repaintDraft.instruction.trim()} onClick={handlePartialRepaintSubmit}>
                    <WandSparkles size={16} />{repainting ? "重绘中" : "生成局部重绘"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProductPicker && (
        <div className="template-picker-overlay" onClick={() => setShowProductPicker(false)}>
          <div className="template-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>从产品库选择</h3>
              <label className="button file-button" style={{ fontSize: 13 }}>
                <UploadCloud size={14} /> 上传新产品
                <input type="file" accept="image/*" onChange={(e) => handleUploadProductToLibrary(e.target.files?.[0])} />
              </label>
            </div>
            {productLibraryLoading ? (
              <div className="template-picker-empty">加载中...</div>
            ) : productLibraryImages.length === 0 ? (
              <div className="template-picker-empty">
                产品库为空。点击右上方「上传新产品」添加产品图。
              </div>
            ) : (
              <div className="template-picker-grid">
                {productLibraryImages.map((p) => (
                  <div key={p.id} className="template-picker-item" onClick={() => handlePickProduct(p)}>
                    <div className="thumb-wrap"><img src={p.thumbnailUrl} alt={p.name} /></div>
                    <p>{p.name}</p>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button className="button" onClick={() => setShowProductPicker(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {showLibraryPicker && (
        <div className="template-picker-overlay" onClick={() => setShowLibraryPicker(false)}>
          <div className="template-picker-modal" onClick={(e) => e.stopPropagation()}>
            <h3>从模板库选择</h3>
            {libraryLoading ? (
              <div className="template-picker-empty">加载中...</div>
            ) : libraryTemplates.length === 0 ? (
              <div className="template-picker-empty">
                模板库为空。请先到「模板库」页上传模板图。
              </div>
            ) : (
              <div className="template-picker-grid">
                {libraryTemplates.map((t) => (
                  <div key={t.id} className="template-picker-item" onClick={() => handlePickFromLibrary(t)}>
                    <div className="thumb-wrap"><img src={t.thumbnailUrl} alt={t.name} /></div>
                    <p>{t.name}</p>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button className="button" onClick={() => setShowLibraryPicker(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadCard({ title, description, asset, uploading, onUpload, extraActions }: { title: string; description: string; asset: UploadedAsset | null; uploading: boolean; onUpload: (file?: File) => void; extraActions?: React.ReactNode }) {
  return (
    <article className="panel upload-card">
      <div className="panel-head">
        <h2>{title}</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {extraActions}
          <label className="button file-button"><UploadCloud size={16} />{uploading ? "上传中" : "上传图片"}<input type="file" accept="image/*" disabled={uploading} onChange={(event) => onUpload(event.target.files?.[0])} /></label>
        </div>
      </div>
      <p className="muted">{description}</p>
      {asset ? <div className="upload-preview"><img src={asset.thumbnailUrl} alt={asset.name} /><span>{asset.name}</span></div> : <div className="empty-state"><ImagePlus size={24} /><p>请选择图片</p></div>}
    </article>
  );
}
