import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;
    const id = Number(imageId);

    if (isNaN(id)) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "imageId must be a number"),
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

    return NextResponse.json(ok({ image }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to get generated image"),
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;
    const id = Number(imageId);

    if (isNaN(id)) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "imageId must be a number"),
        { status: 400 }
      );
    }

    let body: { selected?: unknown; feedback?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "Invalid JSON body"),
        { status: 400 }
      );
    }

    let image;
    if (typeof body.selected === "boolean") {
      image = await getGenerationJobRepository().updateGeneratedImageSelection(id, body.selected);
    } else if (typeof body.feedback === "string" && body.feedback.trim()) {
      const allowedFeedback = new Set(["product_wrong", "template_drift", "text_changed", "usable"]);
      const feedback = body.feedback.trim();
      if (!allowedFeedback.has(feedback)) {
        return NextResponse.json(
          fail("VALIDATION_ERROR", "feedback must be one of product_wrong, template_drift, text_changed, usable"),
          { status: 400 }
        );
      }
      image = await getGenerationJobRepository().updateGeneratedImageFeedback(id, feedback);
    } else {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "selected boolean or feedback string is required"),
        { status: 400 }
      );
    }

    if (!image) {
      return NextResponse.json(
        fail("NOT_FOUND", `Generated image ${imageId} not found`),
        { status: 404 }
      );
    }

    return NextResponse.json(ok({ image }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to update image selection"),
      { status: 500 }
    );
  }
}
