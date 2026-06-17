"use client";

import { BookOpen, ChevronLeft, ChevronRight, FileText, History, LayoutDashboard, Package, Recycle, Settings } from "lucide-react";
import { useState } from "react";
import { GeneratedImageHistory } from "@/components/GeneratedImageHistory";
import { ProductLibraryPanel } from "@/components/ProductLibraryPanel";
import { RecycleBinPanel } from "@/components/RecycleBinPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TemplateLibraryPanel } from "@/components/TemplateLibraryPanel";
import { TemplateReplacePanel } from "@/components/TemplateReplacePanel";
import { UserGuidePanel } from "@/components/UserGuidePanel";
import type { GeneratedImage } from "@/lib/types";

const navItems = [
  { key: "templateReplace", label: "自助工作台", icon: LayoutDashboard },
  { key: "products", label: "产品库", icon: Package },
  { key: "templates", label: "模板库", icon: FileText },
  { key: "history", label: "图库", icon: History },
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
  templateReplace: {
    title: "自助工作台",
    subtitle: "当前默认工作流：商品图套模板。按素材输入、区域定位、AI 生成、人审下一步来完成一轮视觉生产。",
  },
  products: {
    title: "产品库",
    subtitle: "产品库是图库中带“产品”标签的筛选视图，上传的新产品图会继续兼容旧流程。",
  },
  templates: {
    title: "模板库",
    subtitle: "模板库是图库中带“模板”标签的筛选视图，上传的新模板图会继续兼容旧流程。",
  },
  history: {
    title: "图库",
    subtitle: "统一浏览上传、生成和旧产品/模板图片；用类型标签、星级评分和问题标签组织图片。",
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
  const [activeNav, setActiveNav] = useState<ActiveNav>("templateReplace");
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

        {activeNav === "guide" && <UserGuidePanel />}
        {activeNav === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}
