import type { CreateGenerationJobPayload, GeneratedImage, GenerationJob } from "../types";
import { sampleGeneratedImages } from "../sample-data";
import { generateImages, isSenseNovaAvailable, buildEcommercePrompt } from "../services/sensenova";
import { getRuntimeConfig } from "../config";

/** In-memory store — data is lost on server restart (acceptable for mock mode). */
const jobStore: GenerationJob[] = [];
const imageStore: GeneratedImage[] = [...sampleGeneratedImages];

let nextImageId = 10001;

// Placeholder thumbnail URLs for mock candidates
const mockThumbnails = [
  "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?q=80&w=640&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1442512595331-e89e73853f31?q=80&w=640&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1511920170033-f8396924c348?q=80&w=640&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?q=80&w=640&auto=format&fit=crop",
];

const mockScenes = ["main_image", "promotion", "social_seed"] as const;
const mockPlatforms = ["tmall", "xiaohongshu", "jd"] as const;

export type GenerationJobRepository = {
  createJob(payload: CreateGenerationJobPayload): Promise<{ job: GenerationJob; images: GeneratedImage[] }>;
  getJob(jobId: string): Promise<{ job: GenerationJob; images: GeneratedImage[] } | null>;
  getGeneratedImage(imageId: number): Promise<GeneratedImage | null>;
  listGeneratedImages(params?: {
    keyword?: string;
    templateId?: number;
    status?: string;
    selected?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: GeneratedImage[]; page: number; page_size: number; total: number }>;
  updateGeneratedImageSelection(imageId: number, selected: boolean): Promise<GeneratedImage | null>;
};

export const mockGenerationJobRepository: GenerationJobRepository = {
  async createJob(payload) {
    const count = payload.candidateCount ?? 4;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const job: GenerationJob = {
      id: jobId,
      status: "succeeded",
      templateId: payload.templateId,
      candidateCount: count,
      createdAt: now,
    };
    jobStore.push(job);

    const width = payload.exportSize?.width ?? 800;
    const height = payload.exportSize?.height ?? 800;

    // Build a JSON-safe snapshot of the inputs (exclude non-serializable like data URLs)
    const inputsSnapshot: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload.inputs)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        inputsSnapshot[key] = value;
      } else if (typeof value === "object" && value !== null) {
        // Allow plain objects like FocusArea
        try {
          JSON.stringify(value);
          inputsSnapshot[key] = value;
        } catch {
          // Skip non-serializable values
        }
      }
    }

    const images: GeneratedImage[] = [];
    for (let i = 0; i < count; i++) {
      const img: GeneratedImage = {
        id: nextImageId++,
        jobId,
        templateId: payload.templateId,
        templateName: payload.templateName,
        title: `${payload.templateName} 候选 ${i + 1}`,
        scene: mockScenes[i % mockScenes.length],
        platform: mockPlatforms[i % mockPlatforms.length],
        ossKey: `generated/mock/${jobId}/candidate_${i + 1}.png`,
        thumbnailUrl: mockThumbnails[i % mockThumbnails.length],
        width,
        height,
        status: "succeeded",
        selected: i === 0,
        tags: ["mock", payload.templateName.split(" ")[0]],
        createdAt: now,
        inputsSnapshot,
      };
      images.push(img);
      imageStore.push(img);
    }

    return { job, images };
  },

  async getJob(jobId) {
    const job = jobStore.find((j) => j.id === jobId);
    if (!job) return null;
    const images = imageStore.filter((img) => img.jobId === jobId);
    return { job, images };
  },

  async getGeneratedImage(imageId) {
    return imageStore.find((img) => img.id === imageId) ?? null;
  },

  async listGeneratedImages(params = {}) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const keyword = params.keyword?.trim().toLowerCase();

    const filtered = imageStore.filter((image) => {
      if (keyword && !`${image.title} ${image.templateName} ${image.tags.join(" ")}`.toLowerCase().includes(keyword)) return false;
      if (params.templateId && image.templateId !== params.templateId) return false;
      if (params.status && image.status !== params.status) return false;
      if (typeof params.selected === "boolean" && image.selected !== params.selected) return false;
      return true;
    });

    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      page,
      page_size: pageSize,
      total: filtered.length,
    };
  },

  async updateGeneratedImageSelection(imageId, selected) {
    const image = imageStore.find((img) => img.id === imageId);
    if (!image) return null;

    if (selected) {
      // Set other images in the same jobId to false
      for (const img of imageStore) {
        if (img.jobId === image.jobId && img.id !== imageId) {
          img.selected = false;
        }
      }
    }
    image.selected = selected;
    return image;
  },
};

