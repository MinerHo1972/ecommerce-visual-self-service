"use client";

import { Check, Download, ImagePlus, Loader2, RefreshCw, RotateCw, Star, UploadCloud, WandSparkles } from "lucide-react";
import type { MouseEvent } from "react";
import { useState } from "react";
import type { GeneratedImage, GenerationJob } from "@/lib/types";

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
  const [uploading, setUploading] = useState<"product" | "template" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedbackSavingId, setFeedbackSavingId] = useState<number | null>(null);
  const [selectingId, setSelectingId] = useState<number | null>(null);

  async function handleUpload(kind: "product" | "template", file?: File) {
    if (!file) return;
    setUploading(kind);
    setError(null);
    try {
      const asset = await uploadReference(file);
      if (kind === "product") {
        setProductAsset(asset);
      } else {
        setTemplateAsset(asset);
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
    setGenerating(true);
    setError(null);
    setImages([]);
    setJob({ id: "pending", status: "running", templateId: 91001, candidateCount: 4, createdAt: new Date().toISOString() });
    try {
      const res = await fetch("/api/generation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: 91001,
          templateName: "模板换产品生产模式",
          candidateCount: 4,
          exportSize: { name: "tmall_main", width: 800, height: 800 },
          inputs: {
            mode: "template_replace",
            productImageUrl: productAsset.url,
            templateImageUrl: templateAsset.url,
            productRegion,
            productNote,
            templateNote,
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
      setJob((prev) => prev ? { ...prev, status: "failed" } : prev);
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(false);
    }
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

  function handleContinueOptimize(image: GeneratedImage) {
    setTemplateAsset({ name: image.title, url: image.thumbnailUrl, thumbnailUrl: image.thumbnailUrl });
    setProductRegion(null);
    setRegionStart(null);
    setJob(null);
    setImages([]);
    setTemplateNote("以上一轮候选作为新模板，只在框选商品区域内继续优化，区域外保持不变");
  }

  const canGenerate = Boolean(productAsset && templateAsset && isUsableRegion(productRegion) && !generating);
  const currentStep = !productAsset || !templateAsset ? 1 : !isUsableRegion(productRegion) ? 2 : generating ? 3 : images.length ? 4 : 2;

  return (
    <div className="grid template-replace-page">
      <section className="panel template-replace-hero">
        <div>
          <p className="eyebrow">生产引擎模式</p>
          <h2>模板换产品</h2>
          <p className="muted">
            上传产品图和模板图，先框选模板里的商品区域，再生成 4 张候选；当前是区域约束版，目标是只替换框选商品，尽量不动区域外内容。
          </p>
        </div>
        <button className="button primary" disabled={!canGenerate} onClick={handleGenerate}>
          {generating ? <Loader2 size={16} className="spin" /> : <WandSparkles size={16} />}
          {generating ? "生成中" : "生成 4 张候选"}
        </button>
      </section>

      <section className="panel template-progress-panel">
        <div className="template-progress-step active"><span>1</span>上传产品图 / 模板图</div>
        <div className={`template-progress-step ${currentStep >= 2 ? "active" : ""}`}><span>2</span>框选模板商品区域</div>
        <div className={`template-progress-step ${currentStep >= 3 ? "active" : ""}`}><span>3</span>生成 4 张候选</div>
        <div className={`template-progress-step ${currentStep >= 4 ? "active" : ""}`}><span>4</span>标记反馈 / 下载 / 继续优化</div>
      </section>

      {error && <div className="alert error"><span>{error}</span><button onClick={() => setError(null)}>关闭</button></div>}

      <section className="grid template-replace-inputs">
        <UploadCard title="产品图" description="建议白底、清晰正面、包装完整；这里只提供商品包装视觉，不提供构图。" asset={productAsset} uploading={uploading === "product"} onUpload={(file) => handleUpload("product", file)} />
        <UploadCard title="模板图" description="建议商品区域明确、文案清晰；后续会优先保留区域外背景、文案和装饰。" asset={templateAsset} uploading={uploading === "template"} onUpload={(file) => handleUpload("template", file)} />
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
        <div className="grid two-up">
          <label className="field"><span>产品约束</span><textarea className="textarea" value={productNote} onChange={(event) => setProductNote(event.target.value)} /></label>
          <label className="field"><span>模板约束</span><textarea className="textarea" value={templateNote} onChange={(event) => setTemplateNote(event.target.value)} /></label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>候选结果与生产动作</h2><span className="count-pill">{images.length}/4</span></div>
        <div className="template-replace-results">
          {images.map((image) => {
            const currentFeedback = image.tags.find((tag) => tag.startsWith("feedback:"))?.replace("feedback:", "");
            return (
              <article className="candidate-card" key={image.id}>
                <div className="thumb-wrap"><img alt={image.title} src={image.thumbnailUrl} />{image.selected && <span className="selected-badge"><Check size={14} />最终图</span>}</div>
                <div className="history-card-body">
                  <h3>{image.title}</h3>
                  <div className="feedback-row">
                    {feedbackOptions.map((option) => (
                      <button className={`feedback-button ${currentFeedback === option.key ? "active" : ""}`} disabled={feedbackSavingId === image.id} key={option.key} onClick={() => handleFeedback(image, option.key)}>
                        {currentFeedback === option.key && <Check size={13} />}{option.label}
                      </button>
                    ))}
                  </div>
                  <div className="history-actions">
                    <button className="button" disabled={selectingId === image.id} onClick={() => handleSelectFinal(image)}><Star size={16} />选为最终图</button>
                    <a className="button" href={image.thumbnailUrl} download target="_blank" rel="noreferrer"><Download size={16} />下载原图</a>
                    <button className="button" onClick={() => handleContinueOptimize(image)}><RotateCw size={16} />继续优化</button>
                  </div>
                </div>
              </article>
            );
          })}
          {!generating && images.length === 0 && <div className="empty-state"><ImagePlus size={26} /><p>上传产品图、模板图并框选商品区域后，候选会出现在这里。</p></div>}
          {generating && <div className="empty-state"><RefreshCw size={26} className="spin" /><p>正在生成 4 张候选，请稍候...</p></div>}
        </div>
      </section>
    </div>
  );
}

function UploadCard({ title, description, asset, uploading, onUpload }: { title: string; description: string; asset: UploadedAsset | null; uploading: boolean; onUpload: (file?: File) => void }) {
  return (
    <article className="panel upload-card">
      <div className="panel-head"><h2>{title}</h2><label className="button file-button"><UploadCloud size={16} />{uploading ? "上传中" : "上传图片"}<input type="file" accept="image/*" disabled={uploading} onChange={(event) => onUpload(event.target.files?.[0])} /></label></div>
      <p className="muted">{description}</p>
      {asset ? <div className="upload-preview"><img src={asset.thumbnailUrl} alt={asset.name} /><span>{asset.name}</span></div> : <div className="empty-state"><ImagePlus size={24} /><p>请选择图片</p></div>}
    </article>
  );
}
