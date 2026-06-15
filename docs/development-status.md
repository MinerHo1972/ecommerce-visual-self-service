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

- Start Slice 7K as a first real Coze workflow credential/API spike only after confirming the debug UI is enough for observing status, cost, and failure boundaries.
- Keep real Coze/VLM calls disabled until the sidecar path, retry policy, and cost boundary are proven.

Slice 7J completed:

- Upgraded the lineage drawer quality review area into a compact debug panel with status color, review id, workflowRunId, source, suggested action, confidence, and updated time.
- Added a refresh-state button for the current lineage view, so pending/running quality review states can be rechecked without closing the drawer.
- Added copy buttons for the image-level and workflowRun-level quality debug API paths.
- This remains read-only UI; it does not trigger retries, real Coze workflows, VLM calls, or candidate blocking.

Slice 7I completed:

- Extended `scripts/verify_quality_reviews.cjs` with `--run-sidecar-sample --image-id=<id>` to create a mock sidecar review and verify pending → running → succeeded transitions.
- Added `npm run verify:quality-sidecar` as a clearer entrypoint for the same controlled sidecar verification.
- Verified image `75` with sidecar sample `id=4`, ending in `review_status=succeeded`, `quality_status=pass`, `confidence=0.8880`, `suggested_action=accept`.
- This validates the quality review state machine without calling real Coze/VLM or spending generation cost.

Slice 7H completed:

- Added `GET /api/generated-images/[imageId]/quality-review` as a read-only debug endpoint for checking the latest quality review on one image.
- Added `GET /api/workflow-runs/[workflowRunId]/quality-reviews` as a read-only debug endpoint for listing quality reviews under one workflow run.
- Responses reuse the existing API envelope and expose only quality review state/summary, with no credentials or new external workflow calls.
- Real Coze/VLM workflow calls remain disabled.

Slice 7G completed:

- Changed mock quality sidecar execution from synchronous completion inside the generation flow to a detached boundary: generation now creates a pending review and schedules mock processing separately.
- RDS sidecar creation now returns the pending row immediately, then marks running/succeeded in the detached task.
- Latest quality review lookup now includes pending/running records so the lineage drawer can truthfully show in-progress state instead of hiding it.
- Extended `npm run verify:quality-reviews` with `--write-pending-sample --image-id=<id>` for manual pending-state verification.
- Real Coze/VLM workflow calls remain disabled.

Slice 7F completed:

- Added `scripts/migrate_quality_reviews.cjs` and `npm run migrate:quality-reviews` as an idempotent migration entrypoint for `db/005_image_quality_reviews.sql`.
- Migration safety: the script first checks whether `image_quality_reviews` already exists; the change only creates a new table and indexes, and rollback is `DROP TABLE image_quality_reviews` before production data depends on it.
- Verification plan: run `npm run verify:quality-reviews`, then explicitly run `npm run verify:quality-reviews -- --write-sample --image-id=<id>` to create and read back one mock review row.
- Real Coze/VLM workflow calls remain disabled.

Slice 7E completed:

- Added `scripts/verify_quality_reviews.cjs` and `npm run verify:quality-reviews` for read-only table/index verification.
- The verification script reports `tableExists:false` as a healthy not-yet-migrated state instead of failing the pipeline.
- The same script supports an explicit `--write-sample --image-id=<id>` mode after migration to create and read back one mock review row.
- Real Coze/VLM workflow calls remain disabled, and the online migration has still not been executed.

Slice 7D completed:

- Added a quality review repository facade with mock and RDS implementations.
- Generation success now creates mock sidecar quality reviews after images are saved; sidecar failures are logged and never block candidate display.
- The lineage API returns the latest quality review, and the lineage drawer shows a read-only quality summary.
- Real Coze/VLM workflow calls remain disabled.

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
