"use client";

import { BookOpen, ChevronLeft, ChevronRight, FileText, History, LayoutDashboard, Package, Recycle, Settings, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { CommonOperationsPanel } from "@/components/CommonOperationsPanel";
import { GeneratedImageHistory } from "@/components/GeneratedImageHistory";
import { ProductLibraryPanel } from "@/components/ProductLibraryPanel";
import { RecycleBinPanel } from "@/components/RecycleBinPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TemplateLibraryPanel } from "@/components/TemplateLibraryPanel";
import { TemplateReplacePanel } from "@/components/TemplateReplacePanel";
import { UserGuidePanel } from "@/components/UserGuidePanel";
import type { GeneratedImage, RenderInputs } from "@/lib/types";

const navItems = [
  { key: "templateReplace", label: "自助工作台", icon: LayoutDashboard },
  { key: "products", label: "产品库", icon: Package },
  { key: "templates", label: "模板库", icon: FileText },
  { key: "history", label: "历史成图", icon: History },
  { key: "recycle", label: "回收站", icon: Recycle },
  { key: "operations", label: "常用操作", icon: SlidersHorizontal },
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
  templateReplace: {
    title: "自助工作台",
    subtitle: "上传产品图和模板图，框选商品区域，生成候选。",
  },
  products: {
    title: "产品库",
    subtitle: "上传、浏览和管理产品图；生成时可直接从产品库选用。",
  },
  templates: {
    title: "模板库",
    subtitle: "上传、浏览和管理模板图；生成时可直接从模板库选用。",
  },
  history: {
    title: "历史成图",
    subtitle: "归档、检索和复用历史成图；可把满意候选带回下一轮输入。",
  },
  recycle: {
    title: "回收站",
    subtitle: "查看已移入回收站的产品、模板和历史成图，必要时恢复到原列表。",
  },
  operations: {
    title: "常用操作",
    subtitle: "抠图、换背景、改文字、缩放、扩图等高频能力入口。",
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
  const [activeNav, setActiveNav] = useState<ActiveNav>("templateReplace");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [inputs, setInputs] = useState<RenderInputs>({ title: "连咖啡爆款组合", subtitle: "囤货正当时", price: "到手 ¥59.9", badge: "618 限时" });
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [reusedProduct, setReusedProduct] = useState<ReusedProductInput | null>(null);

  function handleReuseImage(image: GeneratedImage) {
    setReusedProduct({
      id: image.id,
      name: image.title,
      url: image.thumbnailUrl,
      notice: `已带回自助工作台：${image.title}，已作为产品图输入。`,
    });
    setActiveNav("templateReplace");
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

        {activeNav === "templateReplace" && (
          <TemplateReplacePanel
            reusedProduct={reusedProduct}
            onReusedProductConsumed={() => setReusedProduct(null)}
          />
        )}

        {activeNav === "products" && <ProductLibraryPanel />}

        {activeNav === "templates" && <TemplateLibraryPanel />}

        {activeNav === "history" && <GeneratedImageHistory refreshKey={historyRefreshKey} onReuseImage={handleReuseImage} />}

        {activeNav === "recycle" && <RecycleBinPanel />}

        {activeNav === "operations" && <CommonOperationsPanel inputs={inputs} onInputsChange={setInputs} onGoWorkspace={() => setActiveNav("templateReplace")} />}
        {activeNav === "guide" && <UserGuidePanel />}
        {activeNav === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}
