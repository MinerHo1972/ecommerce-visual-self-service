import { sampleLayerTemplates, samplePromptTemplates } from "../sample-data";
import type { LayerTemplate, PromptTemplate } from "../types";

export type PageResult<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
};

export type TemplateRepository = {
  listLayerTemplates(params?: { keyword?: string; category?: string; status?: string; page?: number; pageSize?: number }): PageResult<LayerTemplate>;
  getLayerTemplate(id: number): LayerTemplate | null;
  updateLayerTemplate(id: number, input: Partial<Pick<LayerTemplate, "name" | "category" | "templateJson" | "tags" | "status">>): LayerTemplate | null;
  listPromptTemplates(): PageResult<PromptTemplate>;
};

let layerTemplateStore = sampleLayerTemplates.map((template) => ({ ...template }));

export const mockTemplateRepository: TemplateRepository = {
  listLayerTemplates(params = {}) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const keyword = params.keyword?.trim().toLowerCase();
    const category = params.category?.trim();
    const status = params.status?.trim();

    const filtered = layerTemplateStore.filter((template) => {
      if (keyword && !template.name.toLowerCase().includes(keyword)) return false;
      if (category && template.category !== category) return false;
      if (status && template.status !== status) return false;
      return true;
    });

    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      page,
      page_size: pageSize,
      total: filtered.length
    };
  },

  getLayerTemplate(id) {
    return layerTemplateStore.find((template) => template.id === id) ?? null;
  },

  updateLayerTemplate(id, input) {
    const index = layerTemplateStore.findIndex((template) => template.id === id);
    if (index === -1) return null;

    const current = layerTemplateStore[index];
    const next: LayerTemplate = {
      ...current,
      ...input,
      canvasWidth: input.templateJson?.canvas.width ?? current.canvasWidth,
      canvasHeight: input.templateJson?.canvas.height ?? current.canvasHeight,
      version: current.version + 1
    };
    layerTemplateStore[index] = next;
    return next;
  },

  listPromptTemplates() {
    return { items: samplePromptTemplates, page: 1, page_size: samplePromptTemplates.length, total: samplePromptTemplates.length };
  }
};

export function getTemplateRepository(): TemplateRepository {
  return mockTemplateRepository;
}
