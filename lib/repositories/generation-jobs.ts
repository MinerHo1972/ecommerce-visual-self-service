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

function toHttpsUrl(url: string): string {
  return url.replace(/^http:\/\//, "https://");
}

function getAliOssClient() {
  const config = getRuntimeConfig();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OSS = require("ali-oss");
  return new OSS({
    region: config.oss.region,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    bucket: config.oss.bucket,
    authorization: "signature",
  });
}

function guessContentType(url: string, response: Response): string {
  const responseType = response.headers.get("content-type");
  if (responseType?.startsWith("image/")) return responseType.split(";")[0];
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  return "image/png";
}

async function persistGeneratedImageUrl(sourceUrl: string, ossKey: string): Promise<{ ossKey: string; thumbnailUrl: string }> {
  const config = getRuntimeConfig();
  if (config.oss.uploadTokenMode !== "aliyun") {
    return { ossKey, thumbnailUrl: sourceUrl };
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`下载生成图失败: ${response.status}`);
  }

  const contentType = guessContentType(sourceUrl, response);
  const buffer = Buffer.from(await response.arrayBuffer());
  const client = getAliOssClient();
  await client.put(ossKey, buffer, { headers: { "Content-Type": contentType } });
  return {
    ossKey,
    thumbnailUrl: toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 })),
  };
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

function buildTemplateTextEditPrompt(payload: CreateGenerationJobPayload, size: string): { prompt: string; urls: string[]; tags: string[] } {
  const templateImageUrl = getStringInput(payload.inputs, "templateImageUrl");
  const originalText = getStringInput(payload.inputs, "originalText") ?? "";
  const replacementText = getStringInput(payload.inputs, "replacementText") ?? "";
  const editInstruction = getStringInput(payload.inputs, "editInstruction");

  const prompt = `你是电商模板文字修改生产引擎。输出尺寸：${size}。
参考图角色：第 1 张是【原始设计模板】，必须作为最终构图和视觉风格的基准。
任务：在原始设计模板中只修改指定文字，生成一张可继续复用的新模板图。
文字修改：把画面中的“${originalText}”替换为“${replacementText}”。
运营补充要求：${editInstruction || "无"}。
硬性约束：
1. 只改指定文字，不要替换商品、背景、人物、装饰、色块、Logo、价格、卖点标签或其他非目标文字。
2. 新文字必须清晰可读，字体风格、颜色、描边、阴影、透视、排版位置尽量贴合原文字。
3. 如果新文字长度不同，允许在原文字区域内自适应字号、字距或换行，但不要改变整体版式。
4. 输出必须仍像同一套设计模板，只是运营主题文字被改写。
5. 不要额外添加不存在的促销文案，不要把整张图重新设计。`;

  return {
    prompt,
    urls: templateImageUrl ? [templateImageUrl] : [],
    tags: ["grsai", "template_text_edit", "template_library"],
  };
}

function buildPartialRepaintPrompt(payload: CreateGenerationJobPayload, size: string): { prompt: string; urls: string[]; tags: string[] } {
  const referenceImageUrl = getStringInput(payload.inputs, "referenceImageUrl");
  const repaintInstruction = getStringInput(payload.inputs, "repaintInstruction") ?? "修复框选区域的瑕疵";
  const repaintRegion = getRegionInput(payload.inputs, "repaintRegion");
  const parentImageId = getStringInput(payload.inputs, "parentImageId") ?? (typeof payload.inputs.parentImageId === "number" ? String(payload.inputs.parentImageId) : undefined);
  const regionText = repaintRegion
    ? `局部重绘区域（相对原图宽高的 0-1 坐标）：x=${repaintRegion.x}, y=${repaintRegion.y}, width=${repaintRegion.width}, height=${repaintRegion.height}。只允许修改这个矩形区域。`
    : "未提供局部区域；请只做最小必要修复。";

  const prompt = `你是电商图片局部重绘生产引擎。输出尺寸：${size}。
参考图角色：第 1 张是【当前成图/父图】，必须作为可回退基准。
任务：基于父图做局部重绘，只修改用户框选区域，生成一张新的候选图。
父图 ID：${parentImageId ?? "unknown"}。
局部区域：${regionText}
用户修图要求：${repaintInstruction}。
硬性约束：
1. 框选区域外的商品、文字、背景、装饰、Logo、价格、色块、版式必须保持不变。
2. 不要重绘整张图，不要改变画面主题，不要新增无关元素。
3. 框选区域内只执行用户要求的最小修改；如果是修瑕疵，优先保持原有纹理、光影和边缘连续。
4. 输出仍必须像同一张电商成图的局部修复版本。`;

  return {
    prompt,
    urls: referenceImageUrl ? [referenceImageUrl] : [],
    tags: ["grsai", "partial_repaint", `parent:${parentImageId ?? "unknown"}`],
  };
}

