"use client";

import { Database, FileText, History, ImagePlus, LayoutDashboard, Search, Settings, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { GeneratedImageHistory } from "@/components/GeneratedImageHistory";
import { TemplateAdminPanel } from "@/components/TemplateAdminPanel";
import { TemplatePreview } from "@/components/TemplatePreview";
import { sampleLayerTemplates, samplePromptTemplates } from "@/lib/sample-data";
import type { FocusArea, GeneratedImage, LayerTemplate, RenderInputs } from "@/lib/types";

const focusAreaPresets: { label: string; value: FocusArea | undefined }[] = [
  { label: "主体偏左", value: { x: 0.05, y: 0.1, width: 0.55, height: 0.8 } },
  { label: "主体居中", value: { x: 0.225, y: 0.1, width: 0.55, height: 0.8 } },
  { label: "主体偏右", value: { x: 0.4, y: 0.1, width: 0.55, height: 0.8 } },
  { label: "无（默认居中裁切）", value: undefined },
];

const navItems = [
  { key: "workspace", label: "运营自助台", icon: LayoutDashboard },
  { key: "templates", label: "模板管理", icon: FileText },
  { key: "history", label: "历史成图", icon: History },
  { key: "references", label: "参考图库", icon: ImagePlus },
  { key: "data", label: "数据契约", icon: Database },
  { key: "settings", label: "设置", icon: Settings }
] as const;

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
  const [activeNav, setActiveNav] = useState<(typeof navItems)[number]["key"]>("workspace");
  const [selectedId, setSelectedId] = useState(sampleLayerTemplates[0].id);
  const [inputs, setInputs] = useState<RenderInputs>({ title: "连咖啡爆款组合", subtitle: "囤货正当时", price: "到手 ¥59.9", badge: "618 限时" });
  const [sizeName, setSizeName] = useState("tmall_main");
  const [isGenerating, setIsGenerating] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [reuseNotice, setReuseNotice] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const selectedTemplate = useMemo(() => sampleLayerTemplates.find((item) => item.id === selectedId) ?? sampleLayerTemplates[0], [selectedId]);
  const exportSize = selectedTemplate.templateJson.exportSizes.find((size) => size.name === sizeName) ?? selectedTemplate.templateJson.exportSizes[0];

  async function handleGenerate() {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const res = await fetch("/api/generation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          inputs,
          exportSize: { name: exportSize.name, width: exportSize.width, height: exportSize.height },
          candidateCount: 4,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.data?.job?.status === "failed") {
          setGenerationError("AI 生成失败，请稍后重试或调整输入内容。");
          return;
        }
        setHistoryRefreshKey((k) => k + 1);
        setActiveNav("history");
      } else {
        setGenerationError(data.error?.message ?? "生成失败，请稍后重试。");
      }
    } catch {
      setGenerationError("网络异常，生成请求未完成。");
    } finally {
      setIsGenerating(false);
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
      });
    } else {
      // Fallback: derive from image metadata (legacy behavior)
      const platformLabel: Record<string, string> = { tmall: "天猫", xiaohongshu: "小红书", jd: "京东" };
      setInputs({
        title: image.title ?? "",
        subtitle: `${platformLabel[image.platform] ?? image.platform}活动主推`,
        price: "限时优惠",
        badge: image.tags.filter((t) => t !== "mock").slice(0, 1).join(" ") || "热卖",
      });
    }

    setReuseNotice(`已复用：${image.title}（${image.templateName}）`);
    setActiveNav("workspace");
  }

  const pageTitle = activeNav === "workspace" ? "模板驱动改图" : activeNav === "templates" ? "图层模板后台" : activeNav === "history" ? "历史成图" : "第一阶段开发预览";
  const pageSubtitle = activeNav === "templates" ? "设计师通过可视化点击取坐标，沉淀可复用模板 JSON。" : activeNav === "history" ? "查看生成候选图、复用参数和导出成图。" : "当前首版聚焦图层模板配置、Canvas 渲染、改文字重建和多尺寸导出。";

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
          <button className="button primary" disabled={isGenerating} onClick={handleGenerate}>
            <WandSparkles size={16} />{isGenerating ? "AI 生成中..." : "抽卡生成"}
          </button>
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

            <section className="panel">
              <TemplatePreview template={selectedTemplate.templateJson} inputs={inputs} exportSize={exportSize} />
            </section>
          </div>
        )}

        {activeNav === "templates" && <TemplateAdminPanel templates={sampleLayerTemplates} />}

        {activeNav === "history" && <GeneratedImageHistory refreshKey={historyRefreshKey} onReuseImage={handleReuseImage} />}

        {activeNav !== "workspace" && activeNav !== "templates" && activeNav !== "history" && (
          <div className="grid cols-2">
            <section className="panel">
              <h2 style={{ fontSize: 18, marginTop: 0 }}>已落地模块</h2>
              <ul className="status-list">
                <li>Next.js + React + TypeScript 工程骨架</li>
                <li>图层模板 TypeScript 契约</li>
                <li>618 / 双11 样例模板</li>
                <li>Canvas 分层渲染与 AutoShrink</li>
                <li>文字越界与尺寸合规检查</li>
              </ul>
            </section>
            <section className="panel">
              <h2 style={{ fontSize: 18, marginTop: 0 }}>Prompt 模板样例</h2>
              <div className="grid">
                {samplePromptTemplates.map((template) => (
                  <div className="card" key={template.id}>
                    <div className="card-body">
                      <p className="card-title">{template.name}</p>
                      <p className="muted">{template.promptSkeleton}</p>
                      <div className="tag-row">{template.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
