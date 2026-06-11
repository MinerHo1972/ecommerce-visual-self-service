import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const selected = searchParams.get("selected");
    const result = await getGenerationJobRepository().listGeneratedImages({
      keyword: searchParams.get("keyword") ?? undefined,
      templateId: searchParams.get("template_id") ? Number(searchParams.get("template_id")) : undefined,
      status: searchParams.get("status") ?? undefined,
      selected: selected === null ? undefined : selected === "true",
      page: Number(searchParams.get("page") ?? 1),
      pageSize: Number(searchParams.get("page_size") ?? 20)
    });

    return NextResponse.json(ok(result));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to list generated images"),
      { status: 500 }
    );
  }
}
