# ASCII Toolcraft Plan

## Renderer Technique Decision Matrix

- sourceRepresentation: image-media.
- productRepresentation: pixel.
- previewRenderer: webgl.
- exportRenderer: canvas-2d.
- rendererWorkload: pixel-output.
- rendererStrategy: webgl.
- whyNotAlternativeStrategies: DOM text was rejected because export/copy product-quality needs exact PNG/JPG bytes; SVG was rejected because arbitrary uploaded image sampling is the workload; pure Canvas 2D sampling was rejected for high-resolution media, so WebGL owns the sampling pass.
- fidelityRisks: tiny cell sizes can vary by browser font rasterization; exported glyphs are intentionally rasterized.
- performanceRisks: high source resolution, small cell size, render scale 2, and 8K export are the heaviest cases.

## Renderer Layer Inventory

- backgroundLayer: bitmap-media source sampling, renderer webgl, exportMode composited.
- productForegroundLayer: product-foreground ASCII text, renderer canvas-2d, exportMode included.
- editingHandlesLayer: none; no editing handles exist.
- exportComposite: canvas-2d final image composition.

## Render Pipeline Inventory

- source-decode pass: cacheKey source.image and mediaAssets transform.
- webgl-cell-sampling pass: pixel-transform on GPU; invalidated by media-import and Cell size control-drag.
- ascii-glyph-layout pass: text-layout; invalidated by Glyphs and Cell size.
- ascii-rasterize pass: rasterize; invalidated by Contrast and Brightness control-drag plus style control-change.
- png-export pass: export; invalidated by export.image.format and export.image.resolution.
- interaction invalidation: viewport-zoom and viewport-drag do not invalidate decode, sampling, layout, or raster passes.

## Export Selection Update — 2026-07-26

Verification tier: Tier 3
Reason: The change adds persistent, runtime-backed selection for uploaded media and changes the PNG/JPG export path from one composited scene file to one independently downloaded file per selected object.
Run: `npm run verify:quick`; focused multi-object browser export test; `npm run test:browser -- --grep "selected images export"`.
Skip: A full performance checkpoint is not required for this post-first-working export feature loop; the existing export workload coverage remains applicable and no render-scale or viewport behavior changes.

1. Add a schema-backed custom `exportSelection` control under Image Export. It lists uploaded object layers and writes selected layer IDs to `export.selection`.
2. Register the renderer through `ToolcraftApp controlRenderers`, using only Toolcraft checkbox primitives. Selection is explicit and supports any combination of uploaded images.
3. Filter each export render to exactly one selected object and trigger a separate named browser download for every selection.
4. Extend schema, renderer, acceptance, and browser coverage to prove a single selection produces one download and a multi-selection produces individually named downloads.

## Selected Object Bounds Export — 2026-07-26

Verification tier: Tier 3
Reason: The exported canvas frame and custom-renderer composite geometry change for every selected image.
Run: `npm run verify:quick`; focused selected-image browser export test; targeted export workload check.
Skip: The full performance checkpoint is not required for this post-first-working export refinement; existing export workload coverage remains applicable.

1. Build an export-only Toolcraft state for one visible selected layer, setting its canvas size to its `obj.<layerId>.w/h` bounds and position to `0,0`.
2. Continue using `createToolcraftPngExportCanvas` so the configured background and image-resolution scale are preserved.
3. Prove the exported image uses the selected layer’s 3:2 bounds instead of the artboard’s 16:9 bounds.

## Batch Selection Affordance — 2026-07-26

Verification tier: Tier 2
Reason: This improves the schema-backed export selection control’s user interaction without changing renderer output or export composition.
Run: `npm run verify:quick`; focused selected-image browser export test.
Skip: A full performance checkpoint is not required for this post-first-working control workflow refinement.

1. Add `Select all` and `Clear` actions to the existing export image selector.
2. Keep selected layer IDs in `export.selection`; individual checkboxes remain available to refine a batch.
3. Prove Select all marks each uploaded image and export still produces separate files.

## Canvas Multi-Selection — 2026-07-26

Verification tier: Tier 3
Reason: The canvas object interaction and selection feedback now change export state and must remain stable around object drag/selection behavior.
Run: `npm run verify:quick`; focused canvas multi-selection browser test; selected-image export browser test.
Skip: The full performance checkpoint is not required for this post-first-working interaction/export refinement.

1. Keep the existing single-object editing selection for handles and normal drag.
2. Use Shift-click on canvas image objects to toggle their IDs in `export.selection`.
3. Render a non-interactive dashed outline for extra selected export objects and synchronize their Image Export checkboxes.

## Layers Multi-Selection Repair — 2026-07-26

Verification tier: Tier 3
Reason: The visible Layer-row gesture is the reliable multi-select interaction; it writes export state and must preserve separate downloads.
Run: `npm run typecheck`; focused Shift-click Layers browser test; focused separate-download browser test.
Skip: The full performance checkpoint is not required for this post-first-working interaction/export repair.

1. Intercept Shift-pointer input on visible runtime Layer rows and toggle the layer ID in `export.selection`.
2. Treat an empty persisted selection as the current active layer when beginning a Shift multi-selection.
3. Prove both Layers checkboxes and the separate-download export flow after the gesture.
