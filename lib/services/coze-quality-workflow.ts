import type {
  ImageQualityReviewInput,
  ImageQualityReviewResult,
  QualityRejectReason,
  QualitySuggestedAction,
  QualityStatus,
  QualityVlmScores,
  QualityWorkflowAdapter,
} from "../types";

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function buildScores(input: ImageQualityReviewInput): QualityVlmScores {
  const hasPrompt = Boolean(input.promptTrace?.prompt);
  const hasReferences = input.referenceImages.length > 0;
  const isTextEdit = input.workflowType === "template_text_edit";
  const isPartialRepaint = input.workflowType === "partial_repaint";

  return {
    productFidelity: clampScore(hasReferences ? 0.9 : 0.72),
    brandCompliance: clampScore(hasPrompt ? 0.86 : 0.68),
    templateFidelity: clampScore(isPartialRepaint ? 0.82 : 0.88),
    visualQuality: clampScore(input.candidateImageUrl ? 0.9 : 0.5),
    productCount: clampScore(isTextEdit ? 0.96 : 0.9),
  };
}

function averageScore(scores: QualityVlmScores): number {
  const values = [
    scores.productFidelity,
    scores.brandCompliance,
    scores.templateFidelity,
    scores.visualQuality,
    scores.productCount,
  ];
  return clampScore(values.reduce((sum, score) => sum + score, 0) / values.length);
}

function classifyReview(confidence: number, input: ImageQualityReviewInput): {
  qualityStatus: QualityStatus;
  suggestedAction: QualitySuggestedAction;
  rejectReasons: QualityRejectReason[];
} {
  const rejectReasons: QualityRejectReason[] = [];
  if (!input.promptTrace?.prompt) rejectReasons.push("missing_trace");
  if (!input.candidateImageUrl) rejectReasons.push("unreadable_image");
  if (confidence < 0.8) rejectReasons.push("low_confidence");

  if (!input.candidateImageUrl || confidence < 0.65) {
    return { qualityStatus: "fail", suggestedAction: "manual_review", rejectReasons };
  }
  if (rejectReasons.length > 0 || confidence < 0.86) {
    return { qualityStatus: "review", suggestedAction: "manual_review", rejectReasons };
  }
  return { qualityStatus: "pass", suggestedAction: "accept", rejectReasons };
}

export const mockCozeQualityWorkflowAdapter: QualityWorkflowAdapter = {
  async reviewImage(input: ImageQualityReviewInput): Promise<ImageQualityReviewResult> {
    const startedAt = new Date().toISOString();
    const scores = buildScores(input);
    const confidence = averageScore(scores);
    const classification = classifyReview(confidence, input);
    const finishedAt = new Date().toISOString();

    return {
      imageId: input.imageId,
      reviewStatus: "succeeded",
      qualityStatus: classification.qualityStatus,
      confidence,
      vlmScores: scores,
      rejectReasons: classification.rejectReasons,
      suggestedAction: classification.suggestedAction,
      cozeWorkflowRunId: `mock_quality_${input.imageId}_${Date.now()}`,
      rawTraceUrl: null,
      startedAt,
      finishedAt,
    };
  },
};

export function isCozeQualityWorkflowAvailable(): boolean {
  return false;
}

export function getQualityWorkflowAdapter(): QualityWorkflowAdapter {
  return mockCozeQualityWorkflowAdapter;
}
