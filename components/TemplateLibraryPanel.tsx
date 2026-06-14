"use client";

import { ImagePlus, Pencil, Trash2, UploadCloud } from "lucide-react";
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
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<number>>(() => new Set());
  const [batchRecycling, setBatchRecycling] = useState(false);
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

  const visibleIds = useMemo(() => templates.map((entry) => entry.id), [templates]);
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
        <div className="bulk-action-bar library-bulk-actions">
          <label className="check-row">
            <input type="checkbox" checked={allVisibleSelected} onChange={handleToggleAllVisible} />
            全选当前页
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
          {templates.map((t) => (
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
                  <button className="button" onClick={() => handleDelete(t.id)}>
                    <Trash2 size={14} /> 移入回收站
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
