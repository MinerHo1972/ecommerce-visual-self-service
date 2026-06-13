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

function getStringInput(inputs: Record<string, unknown>, key: string): string | undefined {
  const value = inputs[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getRegionInput(inputs: Record<string, unknown>, key: string): { x: number; y: number; width: number; height: number } | undefined {
  const value = inputs[key];
  if (!value || typeof value !== "object") return undefined;
  const region = value as Record<string, unknown>;
  const x = typeof region.x === "number" ? region.x : undefined;
  const y = typeof region.y === "number" ? region.y : undefined;
  const width = typeof region.width === "number" ? region.width : undefined;
  const height = typeof region.height === "number" ? region.height : undefined;
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

function buildTemplateReplacePrompt(payload: CreateGenerationJobPayload, size: string): { prompt: string; urls: string[]; tags: string[] } {
  const productImageUrl = getStringInput(payload.inputs, "productImageUrl");
  const templateImageUrl = getStringInput(payload.inputs, "templateImageUrl");
  const productRegion = getRegionInput(payload.inputs, "productRegion");
  const productNote = getStringInput(payload.inputs, "productNote") ?? "使用产品图中的包装视觉";
  const templateNote = getStringInput(payload.inputs, "templateNote") ?? "严格沿用模板图";
  const customInstruction = getStringInput(payload.inputs, "customInstruction");
  const optimizeDirection = getStringInput(payload.inputs, "optimizeDirection");
  const optimizeDirectionLabel = getStringInput(payload.inputs, "optimizeDirectionLabel") ?? "继续优化";
  const parentImageId = getStringInput(payload.inputs, "parentImageId") ?? (typeof payload.inputs.parentImageId === "number" ? String(payload.inputs.parentImageId) : undefined);
  const parentImageUrl = getStringInput(payload.inputs, "parentImageUrl");
  const isIteration = Boolean(parentImageId || parentImageUrl);
  const iterationText = isIteration
    ? `这是继续优化轮次。上一轮用户选中的当前最佳基准图 ID=${parentImageId ?? "unknown"}，优化方向=${optimizeDirectionLabel}。必须以当前最佳基准图为父代做小步受控变体，不能推翻重来；如果不确定，优先保持父图效果。`
    : "这是首轮模板换产品。";
  const directionText = optimizeDirection === "product_prominence"
    ? "本轮只允许小幅提升商品清晰度、大小、主体存在感和销售视觉焦点，不得改变模板版式。"
    : optimizeDirection === "defect_fix"
      ? "本轮只允许修复商品边缘、变形、阴影、文字污染和局部破坏，不得重新设计画面。"
      : "本轮优先提升商品与模板的融合度、光影、材质和透视一致性，不得改变模板版式。";
  const regionText = productRegion
    ? `模板商品区域（相对模板图宽高的 0-1 坐标）：x=${productRegion.x}, y=${productRegion.y}, width=${productRegion.width}, height=${productRegion.height}。只替换这个矩形区域对应的原商品，区域外内容必须保持。`
    : "未提供模板商品区域；请尽量识别模板图中的原商品位置进行替换。";

  const referenceRoleText = isIteration
    ? "第 1 张和第 3 张是【产品图】，第 2 张是【当前最佳基准图/父图】，是上一轮用户选中的可回退版本。"
    : "第 1 张和第 3 张是【产品图】，是商品包装、品牌、颜色、文字和形态的唯一来源；第 2 张是【模板图】，只提供版式、文案、背景和商品槽位。";

  const prompt = `你是电商主图模板换产品生产引擎。输出尺寸：${size}。
参考图角色：${referenceRoleText}
任务：用第 1/3 张产品图中的商品包装视觉，替换第 2 张模板图中的原商品；模板图是最终构图，不是风格参考。
迭代策略：${iterationText}
本轮方向：${directionText}
商品区域约束：${regionText}
产品图要求：${productNote}。
模板图要求：${templateNote}。
用户补充指令：${customInstruction || "无"}。
硬性约束：
1. 保留模板图的构图、背景、文案、卖点标签、装饰元素、色块布局。
2. 只替换商品区域内的原商品；区域外的背景、文案、装饰、色块、边框和留白不要重绘。
3. 默认保留模板中的商品位置、大小、前后层级和阴影关系，不要重新排版；但如果用户补充指令明确要求产品数量跟输入产品图一致，则按输入产品图数量输出。
4. 产品图只提供包装视觉，不提供构图灵感；但商品本身必须严格来自产品图，不得臆造其他品牌或其他包装；当用户补充指令与模板商品数量冲突时，以用户补充指令和产品图数量优先。
5. 如果模板里有其他品牌商品，必须替换为产品图包装视觉，不得保留原品牌。
6. 不要新增袋装、小包装、杯子或模板中不存在的商品结构。
7. 如果无法完全替换，也优先保持模板保真，不要自由重绘整张图。`;

  return {
    prompt,
    // Put product first and repeat it to bias identity preservation; Grsai treats urls as loose references.
    urls: [productImageUrl, parentImageUrl ?? templateImageUrl, productImageUrl].filter((url): url is string => Boolean(url)),
    tags: ["grsai", "template_replace", "template_fidelity", ...(isIteration ? ["iteration", `parent:${parentImageId ?? "unknown"}`, `direction:${optimizeDirection ?? "template_fidelity"}`] : [])],
  };
}

async function generateCandidates(params: {
  jobId: string;
  mode: "template_replace" | "standard";
  prompt: string;
  size: string;
  count: number;
  referenceUrls: string[];
  hasProductRegion?: boolean;
}): Promise<string[]> {
  const { jobId, mode, prompt, size, count, referenceUrls, hasProductRegion } = params;
  console.info("[generation-jobs] generation start", {
    jobId,
    mode,
    count,
    referenceUrlCount: referenceUrls.length,
    ...(hasProductRegion === undefined ? {} : { hasProductRegion }),
  });
  const candidateUrls: string[] = [];
  const maxAttempts = Math.max(count * 2, count);
  for (let attempt = 0; attempt < maxAttempts && candidateUrls.length < count; attempt++) {
    try {
      const result = await generateImages(prompt, { aspectRatio: size, n: 1, urls: referenceUrls });
      const firstUrl = result[0];
      if (firstUrl) candidateUrls.push(firstUrl);
      console.info("[generation-jobs] generation candidate", {
        jobId,
        mode,
        attempt: attempt + 1,
        returned: result.length,
        accepted: candidateUrls.length,
      });
    } catch (candidateError) {
      console.error("[generation-jobs] generation candidate failed", {
        jobId,
        mode,
        attempt: attempt + 1,
        error: candidateError instanceof Error ? candidateError.message : String(candidateError),
      });
    }
  }
  if (candidateUrls.length === 0) throw new Error(`${mode} produced no candidates`);
  return candidateUrls;
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
  updateGeneratedImageFeedback(imageId: number, feedback: string): Promise<GeneratedImage | null>;
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

  async updateGeneratedImageFeedback(imageId, feedback) {
    const image = imageStore.find((img) => img.id === imageId);
    if (!image) return null;
    image.tags = [...image.tags.filter((tag) => !tag.startsWith("feedback:")), `feedback:${feedback}`];
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

    const isTemplateReplaceMode = payload.inputs.mode === "template_replace";
    let referenceUrls: string[] = [];
    let imageTags = ["grsai", "ai"];
    let prompt: string;

    if (isTemplateReplaceMode) {
      const built = buildTemplateReplacePrompt(payload, size);
      prompt = built.prompt;
      referenceUrls = built.urls;
      imageTags = built.tags;
    } else {
      // Extract text content from inputs for the prompt
      const textLines = Object.entries(payload.inputs)
        .filter(([, v]) => typeof v === "string" && v.length > 0 && !isDataUrl(v))
        .map(([k, v]) => `${k}: ${v}`);

      const referenceUrl = typeof payload.inputs.referenceImageUrl === "string" ? payload.inputs.referenceImageUrl : undefined;
      referenceUrls = referenceUrl ? [referenceUrl] : [];
      prompt = `生成一张电商商品主图，模板名称：${payload.templateName}，尺寸${size}。
画面中的文字内容：${textLines.join("、") || payload.templateName}。
${referenceUrl ? `参考上一轮候选图或参考图的构图、商品呈现和视觉风格：${referenceUrl}。` : ""}
要求：构图专业，商品突出，文字排版清晰可读，电商促销氛围，高清画质。`;
    }

    const config = getRuntimeConfig();
    const useRds = config.generationJobRepositoryMode === "rds";

    if (useRds) {
      // Create job record in RDS
      await rdsGenerationJobRepository.createJobRecord(jobId, payload, "queued");
    }

    let urls: string[];
    try {
      urls = await generateCandidates({
        jobId,
        mode: isTemplateReplaceMode ? "template_replace" : "standard",
        prompt,
        size,
        count,
        referenceUrls,
        hasProductRegion: isTemplateReplaceMode ? Boolean(getRegionInput(payload.inputs, "productRegion")) : undefined,
      });
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
          tags: imageTags,
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
      tags: imageTags,
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

  async updateGeneratedImageFeedback(imageId, feedback) {
    const config = getRuntimeConfig();
    if (config.generationJobRepositoryMode === "rds") {
      return rdsGenerationJobRepository.updateGeneratedImageFeedback(imageId, feedback);
    }
    const image = imageStore.find((img) => img.id === imageId);
    if (!image) return null;
    image.tags = [...image.tags.filter((tag) => !tag.startsWith("feedback:")), `feedback:${feedback}`];
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
