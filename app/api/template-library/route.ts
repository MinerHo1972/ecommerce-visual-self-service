import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getMysqlPool } from "@/lib/db/mysql";
import { getRuntimeConfig } from "@/lib/config";

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
  tags: string | null;
  oss_key: string;
  thumbnail_url: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  try {
    const pool = await getMysqlPool();
    const [rows] = await pool.query<TemplateRow[]>(
      "SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM template_library WHERE status = 'active' ORDER BY updated_at DESC"
    );
    const templates = rows.map((r) => ({
      id: r.id,
      name: r.name,
      tags: r.tags ? JSON.parse(r.tags) : [],
      ossKey: r.oss_key,
      thumbnailUrl: toHttpsUrl(r.thumbnail_url),
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return NextResponse.json(ok({ templates }));
  } catch (err) {
    return NextResponse.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "获取模板列表失败"),
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