export const sensenovaGenerationJobRepository: GenerationJobRepository = {
  async createJob(payload) {
    const count = payload.candidateCount ?? 4;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const width = payload.exportSize?.width ?? 800;
    const height = payload.exportSize?.height ?? 800;
    const size = `${width}x${height}`;

    // Build inputs snapshot
    const inputsSnapshot: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload.inputs)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        inputsSnapshot[key] = value;
      } else if (typeof value === "object" && value !== null) {
        try { JSON.stringify(value); inputsSnapshot[key] = value; } catch { /* skip */ }
      }
    }

    // Extract text content from inputs for the prompt
    const textLines = Object.entries(payload.inputs)
      .filter(([, v]) => typeof v === "string" && v.length > 0)
      .map(([k, v]) => `${k}: ${v}`);

    const prompt = `生成一张电商商品主图，模板名称：${payload.templateName}，尺寸${size}。
画面中的文字内容：${textLines.join("、") || payload.templateName}。
要求：构图专业，商品突出，文字排版清晰可读，电商促销氛围，高清画质。`;

    let results;
    try {
      results = await generateImages(prompt, { size, n: count, responseFormat: "url" });
    } catch (err) {
      // AI 调用失败：返回 failed 状态，不阻塞 UI
      const job: GenerationJob = {
        id: jobId, status: "failed", templateId: payload.templateId,
        candidateCount: count, createdAt: now,
      };
      jobStore.push(job);
      return { job, images: [] };
    }

    const job: GenerationJob = {
      id: jobId,
      status: "succeeded",
      templateId: payload.templateId,
      candidateCount: count,
      createdAt: now,
    };
    jobStore.push(job);

    const images: GeneratedImage[] = results.map((result, i) => ({
      id: nextImageId++,
      jobId,
      templateId: payload.templateId,
      templateName: payload.templateName,
      title: `${payload.templateName} 候选 ${i + 1}`,
      scene: "main_image",
      platform: "tmall",
      ossKey: `generated/sensenova/${jobId}/candidate_${i + 1}.png`,
      thumbnailUrl: result.url ?? "",
      width,
      height,
      status: "succeeded" as const,
      selected: i === 0,
      tags: ["sensenova", "ai"],
      createdAt: now,
      inputsSnapshot,
    }));

    for (const img of images) imageStore.push(img);
    return { job, images };
  },

  async getJob(jobId) {
    const job = jobStore.find((j) => j.id === jobId);
    if (!job) return null;
    const images = imageStore.filter((img) => img.jobId === jobId);
    return { job, images };
  },

  async getGeneratedImage(imageId) {
    return imageStore.find((img) => img.id === imageId) ?? null;
  },

  async listGeneratedImages(params = {}) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const keyword = params.keyword?.trim().toLowerCase();

    const filtered = imageStore.filter((image) => {
      if (keyword && !`${image.title} ${image.templateName} ${image.tags.join(" ")}`.toLowerCase().includes(keyword)) return false;
      if (params.templateId && image.templateId !== params.templateId) return false;
      if (params.status && image.status !== params.status) return false;
      if (typeof params.selected === "boolean" && image.selected !== params.selected) return false;
      return true;
    });

    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      page, page_size: pageSize, total: filtered.length,
    };
  },

  async updateGeneratedImageSelection(imageId, selected) {
    const image = imageStore.find((img) => img.id === imageId);
    if (!image) return null;
    if (selected) {
      for (const img of imageStore) {
        if (img.jobId === image.jobId && img.id !== imageId) img.selected = false;
      }
    }
    image.selected = selected;
    return image;
  },
};

export function getGenerationJobRepository(): GenerationJobRepository {
  const config = getRuntimeConfig();
  if (config.generationMode === "sensenova" && isSenseNovaAvailable()) {
    return sensenovaGenerationJobRepository;
  }
  return mockGenerationJobRepository;
}
