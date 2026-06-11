import { getMysqlPool } from "../db/mysql";
import type { CreateGenerationJobPayload, GeneratedImage, GenerationJob } from "../types";

type GenerationJobRow = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  template_id: number | null;
  candidate_count: number;
  inputs_snapshot: string | null;
  created_at: Date;
};

type GeneratedImageRow = {
  id: number;
  job_id: string;
  template_id: number | null;
  template_name: string | null;
  title: string | null;
  scene: string | null;
  platform: string | null;
  oss_key: string | null;
  thumbnail_url: string | null;
  width: number;
  height: number;
  status: "queued" | "running" | "succeeded" | "failed";
  selected: number;
  tags: string | null;
  inputs_snapshot: string | null;
  created_at: Date;
};

function mapJobRow(row: GenerationJobRow): GenerationJob {
  return {
    id: row.id,
    status: row.status,
    templateId: row.template_id ?? 0,
    candidateCount: row.candidate_count,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
}

function parseInputsSnapshot(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function mapImageRow(row: GeneratedImageRow): GeneratedImage {
  const tags = parseTags(row.tags);
  const inputsSnapshot = parseInputsSnapshot(row.inputs_snapshot);
  return {
    id: row.id,
    jobId: row.job_id,
    templateId: row.template_id ?? 0,
    templateName: row.template_name ?? "",
    title: row.title ?? "",
    scene: row.scene ?? "main_image",
    platform: row.platform ?? "tmall",
    ossKey: row.oss_key ?? "",
    thumbnailUrl: row.thumbnail_url ?? "",
    width: row.width,
    height: row.height,
    status: row.status,
    selected: row.selected === 1,
    tags,
    createdAt: new Date(row.created_at).toISOString(),
    inputsSnapshot,
  };
}

function normalizePagination(page = 1, pageSize = 20) {
  return { page: Math.max(1, page), pageSize: Math.min(Math.max(1, pageSize), 100) };
}

function buildInputsSnapshot(inputs: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === "string") {
      if (!value.startsWith("data:")) snapshot[key] = value;
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

export const rdsGenerationJobRepository = {
  async createJobRecord(jobId: string, payload: CreateGenerationJobPayload, status: GenerationJob["status"] = "queued"): Promise<GenerationJob> {
    const pool = await getMysqlPool();
    const inputsSnapshot = JSON.stringify(buildInputsSnapshot(payload.inputs));
    await pool.execute(
      `INSERT INTO generation_jobs (id, status, template_id, candidate_count, inputs_snapshot)
       VALUES (:id, :status, :templateId, :candidateCount, :inputsSnapshot)`,
      {
        id: jobId,
        status,
        templateId: payload.templateId,
        candidateCount: payload.candidateCount ?? 4,
        inputsSnapshot,
      }
    );
    return {
      id: jobId,
      status,
      templateId: payload.templateId,
      candidateCount: payload.candidateCount ?? 4,
      createdAt: new Date().toISOString(),
    };
  },

  async updateJobStatus(jobId: string, status: GenerationJob["status"]): Promise<void> {
    const pool = await getMysqlPool();
    await pool.execute(
      `UPDATE generation_jobs SET status = :status WHERE id = :id`,
      { id: jobId, status }
    );
  },

  async insertImage(image: Omit<GeneratedImage, "id">): Promise<number> {
    const pool = await getMysqlPool();
    const [result] = await pool.execute<{ insertId: number }>(
      `INSERT INTO generated_images (job_id, template_id, template_name, title, scene, platform, oss_key, thumbnail_url, width, height, status, selected, tags, inputs_snapshot)
       VALUES (:jobId, :templateId, :templateName, :title, :scene, :platform, :ossKey, :thumbnailUrl, :width, :height, :status, :selected, :tags, :inputsSnapshot)`,
      {
        jobId: image.jobId,
        templateId: image.templateId,
        templateName: image.templateName,
        title: image.title,
        scene: image.scene,
        platform: image.platform,
        ossKey: image.ossKey,
        thumbnailUrl: image.thumbnailUrl,
        width: image.width,
        height: image.height,
        status: image.status,
        selected: image.selected ? 1 : 0,
        tags: JSON.stringify(image.tags ?? []),
        inputsSnapshot: image.inputsSnapshot ? JSON.stringify(image.inputsSnapshot) : null,
      }
    );
    return result.insertId;
  },

  async getJob(jobId: string): Promise<{ job: GenerationJob; images: GeneratedImage[] } | null> {
    const pool = await getMysqlPool();
    const [jobRows] = await pool.query<GenerationJobRow[]>(
      `SELECT id, status, template_id, candidate_count, inputs_snapshot, created_at
       FROM generation_jobs WHERE id = :id LIMIT 1`,
      { id: jobId }
    );
    if (jobRows.length === 0) return null;

    const [imageRows] = await pool.query<GeneratedImageRow[]>(
      `SELECT id, job_id, template_id, template_name, title, scene, platform, oss_key, thumbnail_url, width, height, status, selected, tags, inputs_snapshot, created_at
       FROM generated_images WHERE job_id = :jobId
       ORDER BY id ASC`,
      { jobId }
    );

    return {
      job: mapJobRow(jobRows[0]),
      images: imageRows.map(mapImageRow),
    };
  },

  async getGeneratedImage(imageId: number): Promise<GeneratedImage | null> {
    const pool = await getMysqlPool();
    const [rows] = await pool.query<GeneratedImageRow[]>(
      `SELECT id, job_id, template_id, template_name, title, scene, platform, oss_key, thumbnail_url, width, height, status, selected, tags, inputs_snapshot, created_at
       FROM generated_images WHERE id = :id LIMIT 1`,
      { id: imageId }
    );
    return rows[0] ? mapImageRow(rows[0]) : null;
  },

  async listGeneratedImages(params: {
    keyword?: string;
    templateId?: number;
    status?: string;
    selected?: boolean;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ items: GeneratedImage[]; page: number; page_size: number; total: number }> {
    const pool = await getMysqlPool();
    const { page, pageSize } = normalizePagination(params.page, params.pageSize);

    const where: string[] = [];
    const values: Record<string, unknown> = { limit: pageSize, offset: (page - 1) * pageSize };

    if (params.keyword) {
      where.push("(title LIKE :keyword OR template_name LIKE :keyword)");
      values.keyword = `%${params.keyword}%`;
    }
    if (params.templateId) {
      where.push("template_id = :templateId");
      values.templateId = params.templateId;
    }
    if (params.status) {
      where.push("status = :status");
      values.status = params.status;
    }
    if (typeof params.selected === "boolean") {
      where.push("selected = :selected");
      values.selected = params.selected ? 1 : 0;
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query<GeneratedImageRow[]>(
      `SELECT id, job_id, template_id, template_name, title, scene, platform, oss_key, thumbnail_url, width, height, status, selected, tags, inputs_snapshot, created_at
       FROM generated_images ${whereSql}
       ORDER BY created_at DESC
       LIMIT :limit OFFSET :offset`,
      values
    );

    const [countRows] = await pool.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM generated_images ${whereSql}`,
      values
    );

    return {
      items: rows.map(mapImageRow),
      page,
      page_size: pageSize,
      total: Number(countRows[0]?.total ?? 0),
    };
  },

  async updateGeneratedImageSelection(imageId: number, selected: boolean): Promise<GeneratedImage | null> {
    const pool = await getMysqlPool();

    const image = await this.getGeneratedImage(imageId);
    if (!image) return null;

    if (selected) {
      // Unselect other images in the same job
      await pool.execute(
        `UPDATE generated_images SET selected = 0 WHERE job_id = :jobId AND id != :imageId`,
        { jobId: image.jobId, imageId }
      );
    }

    await pool.execute(
      `UPDATE generated_images SET selected = :selected WHERE id = :id`,
      { id: imageId, selected: selected ? 1 : 0 }
    );

    return this.getGeneratedImage(imageId);
  },
};
