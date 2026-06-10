"use client";

import { Database, FileText, ImagePlus, LayoutDashboard, Search, Settings, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { TemplateAdminPanel } from "@/components/TemplateAdminPanel";
import { TemplatePreview } from "@/components/TemplatePreview";
import { sampleLayerTemplates, samplePromptTemplates } from "@/lib/sample-data";
import type { LayerTemplate, RenderInputs } from "@/lib/types";

const navItems = [
  { key: "workspace", label: "运营自助台", icon: LayoutDashboard },
  { key: "templates", label: "模板管理", icon: FileText },
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

  const selectedTemplate = useMemo(() => sampleLayerTemplates.find((item) => item.id === selectedId) ?? sampleLayerTemplates[0], [selectedId]);
  const exportSize = selectedTemplate.templateJson.exportSizes.find((size) => size.name === sizeName) ?? selectedTemplate.templateJson.exportSizes[0];
  const pageTitle = activeNav === "workspace" ? "模板驱动改图" : activeNav === "templates" ? "图层模板后台" : "第一阶段开发预览";
  const pageSubtitle = activeNav === "templates" ? "设计师通过可视化点击取坐标，沉淀可复用模板 JSON。" : "当前首版聚焦图层模板配置、Canvas 渲染、改文字重建和多尺寸导出。";

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
          <button className="button primary"><WandSparkles size={16} />抽卡生成</button>
        </div>

        {activeNav === "workspace" && (
          <div className="grid cols-3">
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
                  <input className="input" value={inputs.title || ""} onChange={(event) => setInputs({ ...inputs, title: event.target.value })} />
                </div>
                <div className="field">
                  <label>副标题</label>
                  <input className="input" value={inputs.subtitle || ""} onChange={(event) => setInputs({ ...inputs, subtitle: event.target.value })} />
                </div>
                <div className="field">
                  <label>价格 / 利益点</label>
                  <input className="input" value={inputs.price || ""} onChange={(event) => setInputs({ ...inputs, price: event.target.value })} />
                </div>
                <div className="field">
                  <label>活动标签</label>
                  <input className="input" value={inputs.badge || ""} onChange={(event) => setInputs({ ...inputs, badge: event.target.value })} />
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

        {activeNav !== "workspace" && activeNav !== "templates" && (
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
