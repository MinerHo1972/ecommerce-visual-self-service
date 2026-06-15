import type {
  ImageQualityReviewInput,
  ImageQualityReviewResult,
  QualityRejectReason,
  QualityReviewStatus,
  QualitySuggestedAction,
  QualityStatus,
  QualityVlmScores,
  QualityWorkflowAdapter,
} from "../types";

/* ------------------------------------------------------------------ */
/* Mock adapter (unchanged)                                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Real Coze workflow adapter                                         */
/* ------------------------------------------------------------------ */

const COZE_API_BASE = "https://api.coze.cn";
const COZE_WORKFLOW_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Shape of the Coze workflow API response (sync mode).
 */
type CozeWorkflowResponse = {
  code: number;
  msg: string;
  cost?: string;
  data?: string; // JSON string with workflow output
  debug_url?: string;
  token?: number;
};

/**
 * Expected shape of the workflow output JSON (parsed from `data`).
 * This must match the Coze workflow's end-node output schema.
 */
type CozeQualityWorkflowOutput = {
  quality_status: QualityStatus;
  confidence: number;
  vlm_scores?: Partial<Record<keyof QualityVlmScores, number>>;
  reject_reasons?: QualityRejectReason[];
  suggested_action?: QualitySuggestedAction;
};

function parseCozeResponse(
  body: CozeWorkflowResponse,
  imageId: number,
  startedAt: string,
): ImageQualityReviewResult {
  const finishedAt = new Date().toISOString();

  if (body.code !== 0) {
    return {
      imageId,
      reviewStatus: "failed",
      rejectReasons: [],
      cozeWorkflowRunId: null,
      rawTraceUrl: body.debug_url ?? null,
      errorCode: `coze_code_${body.code}`,
      errorMessage: body.msg || "Coze workflow returned non-zero code",
      startedAt,
      finishedAt,
    };
  }

  let parsed: CozeQualityWorkflowOutput;
  try {
    parsed = JSON.parse(body.data || "{}");
  } catch {
    parsed = {} as CozeQualityWorkflowOutput;
  }

  const vlmScores: QualityVlmScores = {
    productFidelity: clampScore(parsed.vlm_scores?.productFidelity ?? 0),
    brandCompliance: clampScore(parsed.vlm_scores?.brandCompliance ?? 0),
    templateFidelity: clampScore(parsed.vlm_scores?.templateFidelity ?? 0),
    visualQuality: clampScore(parsed.vlm_scores?.visualQuality ?? 0),
    productCount: clampScore(parsed.vlm_scores?.productCount ?? 0),
  };

  return {
    imageId,
    reviewStatus: "succeeded",
    qualityStatus: parsed.quality_status,
    confidence: parsed.confidence !== undefined ? clampScore(parsed.confidence) : undefined,
    vlmScores,
    rejectReasons: parsed.reject_reasons ?? [],
    suggestedAction: parsed.suggested_action,
    cozeWorkflowRunId: null,
    rawTraceUrl: body.debug_url ?? null,
    startedAt,
    finishedAt,
  };
}

export const realCozeQualityWorkflowAdapter: QualityWorkflowAdapter = {
  async reviewImage(input: ImageQualityReviewInput): Promise<ImageQualityReviewResult> {
    const startedAt = new Date().toISOString();
    const pat = process.env.COZE_PAT;
    const workflowId = process.env.COZE_QUALITY_WORKFLOW_ID;

    if (!pat || !workflowId) {
      return {
        imageId: input.imageId,
        reviewStatus: "skipped",
        rejectReasons: [],
        errorCode: "missing_credentials",
        errorMessage: "COZE_PAT or COZE_QUALITY_WORKFLOW_ID not configured",
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    const payload = {
      workflow_id: workflowId,
      parameters: {
        candidate_image_url: input.candidateImageUrl,
        reference_images: JSON.stringify(input.referenceImages),
        workflow_type: input.workflowType ?? "template_replace",
        prompt: input.promptTrace?.prompt ?? "",
        constraint_preset: input.constraintPreset ?? "",
        image_id: String(input.imageId),
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), COZE_WORKFLOW_TIMEOUT_MS);

    try {
      const res = await fetch(`${COZE_API_BASE}/v1/workflow/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const body = (await res.json()) as CozeWorkflowResponse;
      return parseCozeResponse(body, input.imageId, startedAt);
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return {
        imageId: input.imageId,
        reviewStatus: isTimeout ? "timeout" : "failed",
        rejectReasons: [],
        errorCode: isTimeout ? "timeout" : "fetch_error",
        errorMessage: err instanceof Error ? err.message : String(err),
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};

/* ------------------------------------------------------------------ */
/* Availability + adapter selection                                   */
/* ------------------------------------------------------------------ */

export function isCozeQualityWorkflowAvailable(): boolean {
  const pat = process.env.COZE_PAT;
  const workflowId = process.env.COZE_QUALITY_WORKFLOW_ID;
  return Boolean(pat && workflowId);
}

export function getQualityWorkflowAdapter(): QualityWorkflowAdapter {
  return isCozeQualityWorkflowAvailable()
    ? realCozeQualityWorkflowAdapter
    : mockCozeQualityWorkflowAdapter;
}
