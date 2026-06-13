"use client";

import { BookOpen, Boxes, Check, FileText, History, LayoutDashboard, Package, RotateCw, Search, Settings, SlidersHorizontal, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { CommonOperationsPanel } from "@/components/CommonOperationsPanel";
import { GeneratedImageHistory } from "@/components/GeneratedImageHistory";
import { ProductLibraryPanel } from "@/components/ProductLibraryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TemplateLibraryPanel } from "@/components/TemplateLibraryPanel";
import { TemplatePreview } from "@/components/TemplatePreview";
import { TemplateReplacePanel } from "@/components/TemplateReplacePanel";
import { UserGuidePanel } from "@/components/UserGuidePanel";
import { sampleLayerTemplates } from "@/lib/sample-data";
import type { FocusArea, GeneratedImage, GenerationJob, LayerTemplate, RenderInputs } from "@/lib/types";

const focusAreaPresets: { label: string; value: FocusArea | undefined }[] = [
  { label: "主体偏左", value: { x: 0.05, y: 0.1, width: 0.55, height: 0.8 } },
  { label: "主体居中", value: { x: 0.225, y: 0.1, width: 0.55, height: 0.8 } },
  { label: "主体偏右", value: { x: 0.4, y: 0.1, width: 0.55, height: 0.8 } },
  { label: "无（默认居中裁切）", value: undefined },
];

const navItems = [
  { key: "workspace", label: "运营自助台", icon: LayoutDashboard },
  { key: "templateReplace", label: "模板换产品", icon: Boxes },
  { key: "products", label: "产品库", icon: Package },
  { key: "templates", label: "模板库", icon: FileText },
  { key: "history", label: "历史成图", icon: History },
  { key: "operations", label: "常用操作", icon: SlidersHorizontal },
  { key: "guide", label: "使用手册", icon: BookOpen },
  { key: "settings", label: "设置", icon: Settings }
] as const;

function stringifyInputValue(value: RenderInputs[string]) {
  if (typeof value !== "string") return JSON.stringify(value ?? null);
  return value.startsWith("data:") ? "[uploaded-image]" : value;
}

function buildParamSignature(templateId: number, sizeName: string, inputs: RenderInputs) {
  const entries = Object.entries(inputs)
    .map(([key, value]) => [key, stringifyInputValue(value as RenderInputs[string])])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({ templateId, sizeName, entries });
}

function summarizeInputs(inputs: RenderInputs) {
  const text = [inputs.title, inputs.subtitle, inputs.price, inputs.badge]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .join(" / ");
  return text || "暂无文字参数";
}

function TemplateCard({ template, active, onClick }: { template: LayerTemplate; active: boolean; onClick: () => void }) {
  return (
    <button className="card" style={{ textAlign: "left", borderColor: active ? "#0f766e" : undefined }} onClick={onClick}>
      <div className="card-body">
        <p className="card-title">{template.name}</p>
        <p className="muted" style={{ marginTop: 0 }}>v{template.version} · {template.canvasWidth}x{template.canvasHeight}</p>
        <div className="tag-row">{template.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
      </div>
    </button>
  );
}

export default function Page() {
  const [activeNav, setActiveNav] = useState<(typeof navItems)[number]["key"]>("templateReplace");
  const [selectedId, setSelectedId] = useState(sampleLayerTemplates[0].id);
  const [inputs, setInputs] = useState<RenderInputs>({ title: "连咖啡爆款组合", subtitle: "囤货正当时", price: "到手 ¥59.9", badge: "618 限时" });
  const [sizeName, setSizeName] = useState("tmall_main");
  const [isGenerating, setIsGenerating] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [reuseNotice, setReuseNotice] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);
  const [currentImages, setCurrentImages] = useState<GeneratedImage[]>([]);
  const [selectedCurrentImageId, setSelectedCurrentImageId] = useState<number | null>(null);
  const [generatedSignature, setGeneratedSignature] = useState<string | null>(null);
  const [selectingImageId, setSelectingImageId] = useState<number | null>(null);

  const selectedTemplate = useMemo(() => sampleLayerTemplates.find((item) => item.id === selectedId) ?? sampleLayerTemplates[0], [selectedId]);
  const exportSize = selectedTemplate.templateJson.exportSizes.find((size) => size.name === sizeName) ?? selectedTemplate.templateJson.exportSizes[0];
  const currentParamSignature = useMemo(() => buildParamSignature(selectedTemplate.id, sizeName, inputs), [inputs, selectedTemplate.id, sizeName]);
  const hasPendingParamChanges = currentImages.length > 0 && generatedSignature !== currentParamSignature;
  const selectedCurrentImage = currentImages.find((image) => image.id === selectedCurrentImageId) ?? null;

  async function handleGenerate() {
    if (isGenerating) return;
    const requestSignature = currentParamSignature;
    const candidateCount = 4;
    setIsGenerating(true);
    setGenerationError(null);
    setCurrentImages([]);
    setSelectedCurrentImageId(null);
    setCurrentJob({
      id: "pending",
      status: "running",
      templateId: selectedTemplate.id,
      candidateCount,
      createdAt: new Date().toISOString(),
    });

    try {
      const res = await fetch("/api/generation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          inputs,
          exportSize: { name: exportSize.name, width: exportSize.width, height: exportSize.height },
          candidateCount,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const job = data.data?.job as GenerationJob | undefined;
        const images = (data.data?.images ?? []) as GeneratedImage[];
        setCurrentJob(job ?? null);
        setCurrentImages(images);
        setSelectedCurrentImageId(images.find((image) => image.selected)?.id ?? images[0]?.id ?? null);
        setGeneratedSignature(requestSignature);
        setHistoryRefreshKey((k) => k + 1);

        if (!job || job.status === "failed") {
          setGenerationError("AI 生成失败，请稍后重试或调整输入内容。");
        }
      } else {
        setCurrentJob((job) => job ? { ...job, status: "failed" } : job);
        setGenerationError(data.error?.message ?? "生成失败，请稍后重试。");
      }
    } catch {
      setCurrentJob((job) => job ? { ...job, status: "failed" } : job);
      setGenerationError("网络异常，生成请求未完成。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSelectCurrentImage(image: GeneratedImage) {
    setSelectedCurrentImageId(image.id);
    setCurrentImages((images) => images.map((item) => ({ ...item, selected: item.id === image.id })));
    setSelectingImageId(image.id);
    try {
      const res = await fetch(`/api/generated-images/${image.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: true }),
      });
      const data = await res.json();
      if (!data.success) {
        setGenerationError(data.error?.message ?? "选中失败，请稍后重试。");
      } else {
        setHistoryRefreshKey((k) => k + 1);
      }
    } catch {
      setGenerationError("网络异常，选中状态暂未同步到历史归档。");
    } finally {
      setSelectingImageId(null);
    }
  }

  function handleReuseImage(image: GeneratedImage) {
    // Try to find matching template by templateId
    const matchingTemplate = sampleLayerTemplates.find((t) => t.id === image.templateId);
    if (matchingTemplate) {
      setSelectedId(matchingTemplate.id);
      setSizeName(matchingTemplate.templateJson.exportSizes[0].name);
    }

    if (image.inputsSnapshot) {
      // Prefer snapshot: restore original inputs as closely as possible
      const snap = image.inputsSnapshot;
      setInputs({
        title: String(snap.title ?? image.title ?? ""),
        subtitle: String(snap.subtitle ?? ""),
        price: String(snap.price ?? ""),
        badge: String(snap.badge ?? ""),
        productImageDataUrl: image.thumbnailUrl,
        referenceImageUrl: image.thumbnailUrl,
      });
    } else {
      // Fallback: derive from image metadata (legacy behavior)
      const platformLabel: Record<string, string> = { tmall: "天猫", xiaohongshu: "小红书", jd: "京东" };
      setInputs({
        title: image.title ?? "",
        subtitle: `${platformLabel[image.platform] ?? image.platform}活动主推`,
        price: "限时优惠",
        badge: image.tags.filter((t) => t !== "mock").slice(0, 1).join(" ") || "热卖",
        productImageDataUrl: image.thumbnailUrl,
        referenceImageUrl: image.thumbnailUrl,
      });
    }

    setReuseNotice(`已带回工作台：${image.title}，已作为下一轮参考/商品图输入。`);
    setCurrentImages([]);
    setCurrentJob(null);
    setSelectedCurrentImageId(null);
    setGeneratedSignature(null);
    setActiveNav("workspace");
  }

  const pageTitle = activeNav === "workspace" ? "模板驱动改图" : activeNav === "templateReplace" ? "模板换产品" : activeNav === "products" ? "产品库" : activeNav === "templates" ? "模板库" : activeNav === "history" ? "历史成图" : activeNav === "operations" ? "常用操作" : activeNav === "guide" ? "使用手册" : "设置";
  const pageSubtitle = activeNav === "workspace" ? "选择模板、填写参数、预览效果并抽卡生成候选图。" : activeNav === "templateReplace" ? "上传产品图和模板图，保留模板构图并替换为目标产品。" : activeNav === "products" ? "上传、浏览和管理产品图；生成时可直接从产品库选用。" : activeNav === "templates" ? "上传、浏览和管理模板图；生成时可直接从模板库选用。" : activeNav === "history" ? "归档、检索和复用历史成图；可把满意候选带回下一轮输入。" : activeNav === "operations" ? "抠图、换背景、改文字、缩放、扩图等高频能力入口。" : activeNav === "guide" ? "新手友好的操作指南，分步骤带你上手。" : "查看当前运行时配置和系统状态。";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">电商视觉自助台</div>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={`nav-item ${activeNav === item.key ? "active" : ""}`} onClick={() => setActiveNav(item.key)}>
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <div className="toolbar">
          <div className="title-block">
            <h1>{pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>
          {activeNav === "workspace" && (
            <button className="button primary" disabled={isGenerating} onClick={handleGenerate}>
              <WandSparkles size={16} />{isGenerating ? "AI 生成中..." : "抽卡生成"}
            </button>
          )}
        </div>

        {activeNav === "workspace" && (
          <div className="grid cols-3">
            {generationError && (
              <div className="alert error" style={{ gridColumn: "1 / -1" }}>
                <span>{generationError}</span>
                <button onClick={() => setGenerationError(null)}>关闭</button>
              </div>
            )}
            {reuseNotice && (
              <div style={{
                gridColumn: "1 / -1",
                background: "#f0fdfa",
                border: "1px solid #99f6e4",
                borderRadius: 8,
                padding: "8px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.875rem",
                color: "#0f766e",
              }}>
                <span>{reuseNotice}</span>
                <button
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#0f766e", fontSize: "0.875rem" }}
                  onClick={() => setReuseNotice(null)}
                >
                  关闭
                </button>
              </div>
            )}
            <section className="panel">
              <div className="field" style={{ marginBottom: 12 }}>
                <label>模板搜索</label>
                <div style={{ position: "relative" }}>
                  <Search size={16} style={{ left: 10, position: "absolute", top: 11, color: "#64748b" }} />
                  <input className="input" style={{ paddingLeft: 32 }} placeholder="618 / 双11 / 天猫" />
                </div>
              </div>
              <div className="grid">
                {sampleLayerTemplates.map((template) => <TemplateCard key={template.id} template={template} active={template.id === selectedId} onClick={() => { setSelectedId(template.id); setSizeName(template.templateJson.exportSizes[0].name); }} />)}
              </div>
            </section>

            <section className="panel">
              <div className="grid">
                <div className="field">
                  <label>主标题</label>
                  <input className="input" value={String(inputs.title ?? "")} onChange={(event) => setInputs({ ...inputs, title: event.target.value })} />
                </div>
                <div className="field">
                  <label>副标题</label>
                  <input className="input" value={String(inputs.subtitle ?? "")} onChange={(event) => setInputs({ ...inputs, subtitle: event.target.value })} />
                </div>
                <div className="field">
                  <label>价格 / 利益点</label>
                  <input className="input" value={String(inputs.price ?? "")} onChange={(event) => setInputs({ ...inputs, price: event.target.value })} />
                </div>
                <div className="field">
                  <label>活动标签</label>
                  <input className="input" value={String(inputs.badge ?? "")} onChange={(event) => setInputs({ ...inputs, badge: event.target.value })} />
                </div>
                <div className="field">
                  <label>商品图</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="input"
                    style={{ padding: "6px 8px" }}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const dataUrl = reader.result as string;
                        setInputs((prev) => ({ ...prev, productImageDataUrl: dataUrl }));
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  {inputs.productImageDataUrl && (
                    <button
                      className="button"
                      style={{ marginTop: 4, fontSize: 12, padding: "4px 10px" }}
                      onClick={() => setInputs((prev) => {
                        const { productImageDataUrl, ...rest } = prev;
                        return rest;
                      })}
                    >
                      清除商品图
                    </button>
                  )}
                </div>
                <div className="field">
                  <label>裁剪主体位置（cover 模式生效）</label>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {focusAreaPresets.map((preset) => (
                      <button
                        key={preset.label}
                        className="button"
                        style={{
                          fontSize: 12,
                          padding: "4px 10px",
                          borderColor:
                            inputs.productFocusArea === preset.value
                              ? "#0f766e"
                              : preset.value === undefined && !inputs.productFocusArea
                                ? "#0f766e"
                                : undefined,
                          background:
                            inputs.productFocusArea === preset.value
                              ? "#f0fdfa"
                              : preset.value === undefined && !inputs.productFocusArea
                                ? "#f0fdfa"
                                : undefined,
                        }}
                        onClick={() =>
                          setInputs((prev) => {
                            const { productFocusArea, ...rest } = prev;
                            return preset.value ? { ...rest, productFocusArea: preset.value } : rest;
                          })
                        }
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>背景图（可选）</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="input"
                    style={{ padding: "6px 8px" }}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const dataUrl = reader.result as string;
                        setInputs((prev) => ({ ...prev, backgroundImageDataUrl: dataUrl }));
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  {inputs.backgroundImageDataUrl && (
                    <button
                      className="button"
                      style={{ marginTop: 4, fontSize: 12, padding: "4px 10px" }}
                      onClick={() => setInputs((prev) => {
                        const { backgroundImageDataUrl, ...rest } = prev;
                        return rest;
                      })}
                    >
                      清除背景图
                    </button>
                  )}
                </div>
                <div className="field">
                  <label>导出尺寸</label>
                  <select className="select" value={sizeName} onChange={(event) => setSizeName(event.target.value)}>
                    {selectedTemplate.templateJson.exportSizes.map((size) => <option value={size.name} key={size.name}>{size.name} · {size.width}x{size.height}</option>)}
                  </select>
                </div>
              </div>
            </section>

            <div className="grid">
              <section className="panel">
                <div className="panel-head">
                  <h2>当前参数预览</h2>
                  <span className="count-pill">{exportSize.width}x{exportSize.height}</span>
                </div>
                <p className="muted" style={{ marginTop: 0 }}>{summarizeInputs(inputs)}</p>
                <TemplatePreview template={selectedTemplate.templateJson} inputs={inputs} exportSize={exportSize} />
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2>本轮候选图</h2>
                  <span className={`status-chip ${currentJob?.status ?? "queued"}`}>
                    {isGenerating ? "生成中" : currentJob?.status === "succeeded" ? "已生成" : currentJob?.status === "failed" ? "失败" : "待生成"}
                  </span>
                </div>
                <p className="muted" style={{ marginTop: 0 }}>
                  {isGenerating
                    ? "正在按当前参数抽卡，请留在当前页等待候选图。"
                    : currentImages.length > 0
                      ? `已返回 ${currentImages.length} 张候选图，当前选中：${selectedCurrentImage?.title ?? "未选择"}。`
                      : "点击右上角“抽卡生成”后，候选图会直接出现在这里。"}
                </p>
                {hasPendingParamChanges && (
                  <div className="alert" style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", marginBottom: 12 }}>
                    <span>参数已调整，当前候选仍来自上一轮；可继续抽卡重生成。</span>
                    <button style={{ color: "#92400e" }} onClick={handleGenerate}>重抽</button>
                  </div>
                )}
                <div className="current-candidates">
                  {currentImages.map((image) => (
                    <article className={`candidate-card ${selectedCurrentImageId === image.id ? "active" : ""}`} key={image.id}>
                      <div className="thumb-wrap">
                        <img alt={image.title} src={image.thumbnailUrl} />
                        {selectedCurrentImageId === image.id && <span className="selected-badge"><Check size={14} />已选</span>}
                      </div>
                      <div className="history-card-body">
                        <div className="history-title-row">
                          <h3>{image.title}</h3>
                          <span className={`status-chip ${image.status}`}>{image.status === "succeeded" ? "已完成" : image.status}</span>
                        </div>
                        <p className="muted" style={{ margin: 0 }}>{image.templateName} · {image.width}x{image.height}</p>
                        <div className="history-actions">
                          <button className="button" disabled={selectingImageId === image.id} onClick={() => handleSelectCurrentImage(image)}>
                            <Check size={16} />{selectedCurrentImageId === image.id ? "已选中" : "选中"}
                          </button>
                          <button className="button" onClick={() => handleReuseImage(image)}>
                            <RotateCw size={16} />复用再调
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {!isGenerating && currentImages.length === 0 && (
                    <div className="empty-state" style={{ minHeight: 160 }}>
                      <WandSparkles size={26} />
                      <p>暂无本轮候选图</p>
                    </div>
                  )}
                  {isGenerating && (
                    <div className="empty-state" style={{ minHeight: 160 }}>
                      <WandSparkles size={26} />
                      <p>生成中，请稍候...</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {activeNav === "templateReplace" && <TemplateReplacePanel />}

        {activeNav === "products" && <ProductLibraryPanel />}

        {activeNav === "templates" && <TemplateLibraryPanel />}

        {activeNav === "history" && <GeneratedImageHistory refreshKey={historyRefreshKey} onReuseImage={handleReuseImage} />}

        {activeNav === "operations" && <CommonOperationsPanel inputs={inputs} onInputsChange={setInputs} onGoWorkspace={() => setActiveNav("workspace")} />}
        {activeNav === "guide" && <UserGuidePanel />}
        {activeNav === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}
