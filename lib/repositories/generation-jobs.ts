import type { CreateGenerationJobPayload, GeneratedImage, GenerationJob } from "../types";
import { sampleGeneratedImages } from "../sample-data";
import { generateImages, isGrsaiAvailable } from "../services/grsai";
import { getRuntimeConfig } from "../config";
import { rdsGenerationJobRepository } from "./rds-generation-jobs";

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

function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

function buildInputsSnapshot(inputs: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === "string") {
      if (!isDataUrl(value)) snapshot[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      snapshot[key] = value;
    } else if (typeof value === "object" && value !== null) {
      try {
        JSON.stringify(value);
        snapshot[key] = value;
      } catch {
        // Skip non-serializable values
      }
    }
  }
  return snapshot;
}

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

    const inputsSnapshot = buildInputsSnapshot(payload.inputs);

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

export const grsaiGenerationJobRepository: GenerationJobRepository = {
  async createJob(payload) {
    const count = payload.candidateCount ?? 4;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const width = payload.exportSize?.width ?? 800;
    const height = payload.exportSize?.height ?? 800;
    const size = `${width}x${height}`;

    const inputsSnapshot = buildInputsSnapshot(payload.inputs);

    // Extract text content from inputs for the prompt
    const textLines = Object.entries(payload.inputs)
      .filter(([, v]) => typeof v === "string" && v.length > 0 && !isDataUrl(v))
      .map(([k, v]) => `${k}: ${v}`);

    const prompt = `生成一张电商商品主图，模板名称：${payload.templateName}，尺寸${size}。
画面中的文字内容：${textLines.join("、") || payload.templateName}。
要求：构图专业，商品突出，文字排版清晰可读，电商促销氛围，高清画质。`;

    const config = getRuntimeConfig();
    const useRds = config.generationJobRepositoryMode === "rds";

    if (useRds) {
      // Create job record in RDS
      await rdsGenerationJobRepository.createJobRecord(jobId, payload, "queued");
    }

    let urls: string[];
    try {
      urls = await generateImages(prompt, { aspectRatio: size, n: count });
    } catch (err) {
      if (useRds) {
        await rdsGenerationJobRepository.updateJobStatus(jobId, "failed");
        const job = await rdsGenerationJobRepository.getJob(jobId);
        return { job: job!.job, images: [] };
      }
      // Fallback to memory
      const job: GenerationJob = {
        id: jobId, status: "failed", templateId: payload.templateId,
        candidateCount: count, createdAt: now,
      };
      jobStore.push(job);
      return { job, images: [] };
    }

    if (useRds) {
      // Update job status to succeeded
      await rdsGenerationJobRepository.updateJobStatus(jobId, "succeeded");

      // Insert images into RDS
      const images: GeneratedImage[] = [];
      for (let i = 0; i < urls.length; i++) {
        const imageBase: Omit<GeneratedImage, "id"> = {
          jobId,
          templateId: payload.templateId,
          templateName: payload.templateName,
          title: `${payload.templateName} 候选 ${i + 1}`,
          scene: "main_image",
          platform: "tmall",
          ossKey: `generated/grsai/${jobId}/candidate_${i + 1}.png`,
          thumbnailUrl: urls[i],
          width,
          height,
          status: "succeeded",
          selected: i === 0,
          tags: ["grsai", "ai"],
          createdAt: now,
          inputsSnapshot,
        };
        const insertedId = await rdsGenerationJobRepository.insertImage(imageBase);
        images.push({ ...imageBase, id: insertedId });
      }

      return { job: { id: jobId, status: "succeeded", templateId: payload.templateId, candidateCount: count, createdAt: now }, images };
    }

    // Memory fallback
    const job: GenerationJob = {
      id: jobId,
      status: "succeeded",
      templateId: payload.templateId,
      candidateCount: count,
      createdAt: now,
    };
    jobStore.push(job);

    const images: GeneratedImage[] = urls.map((url, i) => ({
      id: nextImageId++,
      jobId,
      templateId: payload.templateId,
      templateName: payload.templateName,
      title: `${payload.templateName} 候选 ${i + 1}`,
      scene: "main_image",
      platform: "tmall",
      ossKey: `generated/grsai/${jobId}/candidate_${i + 1}.png`,
      thumbnailUrl: url,
      width,
      height,
      status: "succeeded" as const,
      selected: i === 0,
      tags: ["grsai", "ai"],
      createdAt: now,
      inputsSnapshot,
    }));

    for (const img of images) imageStore.push(img);
    return { job, images };
  },

  async getJob(jobId) {
    const config = getRuntimeConfig();
    if (config.generationJobRepositoryMode === "rds") {
      return rdsGenerationJobRepository.getJob(jobId);
    }
    const job = jobStore.find((j) => j.id === jobId);
    if (!job) return null;
    const images = imageStore.filter((img) => img.jobId === jobId);
    return { job, images };
  },

  async getGeneratedImage(imageId) {
    const config = getRuntimeConfig();
    if (config.generationJobRepositoryMode === "rds") {
      return rdsGenerationJobRepository.getGeneratedImage(imageId);
    }
    return imageStore.find((img) => img.id === imageId) ?? null;
  },

  async listGeneratedImages(params = {}) {
    const config = getRuntimeConfig();
    if (config.generationJobRepositoryMode === "rds") {
      return rdsGenerationJobRepository.listGeneratedImages(params);
    }
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
    const config = getRuntimeConfig();
    if (config.generationJobRepositoryMode === "rds") {
      return rdsGenerationJobRepository.updateGeneratedImageSelection(imageId, selected);
    }
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
  if (config.generationMode === "grsai" && isGrsaiAvailable()) {
    return grsaiGenerationJobRepository;
  }
  return mockGenerationJobRepository;
}
