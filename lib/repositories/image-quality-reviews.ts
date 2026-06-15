import type { ImageQualityReview, ImageQualityReviewInput, QualityReviewSource } from "../types";
import { getRuntimeConfig } from "../config";
import { getQualityWorkflowAdapter } from "../services/coze-quality-workflow";
import { rdsImageQualityReviewRepository } from "./rds-image-quality-reviews";

export type ImageQualityReviewRepository = {
  createPendingReview(input: ImageQualityReviewInput, reviewSource?: QualityReviewSource): Promise<number>;
  createMockSidecarReview(input: ImageQualityReviewInput): Promise<ImageQualityReview | null>;
  getLatestByImage(imageId: number): Promise<ImageQualityReview | null>;
  listByWorkflowRun(workflowRunId: string): Promise<ImageQualityReview[]>;
};

const mockReviewStore: ImageQualityReview[] = [];
let nextMockReviewId = 1;

export const mockImageQualityReviewRepository: ImageQualityReviewRepository = {
  async createPendingReview(input, reviewSource = "mock") {
    const now = new Date().toISOString();
    const review: ImageQualityReview = {
      ...input,
      id: nextMockReviewId++,
      reviewSource,
      reviewStatus: "pending",
      rejectReasons: [],
      retryCount: 0,
      updatedAt: now,
    };
    mockReviewStore.push(review);
    return review.id;
  },

  async createMockSidecarReview(input) {
    const reviewId = await this.createPendingReview(input, "mock");
    const adapter = getQualityWorkflowAdapter();
    const result = await adapter.reviewImage(input);
    const index = mockReviewStore.findIndex((review) => review.id === reviewId);
    if (index < 0) return null;
    const updated: ImageQualityReview = {
      ...mockReviewStore[index],
      ...result,
      reviewSource: "mock",
      updatedAt: new Date().toISOString(),
    };
    mockReviewStore[index] = updated;
    return updated;
  },

  async getLatestByImage(imageId) {
    return mockReviewStore
      .filter((review) => review.imageId === imageId && ["succeeded", "failed", "timeout", "skipped"].includes(review.reviewStatus))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)[0] ?? null;
  },

  async listByWorkflowRun(workflowRunId) {
    return mockReviewStore
      .filter((review) => review.workflowRunId === workflowRunId)
      .sort((a, b) => a.imageId - b.imageId || b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  },
};

export const rdsQualityReviewRepository: ImageQualityReviewRepository = {
  async createPendingReview(input, reviewSource = "coze_workflow") {
    return rdsImageQualityReviewRepository.createPendingReview(input, reviewSource);
  },

  async createMockSidecarReview(input) {
    const reviewId = await rdsImageQualityReviewRepository.createPendingReview(input, "mock");
    await rdsImageQualityReviewRepository.markRunning(reviewId);
    const adapter = getQualityWorkflowAdapter();
    const result = await adapter.reviewImage(input);
    return rdsImageQualityReviewRepository.markSucceeded(reviewId, result);
  },

  async getLatestByImage(imageId) {
    return rdsImageQualityReviewRepository.getLatestByImage(imageId);
  },

  async listByWorkflowRun(workflowRunId) {
    return rdsImageQualityReviewRepository.listByWorkflowRun(workflowRunId);
  },
};

export function getImageQualityReviewRepository(): ImageQualityReviewRepository {
  const config = getRuntimeConfig();
  return config.generationJobRepositoryMode === "rds" ? rdsQualityReviewRepository : mockImageQualityReviewRepository;
}
