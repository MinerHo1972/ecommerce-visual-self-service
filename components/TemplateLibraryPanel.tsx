"use client";

import { ImagePlus, Pencil, Search, Sparkles, Trash2, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TemplateItem = {
  id: number;
  name: string;
  tags: string[];
  ossKey: string;
  thumbnailUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: { message: string };
};

export function TemplateLibraryPanel() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [textEditTemplate, setTextEditTemplate] = useState<TemplateItem | null>(null);
  const [originalText, setOriginalText] = useState("618");
  const [replacementText, setReplacementText] = useState("中秋节");
  const [editInstruction, setEditInstruction] = useState("只改主标题文字，保持原设计版式、商品和背景不变");
  const [textEditing, setTextEditing] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<number>>(() => new Set());
  const [batchRecycling, setBatchRecycling] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("updated_desc");
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/template-library");
      const data = (await res.json()) as ApiResult<{ templates: TemplateItem[] }>;
      if (data.success && data.data) {
        setTemplates(data.data.templates);
      }
    } catch {
      setError("获取模板列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  async function handleUpload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/template-library", { method: "POST", body: formData });
      const data = (await res.json()) as ApiResult<{ template: TemplateItem }>;
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? "上传失败");
      }
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleRename(id: number, newName: string) {
    try {
      const res = await fetch("/api/template-library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: newName }),
      });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!data.success) throw new Error(data.error?.message ?? "重命名失败");
      setEditingId(null);
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重命名失败");
    }
  }

  function openTextEdit(template: TemplateItem) {
    setTextEditTemplate(template);
    setOriginalText("618");
    setReplacementText("中秋节");
    setEditInstruction("只改主标题文字，保持原设计版式、商品和背景不变");
    setError(null);
  }

  async function handleTextEditSubmit() {
    if (!textEditTemplate || !originalText.trim() || !replacementText.trim()) return;
    setTextEditing(true);
    setError(null);
    try {
      const res = await fetch("/api/template-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "text_edit",
          templateId: textEditTemplate.id,
          originalText,
          replacementText,
          editInstruction,
        }),
      });
      const data = (await res.json()) as ApiResult<{ template: TemplateItem }>;
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? "生成改字模板失败");
      }
      setTextEditTemplate(null);
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成改字模板失败");
    } finally {
      setTextEditing(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("确定移入回收站这个模板吗？")) return;
    try {
      const res = await fetch(`/api/template-library?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!data.success) throw new Error(data.error?.message ?? "移入回收站失败");
      setBatchSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "移入回收站失败");
    }
  }

  const templateSizeLabel = useCallback((entry: TemplateItem) => {
    const text = `${entry.name} ${entry.tags.join(" ")}`;
    return text.match(/\d{3,4}\s*[x×]\s*\d{3,4}/i)?.[0].replace(/\s+/g, "") ?? "未标注尺寸";
  }, []);

  const tagOptions = useMemo(() => {
    const labels = new Set<string>();
    templates.forEach((entry) => entry.tags.forEach((tag) => labels.add(tag)));
    return Array.from(labels).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [templates]);

  const sizeOptions = useMemo(() => {
    const labels = new Set<string>();
    templates.forEach((entry) => labels.add(templateSizeLabel(entry)));
    return Array.from(labels).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [templateSizeLabel, templates]);

  const filteredTemplates = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return templates
      .filter((entry) => {
        const haystack = `${entry.name} ${entry.tags.join(" ")}`.toLowerCase();
        if (normalizedKeyword && !haystack.includes(normalizedKeyword)) return false;
        if (tagFilter !== "all" && !entry.tags.includes(tagFilter)) return false;
        if (sizeFilter !== "all" && templateSizeLabel(entry) !== sizeFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === "created_asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (sortOrder === "created_desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sortOrder === "name_asc") return a.name.localeCompare(b.name, "zh-Hans-CN");
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [keyword, sizeFilter, sortOrder, tagFilter, templateSizeLabel, templates]);

  const visibleIds = useMemo(() => filteredTemplates.map((entry) => entry.id), [filteredTemplates]);
  const selectedVisibleCount = visibleIds.filter((id) => batchSelectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  function handleToggleBatchSelection(id: number) {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleAllVisible() {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function handleBatchDelete() {
    const ids = Array.from(batchSelectedIds);
    if (ids.length === 0) return;
    if (!confirm(`确定把选中的 ${ids.length} 个模板移入回收站吗？`)) return;
    setBatchRecycling(true);
    setError(null);
    try {
      await Promise.all(ids.map(async (id) => {
        const res = await fetch(`/api/template-library?id=${id}`, { method: "DELETE" });
        const data = (await res.json()) as ApiResult<unknown>;
        if (!data.success) throw new Error(data.error?.message ?? "移入回收站失败");
      }));
      setBatchSelectedIds(new Set());
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量移入回收站失败");
    } finally {
      setBatchRecycling(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">模板库</p>
          <h2>管理模板图</h2>
          <p className="muted">上传模板图，在"模板换产品"页可直接从模板库选用，不用每次手动上传。</p>
        </div>
        <label className="button primary file-button">
          <UploadCloud size={16} />
          {uploading ? "上传中" : "上传模板"}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => handleUpload(e.target.files?.[0])}
          />
        </label>
      </div>

      {error && <div className="alert error"><span>{error}</span><button onClick={() => setError(null)}>关闭</button></div>}

      {!loading && templates.length > 0 && (
        <div className="library-filter-bar template-filter-bar">
          <div className="field search-field">
            <label>搜索模板</label>
            <div className="input-wrap">
              <Search size={16} />
              <input className="input" value={keyword} placeholder="活动 / 平台 / 用途 / 标签" onChange={(event) => setKeyword(event.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>标签</label>
            <select className="select" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
              <option value="all">全部标签</option>
              {tagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </div>
          <div className="field">
            <label>尺寸</label>
            <select className="select" value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}>
              <option value="all">全部尺寸</option>
              {sizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
          <div className="field">
            <label>排序</label>
            <select className="select" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              <option value="updated_desc">最近更新</option>
              <option value="created_desc">最新上传</option>
              <option value="created_asc">最早上传</option>
              <option value="name_asc">名称 A-Z</option>
            </select>
          </div>
          <span className="count-pill">{filteredTemplates.length}/{templates.length} 个</span>
        </div>
      )}

      {!loading && templates.length > 0 && (
        <div className="bulk-action-bar library-bulk-actions">
          <label className="check-row">
            <input type="checkbox" checked={allVisibleSelected} onChange={handleToggleAllVisible} />
            全选当前筛选结果
          </label>
          <span className="muted">已选 {batchSelectedIds.size} 个</span>
          <button className="button danger" disabled={batchSelectedIds.size === 0 || batchRecycling} onClick={handleBatchDelete}>
            <Trash2 size={16} />批量移入回收站
          </button>
          {batchSelectedIds.size > 0 && (
            <button className="button" disabled={batchRecycling} onClick={() => setBatchSelectedIds(new Set())}>清空选择</button>
          )}
        </div>
      )}

      {loading ? (
        <div className="empty-state"><p>加载中...</p></div>
      ) : templates.length === 0 ? (
        <div className="empty-state">
          <ImagePlus size={32} />
          <p>还没有模板，点击上方按钮上传第一张模板图。</p>
        </div>
      ) : (
        <div className="template-library-grid">
          {filteredTemplates.map((t) => (
            <article key={t.id} className={`template-library-card ${batchSelectedIds.has(t.id) ? "batch-selected" : ""}`}>
              <div className="thumb-wrap">
                <label className="batch-select-badge" title="选择用于批量清理">
                  <input
                    type="checkbox"
                    checked={batchSelectedIds.has(t.id)}
                    onChange={() => handleToggleBatchSelection(t.id)}
                  />
                </label>
                <img src={t.thumbnailUrl} alt={t.name} loading="lazy" decoding="async" />
              </div>
              <div className="template-library-card-body">
                {editingId === t.id ? (
                  <div className="rename-row">
                    <input
                      className="input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(t.id, editName);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button className="button" onClick={() => handleRename(t.id, editName)}>保存</button>
                  </div>
                ) : (
                  <h3>{t.name}</h3>
                )}
                <p className="muted">{new Date(t.createdAt).toLocaleDateString("zh-CN")}</p>
                <div className="template-library-card-actions">
                  <button
                    className="button"
                    onClick={() => { setEditingId(t.id); setEditName(t.name); }}
                    disabled={editingId === t.id}
                  >
                    <Pencil size={14} /> 改名
                  </button>
                  <button className="button" onClick={() => openTextEdit(t)}>
                    <Sparkles size={14} /> 改文字
                  </button>
                  <button className="button" onClick={() => handleDelete(t.id)}>
                    <Trash2 size={14} /> 移入回收站
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && templates.length > 0 && filteredTemplates.length === 0 && (
        <div className="empty-state">
          <Search size={28} />
          <p>没有匹配的模板图，试试换个关键词、标签或尺寸。</p>
        </div>
      )}

      {textEditTemplate && (
        <div className="template-picker-overlay" onClick={() => !textEditing && setTextEditTemplate(null)}>
          <div className="template-picker-modal text-edit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="text-edit-modal-head">
              <div>
                <p className="eyebrow">文字修改</p>
                <h3>生成可复用的新模板</h3>
                <p className="muted">只修改模板里的指定文字，原模板不会被覆盖。</p>
              </div>
              <button className="icon-button" disabled={textEditing} onClick={() => setTextEditTemplate(null)} aria-label="关闭">
                <X size={16} />
              </button>
            </div>
            <div className="text-edit-layout">
              <div className="text-edit-preview">
                <img src={textEditTemplate.thumbnailUrl} alt={textEditTemplate.name} />
                <span>{textEditTemplate.name}</span>
              </div>
              <div className="text-edit-form">
                <label className="field">
                  <span>原文字</span>
                  <input className="input" value={originalText} onChange={(event) => setOriginalText(event.target.value)} placeholder="例如：618" />
                </label>
                <label className="field">
                  <span>替换为</span>
                  <input className="input" value={replacementText} onChange={(event) => setReplacementText(event.target.value)} placeholder="例如：中秋节" />
                </label>
                <label className="field">
                  <span>补充要求</span>
                  <textarea className="textarea" value={editInstruction} onChange={(event) => setEditInstruction(event.target.value)} />
                </label>
                <div className="text-edit-actions">
                  <button className="button" disabled={textEditing} onClick={() => setTextEditTemplate(null)}>取消</button>
                  <button className="button primary" disabled={textEditing || !originalText.trim() || !replacementText.trim()} onClick={handleTextEditSubmit}>
                    <Sparkles size={16} />{textEditing ? "生成中" : "生成新模板"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
