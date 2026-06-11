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

    let body: { selected?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "Invalid JSON body"),
        { status: 400 }
      );
    }

    if (typeof body.selected !== "boolean") {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "selected must be a boolean"),
        { status: 400 }
      );
    }

    const image = await getGenerationJobRepository().updateGeneratedImageSelection(id, body.selected);

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