async function generateCandidates(params: {
  jobId: string;
  mode: "template_replace" | "template_text_edit" | "partial_repaint" | "standard";
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
  archiveGeneratedImage(imageId: number): Promise<GeneratedImage | null>;
  archiveGeneratedImages(imageIds: number[]): Promise<{ archivedIds: number[]; notFoundIds: number[] }>;
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
      if (image.status === "archived") return false;
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

  async archiveGeneratedImage(imageId) {
    const image = imageStore.find((img) => img.id === imageId);
    if (!image) return null;
    image.status = "archived";
    image.selected = false;
    return image;
  },

  async archiveGeneratedImages(imageIds) {
    const uniqueIds = Array.from(new Set(imageIds));
    const archivedIds: number[] = [];
    for (const image of imageStore) {
      if (uniqueIds.includes(image.id)) {
        image.status = "archived";
        image.selected = false;
        archivedIds.push(image.id);
      }
    }
    return {
      archivedIds,
      notFoundIds: uniqueIds.filter((id) => !archivedIds.includes(id)),
    };
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
    const isTemplateTextEditMode = payload.inputs.mode === "template_text_edit";
    const isPartialRepaintMode = payload.inputs.mode === "partial_repaint";
    let referenceUrls: string[] = [];
    let imageTags = ["grsai", "ai"];
    let prompt: string;

    if (isTemplateReplaceMode) {
      const built = buildTemplateReplacePrompt(payload, size);
      prompt = built.prompt;
      referenceUrls = built.urls;
      imageTags = built.tags;
    } else if (isTemplateTextEditMode) {
      const built = buildTemplateTextEditPrompt(payload, size);
      prompt = built.prompt;
      referenceUrls = built.urls;
      imageTags = built.tags;
    } else if (isPartialRepaintMode) {
      const built = buildPartialRepaintPrompt(payload, size);
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
        mode: isTemplateReplaceMode ? "template_replace" : isTemplateTextEditMode ? "template_text_edit" : isPartialRepaintMode ? "partial_repaint" : "standard",
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
        const ossKey = `generated/grsai/${jobId}/candidate_${i + 1}.png`;
        const persisted = await persistGeneratedImageUrl(urls[i], ossKey);
        const imageBase: Omit<GeneratedImage, "id"> = {
          jobId,
          templateId: payload.templateId,
          templateName: payload.templateName,
          title: `${payload.templateName} 候选 ${i + 1}`,
          scene: "main_image",
          platform: "tmall",
          ossKey: persisted.ossKey,
          thumbnailUrl: persisted.thumbnailUrl,
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
      if (image.status === "archived") return false;
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

  async archiveGeneratedImage(imageId) {
    const config = getRuntimeConfig();
    if (config.generationJobRepositoryMode === "rds") {
      return rdsGenerationJobRepository.archiveGeneratedImage(imageId);
    }
    const image = imageStore.find((img) => img.id === imageId);
    if (!image) return null;
    image.status = "archived";
    image.selected = false;
    return image;
  },

  async archiveGeneratedImages(imageIds) {
    const config = getRuntimeConfig();
    if (config.generationJobRepositoryMode === "rds") {
      return rdsGenerationJobRepository.archiveGeneratedImages(imageIds);
    }
    const uniqueIds = Array.from(new Set(imageIds));
    const archivedIds: number[] = [];
    for (const image of imageStore) {
      if (uniqueIds.includes(image.id)) {
        image.status = "archived";
        image.selected = false;
        archivedIds.push(image.id);
      }
    }
    return {
      archivedIds,
      notFoundIds: uniqueIds.filter((id) => !archivedIds.includes(id)),
    };
  },
};

export function getGenerationJobRepository(): GenerationJobRepository {
  const config = getRuntimeConfig();
  if (config.generationMode === "grsai" && isGrsaiAvailable()) {
    return grsaiGenerationJobRepository;
  }
  return mockGenerationJobRepository;
}
