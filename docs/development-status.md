# Development Status

## 2026-06-10

Implemented first development slice:

- Next.js + React + TypeScript project skeleton.
- Domain types for prompt templates, layer templates, export sizes, quality checks.
- Sample 618 and 双11 layer templates.
- Browser Canvas renderer with layered rendering, text AutoShrink, rerender-based export size scaling, safe-margin overlay, and text overflow checks.
- MVP pages for operations workspace and development preview.
- Mock APIs for layer templates and tags.
- Local initial schema copy.

Implemented second development slice:

- Unified API response envelope with request ids.
- Adapter boundary for template repositories.
- Mock OSS upload-token and signed-url APIs aligned with the API contract.
- Layer template JSON validation API.
- Aliyun ECS/RDS/OSS deployment notes and environment variable checklist.

Implemented third development slice:

- Template management view is now a real admin workspace.
- Added two-click coordinate picker for product slot areas.
- Coordinate picker updates both target product layer `area` and `focusArea`.
- Added live preview, validation results, and JSON copy action for template drafts.

Implemented fourth development slice:

- Added `GET/PATCH /api/layer-templates/{id}` for template draft persistence.
- Mock template repository now supports in-memory updates and version bumping.
- Template admin save button calls the PATCH API and reports save state.
- Added product image upload entry that requests OSS upload-token mock data.

Implemented fifth development slice:

- Added `TEMPLATE_REPOSITORY_MODE` to switch template persistence between mock and RDS.
- Added MySQL pool boundary and RDS template repository for list/get/update layer templates.
- Added DB row mapper from `layer_templates` to the domain `LayerTemplate` contract.
- Updated Aliyun deployment notes with RDS repository mode instructions.

Implemented sixth development slice:

- Added generated image domain type and mock history records.
- Added `GET /api/generated-images` with keyword, template, status, selected, and pagination filters.
- Added history gallery view with filters, selected badges, reuse/export actions, and empty state.
- Added `generated_images` schema draft for future RDS-backed history.

Next slice:

- Execute real OSS PUT upload after Aliyun credentials are available.
- Add generation jobs and RDS-backed generated image history.

## 2026-06-14

Product 2.0 planning documents added:

- `CONTEXT.md`: project terminology for workflow-oriented product language.
- `docs/prd/product-2-workflow-direction.md`: product 2.0 direction document.
- `docs/prd/product-2-mvp-prd.md`: executable MVP PRD for workflow console migration.
- `docs/adr/0001-web-as-workflow-console.md`: decision to keep Web as visual workflow console while introducing workflow core and Coze/Agent orchestration.
- `docs/adr/0002-minimal-workflow-relations.md`: adopted minimal workflow/run/step relation fields on `generated_images`; VLM quality scoring will use a separate future log table/event stream.
- `docs/adr/0003-stage-verified-execution.md`: adopted stage maps, failable checks, and skeptical handoff notes for complex slices before Slice 7.
- `docs/adr/0004-first-coze-workflow-node-quality-gate.md`: Slice 7 proposal choosing automatic quality review as the first Coze workflow node, with input/output and failure boundaries.
- `docs/adr/0005-image-quality-review-log.md`: Slice 7A data design for the `image_quality_reviews` log table/event shape, including fields, indexes, write timing, retry, and backfill strategy.

Next suggested slice:

- Start Slice 7D to add async sidecar triggering and read-only quality review display.
- Keep real Coze/VLM calls disabled until the sidecar path, retry policy, and cost boundary are proven.

Slice 7C completed:

- Added `db/005_image_quality_reviews.sql` with the standalone `image_quality_reviews` table and first-pass indexes.
- Added `lib/repositories/rds-image-quality-reviews.ts` with create pending, mark running, mark succeeded, mark failed/timeout/skipped, retry count, latest-by-image, and list-by-workflow-run methods.
- Kept generation jobs unchanged; no real Coze workflow, VLM call, or main generation path change was introduced.

Slice 7B completed:

- Added TypeScript contracts for image quality review inputs, results, statuses, scores, reject reasons, and human decisions.
- Added a mockable quality workflow adapter at `lib/services/coze-quality-workflow.ts`.
- The adapter returns deterministic mock review results and keeps real Coze workflow availability disabled.

Slice 6 completed:

- `GET /api/generated-images/[imageId]/lineage` now returns `WorkflowLineageViewModel` with `run`, `sections`, and empty-state metadata.
- History lineage drawer renders parent/current/sibling/child sections from the unified view model instead of stitching old/new fields in the UI.
