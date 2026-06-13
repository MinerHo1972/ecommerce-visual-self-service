"use client";

import { ImagePlus, Pencil, Trash2, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ProductItem = {
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

export function ProductLibraryPanel() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/product-library");
      const data = (await res.json()) as ApiResult<{ products: ProductItem[] }>;
      if (data.success && data.data) {
        setProducts(data.data.products);
      }
    } catch {
      setError("获取产品列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  async function handleUpload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/product-library", { method: "POST", body: formData });
      const data = (await res.json()) as ApiResult<{ product: ProductItem }>;
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? "上传失败");
      }
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleRename(id: number, newName: string) {
    try {
      const res = await fetch("/api/product-library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: newName }),
      });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!data.success) throw new Error(data.error?.message ?? "重命名失败");
      setEditingId(null);
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重命名失败");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("确定移入回收站这个产品吗？")) return;
    try {
      const res = await fetch(`/api/product-library?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!data.success) throw new Error(data.error?.message ?? "移入回收站失败");
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "移入回收站失败");
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">产品库</p>
          <h2>管理产品图</h2>
          <p className="muted">上传产品图，在"模板换产品"页可直接从产品库选用；这里和模板库、历史成图完全分开。</p>
        </div>
        <label className="button primary file-button">
          <UploadCloud size={16} />
          {uploading ? "上传中" : "上传产品"}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => handleUpload(e.target.files?.[0])}
          />
        </label>
      </div>

      {error && <div className="alert error"><span>{error}</span><button onClick={() => setError(null)}>关闭</button></div>}

      {loading ? (
        <div className="empty-state"><p>加载中...</p></div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <ImagePlus size={32} />
          <p>还没有产品，点击上方按钮上传第一张产品图。</p>
        </div>
      ) : (
        <div className="template-library-grid">
          {products.map((p) => (
            <article key={p.id} className="template-library-card">
              <div className="thumb-wrap">
                <img src={p.thumbnailUrl} alt={p.name} />
              </div>
              <div className="template-library-card-body">
                {editingId === p.id ? (
                  <div className="rename-row">
                    <input
                      className="input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(p.id, editName);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button className="button" onClick={() => handleRename(p.id, editName)}>保存</button>
                  </div>
                ) : (
                  <h3>{p.name}</h3>
                )}
                <p className="muted">{new Date(p.createdAt).toLocaleDateString("zh-CN")}</p>
                <div className="template-library-card-actions">
                  <button
                    className="button"
                    onClick={() => { setEditingId(p.id); setEditName(p.name); }}
                    disabled={editingId === p.id}
                  >
                    <Pencil size={14} /> 改名
                  </button>
                  <button className="button" onClick={() => handleDelete(p.id)}>
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
