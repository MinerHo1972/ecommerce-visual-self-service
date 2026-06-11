import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { createSignedUrl } from "@/lib/oss";
import { getRuntimeConfig } from "@/lib/config";

type ReferenceImageItem = {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string;
  size: number;
  uploadedAt: string;
};

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

export async function GET() {
  const config = getRuntimeConfig();
  const prefix = "references/";

  try {
    if (config.oss.uploadTokenMode === "aliyun") {
      const client = getAliOssClient();
      const result = await client.list({ prefix, "max-keys": 200 });
      const objects = (result.objects ?? []) as Array<{ name: string; size: number; lastModified: string; url: string }>;

      const images: ReferenceImageItem[] = objects
        .filter((obj) => obj.name !== prefix && !obj.name.endsWith("/"))
        .map((obj) => {
          const signedUrl = client.signatureUrl(obj.name, { method: "GET", expires: 3600 });
          const fileName = obj.name.replace(prefix, "");
          return {
            id: obj.name,
            name: fileName,
            url: signedUrl,
            thumbnailUrl: signedUrl,
            size: obj.size,
            uploadedAt: obj.lastModified,
          };
        });

      return NextResponse.json(ok({ images }));
    }

    // mock mode
    return NextResponse.json(ok({ images: [] }));
  } catch (err) {
    return NextResponse.json(
      fail("OSS_ERROR", err instanceof Error ? err.message : "列举参考图失败"),
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    file_name?: string;
    content_type?: string;
    size?: number;
  };

  if (!payload.file_name) {
    return NextResponse.json(fail("VALIDATION_ERROR", "file_name is required"), { status: 400 });
  }

  const config = getRuntimeConfig();
  const timestamp = Date.now();
  const sanitized = payload.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ossKey = `references/${timestamp}_${sanitized}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  try {
    if (config.oss.uploadTokenMode === "aliyun") {
      const client = getAliOssClient();
      const uploadUrl = client.signatureUrl(ossKey, {
        method: "PUT",
        expires: 600,
        "Content-Type": payload.content_type ?? "image/png",
      });

      return NextResponse.json(ok({
        oss_key: ossKey,
        upload_url: uploadUrl,
        headers: { "Content-Type": payload.content_type ?? "image/png" },
        expires_at: expiresAt,
      }));
    }

    // mock mode
    const baseUrl = config.oss.publicBaseUrl ?? `https://${config.oss.bucket}.${config.oss.region}.aliyuncs.com`;
    return NextResponse.json(ok({
      oss_key: ossKey,
      upload_url: `${baseUrl}/${ossKey}?mock_upload_token=local-dev`,
      headers: { "content-type": payload.content_type ?? "image/png" },
      expires_at: expiresAt,
    }));
  } catch (err) {
    return NextResponse.json(
      fail("OSS_ERROR", err instanceof Error ? err.message : "签名失败"),
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

  const config = getRuntimeConfig();

  try {
    if (config.oss.uploadTokenMode === "aliyun") {
      const client = getAliOssClient();
      await client.delete(id);
      return NextResponse.json(ok({ deleted: true }));
    }
    // mock mode
    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    return NextResponse.json(
      fail("OSS_ERROR", err instanceof Error ? err.message : "删除失败"),
      { status: 500 }
    );
  }
}
