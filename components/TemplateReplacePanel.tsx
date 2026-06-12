"use client";

import { Check, ImagePlus, Loader2, RefreshCw, UploadCloud, WandSparkles } from "lucide-react";
import { useState } from "react";
import type { GeneratedImage, GenerationJob } from "@/lib/types";

type UploadedAsset = {
  name: string;
  url: string;
  thumbnailUrl: string;
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

export function TemplateReplacePanel() {
  const [productAsset, setProductAsset] = useState<UploadedAsset | null>(null);
  const [templateAsset, setTemplateAsset] = useState<UploadedAsset | null>(null);
  const [productNote, setProductNote] = useState("保留连咖啡产品包装、口味标识、品牌识别");
  const [templateNote, setTemplateNote] = useState("严格保留模板图构图、背景、文案、装饰和商品位置");
  const [uploading, setUploading] = useState<"product" | "template" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedbackSavingId, setFeedbackSavingId] = useState<number | null>(null);

  async function handleUpload(kind: "product" | "template", file?: File) {
    if (!file) return;
    setUploading(kind);
    setError(null);
    try {
      const asset = await uploadReference(file);
      if (kind === "product") setProductAsset(asset);
      else setTemplateAsset(asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(null);
    }
  }

  async function handleGenerate() {
    if (!productAsset || !templateAsset || generating) return;
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

  return (
    <div className="grid template-replace-page">
      <section className="panel template-replace-hero">
        <div>
          <p className="eyebrow">生产引擎模式</p>
          <h2>模板换产品</h2>
          <p className="muted">
            上传产品图和模板图，系统优先使用 OSS 公网 URL 通过 Grsai 的 urls 字段生成 4 张候选；目标是保留模板构图，只替换商品包装视觉。
          </p>
        </div>
        <button className="button primary" disabled={!productAsset || !templateAsset || generating} onClick={handleGenerate}>
          {generating ? <Loader2 size={16} className="spin" /> : <WandSparkles size={16} />}
          {generating ? "生成中" : "生成 4 张候选"}
        </button>
      </section>

      {error && <div className="alert error"><span>{error}</span><button onClick={() => setError(null)}>关闭</button></div>}

      <section className="grid template-replace-inputs">
        <UploadCard title="产品图" description="只提供包装视觉，不提供构图灵感。" asset={productAsset} uploading={uploading === "product"} onUpload={(file) => handleUpload("product", file)} />
        <UploadCard title="模板图" description="最终构图基准：背景、文案、装饰、商品位置都应保留。" asset={templateAsset} uploading={uploading === "template"} onUpload={(file) => handleUpload("template", file)} />
      </section>

      <section className="panel">
        <div className="panel-head"><h2>约束说明</h2><span className={`status-chip ${job?.status ?? "queued"}`}>{generating ? "生成中" : job?.status === "succeeded" ? "已生成" : "待生成"}</span></div>
        <div className="grid two-up">
          <label className="field"><span>产品约束</span><textarea className="textarea" value={productNote} onChange={(event) => setProductNote(event.target.value)} /></label>
          <label className="field"><span>模板约束</span><textarea className="textarea" value={templateNote} onChange={(event) => setTemplateNote(event.target.value)} /></label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>候选结果与反馈</h2><span className="count-pill">{images.length}/4</span></div>
        <div className="template-replace-results">
          {images.map((image) => {
            const currentFeedback = image.tags.find((tag) => tag.startsWith("feedback:"))?.replace("feedback:", "");
            return (
              <article className="candidate-card" key={image.id}>
                <div className="thumb-wrap"><img alt={image.title} src={image.thumbnailUrl} /></div>
                <div className="history-card-body">
                  <h3>{image.title}</h3>
                  <div className="feedback-row">
                    {feedbackOptions.map((option) => (
                      <button className={`feedback-button ${currentFeedback === option.key ? "active" : ""}`} disabled={feedbackSavingId === image.id} key={option.key} onClick={() => handleFeedback(image, option.key)}>
                        {currentFeedback === option.key && <Check size={13} />}{option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
          {!generating && images.length === 0 && <div className="empty-state"><ImagePlus size={26} /><p>上传产品图和模板图后，生成候选会出现在这里。</p></div>}
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
