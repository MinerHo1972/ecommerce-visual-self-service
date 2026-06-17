import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getRuntimeConfig } from "@/lib/config";

export async function GET() {
  try {
    const config = getRuntimeConfig();
    const safeConfig = {
      appName: config.appName,
      templateRepositoryMode: config.templateRepositoryMode,
      generationJobRepositoryMode: config.generationJobRepositoryMode,
      generationMode: config.generationMode,
      qualityReviewEnabled: config.qualityReviewEnabled,
      oss: {
        region: config.oss.region,
        bucket: config.oss.bucket,
        publicBaseUrl: config.oss.publicBaseUrl ?? null,
        uploadTokenMode: config.oss.uploadTokenMode,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        buildTime: new Date().toISOString(),
      },
    };

    return NextResponse.json(ok(safeConfig));
  } catch (err) {
    return NextResponse.json(
      fail("CONFIG_ERROR", err instanceof Error ? err.message : "读取配置失败"),
      { status: 500 }
    );
  }
}
