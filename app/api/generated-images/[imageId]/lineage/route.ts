import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";
import type { GeneratedImage, GenerationJob } from "@/lib/types";

type LineageNode = {
  image: GeneratedImage;
  role: "parent" | "current" | "sibling" | "child";
};

function readNumericInput(image: GeneratedImage, key: string): number | null {
  const value = image.inputsSnapshot?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getModeLabel(image: GeneratedImage): string {
  const mode = image.inputsSnapshot?.mode;
  if (mode === "partial_repaint") return "局部重绘";
  if (mode === "template_text_edit") return "模板改文字";
  if (mode === "template_replace") return "模板换产品";
  return "标准生成";
}

function getFeedback(image: GeneratedImage): string | null {
  return image.tags.find((tag) => tag.startsWith("feedback:"))?.replace("feedback:", "") ?? null;
}

function enrichNode(node: LineageNode) {
  return {
    ...node,
    modeLabel: getModeLabel(node.image),
    feedback: getFeedback(node.image),
    parentImageId: readNumericInput(node.image, "parentImageId"),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;
    const id = Number(imageId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "imageId must be a positive number"),
        { status: 400 }
      );
    }

    const repository = getGenerationJobRepository();
    const current = await repository.getGeneratedImage(id);
    if (!current) {
      return NextResponse.json(
        fail("NOT_FOUND", `Generated image ${imageId} not found`),
        { status: 404 }
      );
    }

    const currentJob = await repository.getJob(current.jobId);
    const parentImageId = readNumericInput(current, "parentImageId");
    const parent = parentImageId ? await repository.getGeneratedImage(parentImageId) : null;
    const recentImages = await repository.listGeneratedImages({ page: 1, pageSize: 100 });
    const children = recentImages.items.filter((image) => readNumericInput(image, "parentImageId") === current.id);
    const siblings = (currentJob?.images ?? []).filter((image) => image.id !== current.id);

    const nodes: LineageNode[] = [
      ...(parent ? [{ image: parent, role: "parent" as const }] : []),
      { image: current, role: "current" },
      ...siblings.map((image) => ({ image, role: "sibling" as const })),
      ...children.map((image) => ({ image, role: "child" as const })),
    ];

    const job: GenerationJob | null = currentJob?.job ?? null;

    return NextResponse.json(ok({
      currentImageId: current.id,
      job,
      nodes: nodes.map(enrichNode),
      summary: {
        hasParent: Boolean(parent),
        siblingCount: siblings.length,
        childCount: children.length,
      },
    }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to get image lineage"),
      { status: 500 }
    );
  }
}
