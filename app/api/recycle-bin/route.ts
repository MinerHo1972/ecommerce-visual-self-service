import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getRuntimeConfig } from "@/lib/config";
import { getMysqlPool } from "@/lib/db/mysql";

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

type LibraryType = "product" | "template" | "generated";

type LibraryRow = {
  id: number;
  name: string;
  tags: string | null;
  oss_key: string;
  thumbnail_url: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type GeneratedImageRow = {
  id: number;
  title: string | null;
  tags: string | null;
  oss_key: string | null;
  thumbnail_url: string | null;
  status: string;
  created_at: string;
};

function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
}

function freshUrl(client: ReturnType<typeof getAliOssClient> | null, ossKey: string, storedUrl: string) {
  if (!ossKey && !storedUrl) return "";
  let thumbnailUrl = storedUrl ? toHttpsUrl(storedUrl) : "";
  if (client && ossKey) {
    try {
      thumbnailUrl = toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 }));
    } catch {
      // fall back to stored URL
    }
  }
  return thumbnailUrl;
}

export async function GET() {
  try {
    const pool = await getMysqlPool();
    const config = getRuntimeConfig();
    const client = config.oss.uploadTokenMode === "aliyun" ? getAliOssClient() : null;

    const [productRows] = await pool.query<LibraryRow[]>(
      "SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM product_library WHERE status = 'archived' ORDER BY updated_at DESC"
    );
    const [templateRows] = await pool.query<LibraryRow[]>(
      "SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM template_library WHERE status = 'archived' ORDER BY updated_at DESC"
    );
    const [generatedRows] = await pool.query<GeneratedImageRow[]>(
      "SELECT id, title, tags, oss_key, thumbnail_url, status, created_at FROM generated_images WHERE status IN ('archived', 'deleted') ORDER BY created_at DESC LIMIT 200"
    );

    const products = productRows.map((row) => ({
      id: row.id,
      type: "product" as const,
      name: row.name,
      tags: parseTags(row.tags),
      ossKey: row.oss_key,
      thumbnailUrl: freshUrl(client, row.oss_key, row.thumbnail_url),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    const templates = templateRows.map((row) => ({
      id: row.id,
      type: "template" as const,
      name: row.name,
      tags: parseTags(row.tags),
      ossKey: row.oss_key,
      thumbnailUrl: freshUrl(client, row.oss_key, row.thumbnail_url),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    const generated = generatedRows.map((row) => ({
      id: row.id,
      type: "generated" as const,
      name: row.title ?? `历史成图 #${row.id}`,
      tags: parseTags(row.tags),
      ossKey: row.oss_key ?? "",
      thumbnailUrl: freshUrl(client, row.oss_key ?? "", row.thumbnail_url ?? ""),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.created_at,
    }));

    return NextResponse.json(ok({
      items: [...products, ...templates, ...generated],
      counts: {
        products: products.length,
        templates: templates.length,
        generated: generated.length,
        total: products.length + templates.length + generated.length,
      },
    }));
  } catch (error) {
    return NextResponse.json(
      fail("DB_ERROR", error instanceof Error ? error.message : "获取回收站失败"),
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { type?: LibraryType; id?: number };
    const id = Number(body.id);
    if (!body.type || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json(fail("VALIDATION_ERROR", "type and valid id are required"), { status: 400 });
    }

    const pool = await getMysqlPool();
    if (body.type === "product") {
      await pool.execute("UPDATE product_library SET status = 'active' WHERE id = :id AND status = 'archived'", { id });
    } else if (body.type === "template") {
      await pool.execute("UPDATE template_library SET status = 'active' WHERE id = :id AND status = 'archived'", { id });
    } else if (body.type === "generated") {
      await pool.execute("UPDATE generated_images SET status = 'succeeded' WHERE id = :id AND status IN ('archived', 'deleted')", { id });
    } else {
      return NextResponse.json(fail("VALIDATION_ERROR", "unsupported recycle bin item type"), { status: 400 });
    }

    return NextResponse.json(ok({ restored: true, id, type: body.type }));
  } catch (error) {
    return NextResponse.json(
      fail("DB_ERROR", error instanceof Error ? error.message : "恢复失败"),
      { status: 500 }
    );
  }
}
