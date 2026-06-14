import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getMysqlPool } from "@/lib/db/mysql";
import { getRuntimeConfig } from "@/lib/config";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";

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

type TemplateRow = {
  id: number;
  name: string;
  tags: string | string[] | null;
  oss_key: string;
  thumbnail_url: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function parseTags(value: string | string[] | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
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

async function persistTemplateFromUrl(sourceUrl: string, ossKey: string): Promise<string> {
  const config = getRuntimeConfig();
  if (config.oss.uploadTokenMode !== "aliyun") return sourceUrl;

  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`下载改字模板失败: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const client = getAliOssClient();
  await client.put(ossKey, buffer, { headers: { "Content-Type": guessContentType(sourceUrl, response) } });
  return toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 }));
}

export async function GET() {
  try {
    const pool = await getMysqlPool();
    const [rows] = await pool.query<TemplateRow[]>(
      "SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM template_library WHERE status = 'active' ORDER BY updated_at DESC"
    );
    const config = getRuntimeConfig();
    let client: ReturnType<typeof getAliOssClient> | null = null;
    if (config.oss.uploadTokenMode === "aliyun") {
      client = getAliOssClient();
    }
    const templates = rows.map((r) => {
      // Regenerate fresh signed URL from oss_key instead of using expired thumbnail_url
      let thumbnailUrl = toHttpsUrl(r.thumbnail_url);
      if (client && r.oss_key) {
        try {
          thumbnailUrl = toHttpsUrl(client.signatureUrl(r.oss_key, { method: "GET", expires: 3600 }));
        } catch { /* fallback to stored URL */ }
      }
      return {
        id: r.id,
        name: r.name,
        tags: parseTags(r.tags),
        ossKey: r.oss_key,
        thumbnailUrl,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
    return NextResponse.json(ok({ templates }));
  } catch (err) {
    return NextResponse.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "获取模板列表失败"),
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    const { action, templateId, originalText, replacementText, editInstruction } = body as {
      action?: string;
      templateId?: number;
      originalText?: string;
      replacementText?: string;
      editInstruction?: string;
    };

    if (action !== "text_edit") {
      return NextResponse.json(fail("VALIDATION_ERROR", "unsupported action"), { status: 400 });
    }
    if (!templateId || !originalText?.trim() || !replacementText?.trim()) {
      return NextResponse.json(fail("VALIDATION_ERROR", "templateId, originalText and replacementText are required"), { status: 400 });
    }

    try {
      const pool = await getMysqlPool();
      const [rows] = await pool.query<TemplateRow[]>(
        "SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM template_library WHERE id = :id AND status = 'active' LIMIT 1",
        { id: templateId }
      );
      const sourceTemplate = rows[0];
      if (!sourceTemplate) {
        return NextResponse.json(fail("NOT_FOUND", "模板不存在或已移入回收站"), { status: 404 });
      }

      const config = getRuntimeConfig();
      let templateImageUrl = toHttpsUrl(sourceTemplate.thumbnail_url);
      if (config.oss.uploadTokenMode === "aliyun" && sourceTemplate.oss_key) {
        try {
          templateImageUrl = toHttpsUrl(getAliOssClient().signatureUrl(sourceTemplate.oss_key, { method: "GET", expires: 3600 }));
        } catch { /* fallback to stored URL */ }
      }

      const result = await getGenerationJobRepository().createJob({
        templateId,
        templateName: `${sourceTemplate.name} 改字`,
        candidateCount: 1,
        exportSize: { name: "template_square", width: 800, height: 800 },
        inputs: {
          mode: "template_text_edit",
          templateImageUrl,
          originalText: originalText.trim(),
          replacementText: replacementText.trim(),
          editInstruction: editInstruction?.trim() ?? "",
          sourceTemplateId: templateId,
        },
      });
      const generated = result.images[0];
      if (!generated?.thumbnailUrl) {
        throw new Error("未生成可用模板图");
      }

      const timestamp = Date.now();
      const safeOriginal = originalText.trim().replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 18) || "text";
      const safeReplacement = replacementText.trim().replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 18) || "new";
      const ossKey = `templates/text-edits/${timestamp}_${templateId}_${safeOriginal}_to_${safeReplacement}.png`;
      const thumbnailUrl = await persistTemplateFromUrl(generated.thumbnailUrl, ossKey);
      const templateName = `${sourceTemplate.name}｜${originalText.trim()}改${replacementText.trim()}`;
      const tags = JSON.stringify([
        ...parseTags(sourceTemplate.tags),
        "text_edit",
        `from_template:${templateId}`,
        `replace:${originalText.trim()}=>${replacementText.trim()}`,
      ]);

      const [insertResult] = await pool.execute<{ insertId: number }>(
        "INSERT INTO template_library (name, tags, oss_key, thumbnail_url) VALUES (:name, :tags, :ossKey, :thumbnailUrl)",
        { name: templateName, tags, ossKey, thumbnailUrl }
      );

      return NextResponse.json(ok({
        template: {
          id: insertResult.insertId,
          name: templateName,
          tags: JSON.parse(tags),
          ossKey,
          thumbnailUrl,
          status: "active",
        },
        job: result.job,
        generatedImage: generated,
      }));
    } catch (err) {
      return NextResponse.json(
        fail("TEXT_EDIT_ERROR", err instanceof Error ? err.message : "文字修改失败"),
        { status: 500 }
      );
    }
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const name = formData.get("name") as string | null;

  if (!(file instanceof File)) {
    return NextResponse.json(fail("VALIDATION_ERROR", "file is required"), { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(fail("VALIDATION_ERROR", "只支持图片文件"), { status: 400 });
  }

  const config = getRuntimeConfig();
  const timestamp = Date.now();
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ossKey = `templates/${timestamp}_${sanitized}`;

  try {
    let thumbnailUrl = "";

    if (config.oss.uploadTokenMode === "aliyun") {
      const client = getAliOssClient();
      const buffer = Buffer.from(await file.arrayBuffer());
      await client.put(ossKey, buffer, { headers: { "Content-Type": file.type } });
      thumbnailUrl = toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 }));
    }

    const pool = await getMysqlPool();
    const templateName = name || sanitized.replace(/\.[^.]+$/, "");
    const [result] = await pool.execute<{ insertId: number }>(
      "INSERT INTO template_library (name, oss_key, thumbnail_url) VALUES (:name, :ossKey, :thumbnailUrl)",
      { name: templateName, ossKey, thumbnailUrl }
    );

    return NextResponse.json(ok({
      template: {
        id: result.insertId,
        name: templateName,
        ossKey,
        thumbnailUrl,
        status: "active",
      },
    }));
  } catch (err) {
    return NextResponse.json(
      fail("UPLOAD_ERROR", err instanceof Error ? err.message : "上传模板失败"),
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, name, status } = body as { id: number; name?: string; status?: string };

  if (!id) {
    return NextResponse.json(fail("VALIDATION_ERROR", "id is required"), { status: 400 });
  }

  try {
    const pool = await getMysqlPool();
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

    if (name !== undefined) { sets.push("name = :name"); params.name = name; }
    if (status !== undefined) { sets.push("status = :status"); params.status = status; }

    if (sets.length === 0) {
      return NextResponse.json(fail("VALIDATION_ERROR", "nothing to update"), { status: 400 });
    }

    await pool.execute(`UPDATE template_library SET ${sets.join(", ")} WHERE id = :id`, params);
    return NextResponse.json(ok({ updated: true }));
  } catch (err) {
    return NextResponse.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "更新失败"),
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(fail("VALIDATION_ERROR", "id is required"), { status: 400 });
  }

  try {
    const pool = await getMysqlPool();
    // Soft delete
    await pool.execute("UPDATE template_library SET status = 'archived' WHERE id = :id", { id: Number(id) });
    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    return NextResponse.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "删除失败"),
      { status: 500 }
    );
  }
}
