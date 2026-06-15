import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";
import { getImageQualityReviewRepository } from "@/lib/repositories/image-quality-reviews";

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

    const image = await getGenerationJobRepository().getGeneratedImage(id);
    if (!image) {
      return NextResponse.json(
        fail("NOT_FOUND", `Generated image ${imageId} not found`),
        { status: 404 }
      );
    }

    const qualityReview = await getImageQualityReviewRepository().getLatestByImage(id);

    return NextResponse.json(ok({
      imageId: id,
      qualityReview,
      summary: {
        hasReview: Boolean(qualityReview),
        reviewStatus: qualityReview?.reviewStatus ?? null,
        qualityStatus: qualityReview?.qualityStatus ?? null,
        workflowRunId: qualityReview?.workflowRunId ?? image.workflowRunId ?? null,
      },
    }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to get image quality review"),
      { status: 500 }
    );
  }
}
