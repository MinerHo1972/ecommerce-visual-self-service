import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";

const triageValues = new Set(["useful", "staged", "abandoned"]);

function normalizeFeedback(value: string) {
  const feedback = value.trim().replace(/^feedback:/i, "").replace(/[<>]/g, "").slice(0, 24).trim();
  return feedback || null;
}

function normalizeTriage(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const triage = value.trim().replace(/^triage:/i, "");
  return triageValues.has(triage) ? triage : undefined;
}

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

    let body: { selected?: unknown; feedback?: unknown; triage?: unknown };
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
      const feedback = normalizeFeedback(body.feedback);
      if (!feedback) {
        return NextResponse.json(
          fail("VALIDATION_ERROR", "feedback must be a non-empty string"),
          { status: 400 }
        );
      }
      image = await getGenerationJobRepository().updateGeneratedImageFeedback(id, feedback);
    } else if (Object.prototype.hasOwnProperty.call(body, "triage")) {
      const triage = normalizeTriage(body.triage);
      if (triage === undefined) {
        return NextResponse.json(
          fail("VALIDATION_ERROR", "triage must be useful, staged, abandoned, or empty"),
          { status: 400 }
        );
      }
      image = await getGenerationJobRepository().updateGeneratedImageTriage(id, triage);
    } else {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "selected boolean, feedback string, or triage value is required"),
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

export async function DELETE(
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

    const image = await getGenerationJobRepository().archiveGeneratedImage(id);

    if (!image) {
      return NextResponse.json(
        fail("NOT_FOUND", `Generated image ${imageId} not found`),
        { status: 404 }
      );
    }

    return NextResponse.json(ok({ image }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to move generated image to recycle bin"),
      { status: 500 }
    );
  }
}
