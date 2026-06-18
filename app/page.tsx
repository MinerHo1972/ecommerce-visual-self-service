"use client";

import { BookOpen, ChevronLeft, ChevronRight, History, LayoutDashboard, Paintbrush, Recycle, Settings, Tags, Type, WandSparkles } from "lucide-react";
import { useState } from "react";
import { GeneratedImageHistory } from "@/components/GeneratedImageHistory";
import { RecycleBinPanel } from "@/components/RecycleBinPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TemplateLibraryPanel } from "@/components/TemplateLibraryPanel";
import { TemplateReplacePanel } from "@/components/TemplateReplacePanel";
import { UserGuidePanel } from "@/components/UserGuidePanel";
import type { GeneratedImage } from "@/lib/types";

const navItems = [
  { key: "workbench", label: "操作工作台", icon: LayoutDashboard },
  { key: "library", label: "图库", icon: History },
  { key: "tags", label: "其他标签管理", icon: Tags },
  { key: "recycle", label: "回收站", icon: Recycle },
  { key: "guide", label: "使用手册", icon: BookOpen },
  { key: "settings", label: "设置", icon: Settings }
] as const;

type ActiveNav = (typeof navItems)[number]["key"];

type ReusedProductInput = {
  id: number;
  name: string;
  url: string;
  notice: string;
};

const pageCopy: Record<ActiveNav, { title: string; subtitle: string }> = {
  workbench: {
    title: "操作工作台",
    subtitle: "从这里选择工作流、输入素材、微调提示词并发起抽卡；结果可以继续调用任意工作流或存入图库。",
  },
  library: {
    title: "图库",
    subtitle: "统一管理上传图、生成图、产品图和模板图；通过类型、评分和其他标签完成资产流转。",
  },
  tags: {
    title: "其他标签管理",
    subtitle: "集中管理问题标签、训练标签和非主类型标签；产品/模板与评分直接在图库卡片上处理。",
  },
  recycle: {
    title: "回收站",
    subtitle: "查看已移入回收站的产品、模板和图库图片，必要时恢复到原列表。",
  },
  guide: {
    title: "使用手册",
    subtitle: "新手友好的操作指南，分步骤带你上手。",
  },
  settings: {
    title: "设置",
    subtitle: "查看当前运行时配置和系统状态。",
  },
};

export default function Page() {
  const [activeNav, setActiveNav] = useState<ActiveNav>("workbench");
  const [activeWorkflow, setActiveWorkflow] = useState<"templateReplace" | "partialRepaint" | "textEdit">("templateReplace");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [reusedProduct, setReusedProduct] = useState<ReusedProductInput | null>(null);

  function handleReuseImage(image: GeneratedImage) {
    setReusedProduct({
      id: image.id,
      name: image.title,
      url: image.thumbnailUrl,
      notice: `已带回自助工作台：${image.title}，已作为产品图输入。`,
    });
    setActiveNav("workbench");
    setActiveWorkflow("templateReplace");
  }

  const currentCopy = pageCopy[activeNav];

  return (
    <div className={`shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar-head">
          <div className="brand" aria-hidden={isSidebarCollapsed}>电商视觉自助台</div>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            title={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
          >
            {isSidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={`nav-item ${activeNav === item.key ? "active" : ""}`} title={item.label} aria-label={item.label} onClick={() => setActiveNav(item.key)}>
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
            <h1>{currentCopy.title}</h1>
            <p>{currentCopy.subtitle}</p>
          </div>
        </div>

        {activeNav === "workbench" && (
          <section className="workbench-layout">
            <div className="workflow-switcher panel" aria-label="工作流模式选择">
              <div className="workflow-switcher-head">
                <p className="eyebrow">工作流模式</p>
                <h2>选择后会切换下方整套操作界面</h2>
                <p className="muted">每个模式对应不同输入、提示词和生成动作，不只是页内筛选。</p>
              </div>
              <div className="workflow-tabs">
                <button className={`workflow-tab ${activeWorkflow === "templateReplace" ? "active" : ""}`} onClick={() => setActiveWorkflow("templateReplace")} type="button">
                  <WandSparkles size={18} />
                  <span>模板换产品</span>
                  <small>产品图 + 模板图 → 抽候选</small>
                </button>
                <button className={`workflow-tab ${activeWorkflow === "partialRepaint" ? "active" : ""}`} onClick={() => setActiveWorkflow("partialRepaint")} type="button">
                  <Paintbrush size={18} />
                  <span>局部重绘</span>
                  <small>从候选图框选区域修图</small>
                </button>
                <button className={`workflow-tab ${activeWorkflow === "textEdit" ? "active" : ""}`} onClick={() => setActiveWorkflow("textEdit")} type="button">
                  <Type size={18} />
                  <span>文案替换</span>
                  <small>模板文字层 / AI 改字</small>
                </button>
              </div>
            </div>
            {activeWorkflow === "templateReplace" && (
              <TemplateReplacePanel
                mode="templateReplace"
                reusedProduct={reusedProduct}
                onReusedProductConsumed={() => setReusedProduct(null)}
              />
            )}
            {activeWorkflow === "partialRepaint" && <TemplateReplacePanel mode="partialRepaint" />}
            {activeWorkflow === "textEdit" && <TemplateLibraryPanel variant="workbench" />}
          </section>
        )}

        {activeNav === "library" && <GeneratedImageHistory refreshKey={historyRefreshKey} onReuseImage={handleReuseImage} />}

        {activeNav === "tags" && (
          <section className="panel tag-management-panel">
            <p className="eyebrow">标签治理</p>
            <h2>其他标签管理</h2>
            <p className="muted">主类型标签和星级评分已经下沉到图库卡片。这里保留给问题标签、训练标签、活动标签和平台标签的集中治理。</p>
            <div className="tag-management-grid">
              <div className="tag-management-card"><strong>问题标签</strong><span>产品不对、模板跑偏、文案变了等，用于复盘和训练样本筛选。</span></div>
              <div className="tag-management-card"><strong>训练标签</strong><span>沉淀可用/不可用原因，后续用于优化工作流默认提示词。</span></div>
              <div className="tag-management-card"><strong>业务标签</strong><span>活动、平台、渠道等非主分类标签，后续统一在这里维护。</span></div>
            </div>
          </section>
        )}

        {activeNav === "recycle" && <RecycleBinPanel />}

        {activeNav === "guide" && <UserGuidePanel />}
        {activeNav === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}
