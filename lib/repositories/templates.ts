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
  listPromptTemplates(): PageResult<PromptTemplate>;
};

export const mockTemplateRepository: TemplateRepository = {
  listLayerTemplates(params = {}) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const keyword = params.keyword?.trim().toLowerCase();
    const category = params.category?.trim();
    const status = params.status?.trim();

    const filtered = sampleLayerTemplates.filter((template) => {
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

  listPromptTemplates() {
    return { items: samplePromptTemplates, page: 1, page_size: samplePromptTemplates.length, total: samplePromptTemplates.length };
  }
};

export function getTemplateRepository(): TemplateRepository {
  return mockTemplateRepository;
}
