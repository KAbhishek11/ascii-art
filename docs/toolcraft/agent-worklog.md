# Implementation Worklog

## Status

Mode: product

Product: ASCII Image & Video Tool. The app uploads a source image or a source video, renders an ASCII glyph effect on the Toolcraft canvas, plays video sources on the timeline, and exports PNG/JPG still output or a WebM video.

## Decision Trail

### Iteration 1 — Product build

- Request: Build an app that applies an ASCII effect to an uploaded image.
- Task type: Generated app assembly; schema, controls, media upload, custom renderer, export, acceptance, and performance.
- User-visible result: Users upload an image, tune glyphs, density, tone, color, and background, then export the ASCII image.
- Source/reference checked: Local Toolcraft starter files and docs/toolcraft contracts.
- Reference inputs: None.
- Docs/contracts read: workflow.md; assembly-workflow.md; schema-reference.md; component-rules.md; acceptance-testing.md; performance.md; renderer-technique.md; decision-contract.md.
- Contract rules applied: runtime-shell-required; canvas-no-app-ui; canvas-surface-preserved; controls-product-coverage; output-export-required; renderer-technique-inventory; performance-coverage-levels; persistence-policy-explicit; workflow-required.
- Decision: Use ToolcraftApp with schema controls, a custom canvasContent renderer, built-in fileDrop upload, editable-output canvas sizing with renderScale, Background and Image Export sections, and sticky panelActions export.
- Alternatives rejected: DOM text overlay was rejected because export needs exact pixel output; pure Canvas 2D source sampling was rejected for the heavy image path; layers and timeline were rejected because the app has one still source/output and no animation or multi-object editing.
- State/output mapping: source.image media assets feed the renderer; ascii.* values control glyph mapping and tone; appearance.background and export.includeBackground control preview background and PNG alpha; export.image.* controls encoded file and resolution; Export PNG calls createToolcraftPngExportCanvas.
- Files changed: src/app/app-schema.ts; src/app/ascii-renderer.tsx; src/routes/index.tsx; src/app/app-acceptance.ts; src/app/app-performance.ts; src/app/app-schema.test.ts; src/app/app-acceptance.test.ts; e2e/app-controls.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: npm run ai:check passed. npm run test and final browser gates are run after this implementation pass; first full run required local-network escalation for port tests.
- Skipped checks: None for final delivery; timeline and layers checks are not applicable because those panels are omitted by product decision.
- Risks: Risk: 8K export can be memory-heavy on low-end devices; covered as selected resolution behavior and documented as the heaviest export tier.

### Iteration 2 — Video upload and download

- Request: Add the option to upload and download videos.
- Task type: Feature loop; media upload, custom renderer per-frame animation, timeline transport, video export, schema, acceptance, and performance.
- User-visible result: Users upload a video, the timeline adopts the clip duration, playback/scrub convert frames to ASCII live, and Export Video downloads a WebM; the existing image → PNG/JPG flow is unchanged (dual mode).
- Source/reference checked: Local Toolcraft runtime export helpers, timeline clock, media-import path, and the enforced app-acceptance.test.ts video-export spec.
- Reference inputs: None.
- Docs/contracts read: workflow.md; assembly-workflow.md; component-rules.md; acceptance-testing.md; performance.md; renderer-technique.md; decision-contract.md.
- Contract rules applied: timeline-mode-choice; timeline-enabled-behavior; output-export-required; controls-product-coverage; controls-layout-heuristics; renderer-technique-inventory; performance-coverage-levels; acceptance-product-observable.
- Decision: Accept video through a second Source fileDrop using the generic `assetKind:"file"` path with `accept:"video/*"` and `target:"source.video"` (no runtime edits); enable the top playback timeline; generalize the renderer to sample either an HTMLImageElement or an HTMLVideoElement frame and reuse one WebGL context across frames; drive live preview from the runtime timeline clock (play via requestVideoFrameCallback, scrub via seeked); export via `canvas.captureStream` + `MediaRecorder` (WebM) with per-frame seeking for frame-accurate content and real-time pacing so the recorded duration matches the timeline; keep both Image Export and Video Export visible and validate the source at action time.
- Alternatives rejected: Adding a first-class `"video"` assetKind to the copied runtime was rejected because AGENTS.md discourages per-app runtime edits and the generic file path already carries the video dataUrl and sourceTarget. Downgrading the existing image fileDrop to `assetKind:"file"` was rejected because it would drop the required image rotate/flip acceptance. A WebCodecs `VideoEncoder` + muxer path (deterministic timestamps) was rejected because it requires a new muxer dependency, and the product decision is WebM-only with zero new dependencies; MediaRecorder cannot emit MP4 dependency-free, so an MP4 format selection safely falls back to negotiated WebM (`MediaRecorder.isTypeSupported`), which the export contract explicitly permits.
- State/output mapping: source.video media asset feeds the renderer and getToolcraftVideoExportSize; timeline.setDuration adopts the clip length on loadedmetadata; timeline.currentTimeSeconds drives the rendered frame; export.video.format/resolution select the container/dimensions; Export Video calls exportAsciiVideo and shouldIncludeToolcraftExportBackground keeps the video background.
- Files changed: src/app/ascii-renderer.tsx; src/app/app-schema.ts; src/routes/index.tsx; src/app/app-acceptance.ts; src/app/app-performance.ts; e2e/app-video-export.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: npm run verify:quick (255/255), npm run typecheck, and npm run build all pass. End-to-end verified in a headless Chromium probe against the running dev server: uploading a video renders ASCII to the product canvas (full background + ~1.3M glyph pixels), pressing Play advances frames (glyph pixels change), and Export Video downloads a valid 1920x1080 WebM. The probe surfaced and fixed two real bugs: resolve video load on `loadeddata` (not `loadedmetadata`) so the paused t=0 frame is decodable, and key the load effects off stable `sourceKey`/`sourceDataUrl` strings instead of the fresh `getPrimarySource` object so the offscreen video is not torn down and reloaded every render. Remaining: the full Playwright suites (test:browser / verify:perf) were not executed; the new video e2e specs' UI selectors need refinement before the next final-delivery gate.
- Skipped checks: Full performance suite not re-run for lightweight controls unchanged from Iteration 1; recorded here per the post-first-working guidance.
- Risks: Risk: WebM real-time recording ties export wall-clock to timeline length, so a very slow renderer on huge clips can lengthen the encoded duration; mitigated by fixed 30fps pacing, encoder-safe sizing, and a bounded export budget. Risk: `MediaStreamTrackGenerator` deterministic muxing is unavailable dependency-free, so duration is pacing-based rather than timestamp-exact. Risk: Very long videos held as dataUrls increase memory; persistence excludes mediaAssets so localStorage is unaffected.

### Iteration 3 — Single image-or-video uploader

- Request: One upload option (not two) whose copy says you can upload an image or a video.
- Task type: Feature loop; schema simplification, renderer source detection, shared control copy, acceptance/performance/test reconciliation.
- User-visible result: The Source section shows a single dropzone reading "Click to upload an image or video". Images and videos both upload through it; the renderer picks the still-image or per-frame-video pipeline by the uploaded asset's MIME type.
- Source/reference checked: User screenshot of the two-dropzone Source section; file-drop control copy logic; integrity manifest.
- Reference inputs: One screenshot of the Source section (two upload dropzones).
- Docs/contracts read: component-rules.md; acceptance-testing.md; performance.md.
- Contract rules applied: controls-product-coverage; controls-layout-heuristics; acceptance-product-observable.
- Decision: Collapse the two Source fileDrops into one `assetKind:"file"` control with `accept:"image/*,video/*"` on `target:"source.image"`, and detect image-vs-video in `getPrimarySource` via `asset.mimeType`. The file-drop empty-state copy is hardcoded in the shared runtime component with no schema hook, so — with explicit user approval — the vendored `src/toolcraft/ui/.../file-drop-control.tsx` was edited to derive the noun from the `accept` value ("an image or video" / "a video" / "an image" / "a file"), and `src/toolcraft/.toolcraft-manifest.json` was regenerated for that one file so the integrity check passes.
- Alternatives rejected: Schema-only (keep the generic "Click to upload a file" copy) was rejected because it did not meet the explicit copy requirement; a second control was removed per the request.
- State/output mapping: the single `source.image` asset (image or video mime) feeds `getPrimarySource`; video mime drives the timeline + per-frame + WebM export paths, image mime drives the still PNG/JPG path.
- Files changed: src/app/app-schema.ts; src/app/ascii-renderer.tsx; src/toolcraft/ui/components/controls/file-drop/file-drop-control.tsx; src/toolcraft/.toolcraft-manifest.json; src/app/app-acceptance.ts; src/app/app-performance.ts; src/app/app-schema.test.ts; src/app/app-acceptance.test.ts; e2e/app-controls.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: npm run verify:quick (253/253) and npm run typecheck (exit 0) pass. Verified in a headless Chromium probe against the running app: single file input with accept "image/*,video/*"; dropzone reads "Click to upload an image or video"; uploading an image renders ASCII (~1.25M glyph pixels) and Export PNG downloads ascii-image.png; uploading a video renders ASCII, playback advances frames, and Export Video downloads a 1920x1080 ascii-video.webm.
- Skipped checks: Full browser performance suite not re-run for this post-first-working non-performance edit; recorded here per the post-first-working guidance. Functional behavior was verified with an agent-controlled headless-browser probe instead.
- Risks: Risk: editing the vendored file-drop component is an intentional exception to the "do not patch src/toolcraft" guideline; an upstream runtime regeneration would overwrite the copy change and the manifest, so it must be re-applied. Risk: with `assetKind:"file"`, images no longer expose rotate/flip transforms (that UI only renders for `assetKind:"image"`); acceptance for the source control no longer claims rotate/flip. Risk: the new video Playwright specs' UI selectors still need refinement before a formal final-delivery gate; the video/image flows are proven via the headless-browser probe but the Playwright suites were not executed.

### Iteration 4 — Multi-object Figma-like canvas (Phase 1)

- Request: Make the canvas hold multiple uploaded images/videos as objects, select one, and edit it individually via the side panel; keep it smooth.
- Task type: Feature loop; layers/selection, custom multi-object compositor renderer, canvas handles, per-object state, acceptance/performance/test reconciliation.
- User-visible result: Uploading appends objects to a fixed artboard (pan/zoom 25–400%); each object has its own placement (move/resize handles) and ASCII settings; clicking an object selects it and the Object panel edits only that object; many images plus one active video (others show a still); Export PNG composites all objects.
- Source/reference checked: toolcraft layers/selection runtime, canvas world transform + coordinate math, canvas-handle contract in e2e/canvas-handle-helpers.ts, acceptance/performance validators.
- Reference inputs: User screenshots of the two-dropzone Source and the on-canvas transport; user's "Figma-like" description.
- Docs/contracts read: component-rules.md; decision-contract.md; acceptance-testing.md; performance.md; assembly-workflow.md.
- Contract rules applied: layers-enable-only-when-needed; layers-enabled-behavior; canvas-no-app-ui (handle contract); canvas-handle-placement; controls-product-coverage; controls-layout-heuristics; acceptance-product-observable; performance-coverage-levels.
- Decision: Enable panels.layers (media.import appends objects, gives the Layers panel + selectedLayerId + click-to-select). Store per-object placement + ASCII settings in flat namespaced value keys obj.<layerId>.* via controls.setValue (no runtime changes). Keep the schema's Object controls on constant selectedLayer.* mirror keys and sync them to the selected object with a load-on-select / write-back-on-change hook (use-selected-object.ts) using disjoint namespaces + snapshot diffing + a skip-the-transition-round guard, plus auto-select so the panel is never disabled. Refactor the renderer into a compositor (renderAsciiObjectToBitmap + compositeAsciiScene) with a per-object bitmap cache so only changed objects (and the one active video per frame) re-rasterize. Selection outline + move/resize handles are DOM overlays marked data-toolcraft-canvas-handle (textless, <=2px, <=96px). Composited PNG export scales object geometry to export size.
- Alternatives rejected: A true infinite canvas (unsupported by the fixed-artboard runtime); per-object values via new reducer commands (would require editing integrity-checked src/toolcraft); disabling/hiding the panel when nothing is selected (validator forbids disabled/disabledWhen/selection visibleWhen) — solved with auto-select; a full-bounding-box move handle (violates the <=96px handle rule) — used a small move pin + plain outline.
- State/output mapping: layers + selectedLayerId drive selection; obj.<layerId>.x/y/w/h/rotation + ASCII fields drive per-object composite; selectedLayer.* mirror keys bind the Object panel to the selected object; controls.setValue persists geometry from drag handles; compositeAsciiScene draws visible layers in z-order.
- Files changed: src/app/app-schema.ts; src/app/use-selected-object.ts (new); src/app/ascii-renderer.tsx; src/app/app-acceptance.ts; src/app/app-performance.ts; src/app/app-schema.test.ts; src/app/app-acceptance.test.ts; e2e/app-multi-object.spec.ts (new); docs/toolcraft/agent-worklog.md. No src/toolcraft changes.
- Verification: npm run verify:quick (263/263) and npm run typecheck (exit 0) pass. Verified in a headless Chromium probe against the running app: uploading two images creates two staggered ASCII objects; clicking an object selects it; dragging the move handle moved one object (720,405 -> 840,485) while the other stayed put; four resize handles present; Export PNG downloads a composited image; no console/page errors.
- Skipped checks: Full browser performance suite not re-run for this post-first-working non-performance edit; recorded here per the post-first-working guidance. Functional behavior was verified with an agent-controlled headless-browser probe instead.
- Risks: Risk: many simultaneously-playing videos would stutter, so only one video plays at a time (others show a still). Risk: the new multi-object Playwright specs' UI selectors still need refinement before a formal final-delivery gate; the flows are proven via the headless-browser probe but the Playwright suites were not executed. Risk: per-object values (obj.<layerId>.*) are not garbage-collected when a layer is deleted (Phase 2). Risk: composited video export is Phase 2; Phase 1 video export renders the whole scene per frame with the single active video advancing.

### Iteration 5 — Multi-object editing polish (Phase 2)

- Request: Phase 2 — aspect-correct sizing, rotate handle, aspect-locked resize, snap/align guides, duplicate + reorder, composited video export, and cleanup of a deleted object's stored values.
- Task type: Feature loop; renderer interaction, per-object state, schema footer actions, acceptance reconciliation.
- User-visible result: Uploaded objects now size to their real aspect ratio once decoded; the selected object has an on-canvas rotate handle and aspect-locked corner resize (hold Shift to resize freely); dragging an object shows snap/alignment guides against the artboard center and other objects; footer actions Duplicate, Bring to front, and Send to back edit the selected object; Export Video now composites the whole multi-object scene per frame; a deleted object's per-object values are cleared from in-memory state.
- Source/reference checked: Phase 1 renderer (ascii-renderer.tsx), use-selected-object.ts sync/seed hook, canvas coordinate math, controls-panel action routing (onPanelAction receives dispatch; inline actions and panelActions both route custom values), layers.reorder reducer shape, persistence value filtering.
- Reference inputs: None.
- Docs/contracts read: component-rules.md; acceptance-testing.md; performance.md.
- Contract rules applied: canvas-handle-placement; canvas-no-app-ui; controls-product-coverage; controls-layout-heuristics; acceptance-product-observable.
- Decision: Aspect-size objects once their source decodes (guarded by an obj.<id>.autoSized flag so a user resize is never overridden). Add a rotate handle as another data-toolcraft-canvas-handle (canvas-object-rotate) writing the mirrored selectedLayer.rotation via atan2 from the object center, snapping to 15° with Shift; corner resize preserves aspect by default and frees on Shift. Snap-move compares the dragged object's left/center/right and top/center/bottom against the artboard center/edges and other objects within an 8px artboard threshold, drawing textless guide-line overlays that clear on pointer-up. Route Duplicate/Bring-to-front/Send-to-back through the single sticky-footer panelActions control (actions.output) into onPanelAction: Duplicate stores a settings snapshot under a transient value key and dispatches media.import, and the seeding effect applies that snapshot (offset) to the new layer; Front/Back dispatch layers.reorder with the selected layer moved to the end/start of the array (z-order = composite draw order). Export Video already composited the whole scene per frame in Phase 1; kept. GC clears orphaned obj.<id>.* keys when their layer is gone.
- Alternatives rejected: An inline actions control for Duplicate/Front/Back (a second footer/product control tripped the perf-role requirement and re-triggered the sibling label-genericity heuristic and a single-footer-aggregation acceptance rule) — merged the three actions into the existing footer panelActions control instead; a dedicated Arrange section (same single-footer aggregation issue).
- State/output mapping: obj.<id>.w/h/x/y (autoSized), selectedLayer.rotation (mirrored -> obj.<id>.rotation via the sync hook), and layers order all feed compositeAsciiScene; duplicate uses PENDING_DUPLICATE_KEY consumed by the seeding effect; footer action values reach onPanelAction which dispatches media.import / layers.reorder / export.
- Files changed: src/app/ascii-renderer.tsx; src/app/use-selected-object.ts; src/app/app-schema.ts; src/routes/index.tsx; src/app/app-acceptance.ts; docs/toolcraft/agent-worklog.md. No src/toolcraft changes.
- Verification: npm run verify:quick (263/263) and npm run typecheck (exit 0) pass. Headless Chromium probes against the running app confirmed: a 4:1 image sizes to ratio 4 (not the default box); corner resize preserves aspect (4.00 -> 3.99); the rotate handle produces rotate(87deg); Duplicate goes 1 -> 2 objects keeping size; snap guides appear mid-drag toward center and clear on drop; Bring-to-front/Send-to-back run without error; Export Video with an image + a video downloads a composited 1920x1080 ascii-video.webm; deleting a layer removes it. No page errors in any probe.
- Skipped checks: Full browser performance suite not re-run for this post-first-working non-performance edit; recorded here per the post-first-working guidance. Functional behavior was verified with an agent-controlled headless-browser probe instead.
- Risks: Risk: per-object values and uploaded media are session-only (the runtime persistence snapshot keeps only declared control targets), so a page reload clears the scene; GC therefore only bounds in-memory growth. Risk: the multi-object Playwright specs were not executed; flows are proven via headless-browser probes. Risk: Duplicate/Front/Back share the sticky footer with Export actions because the runtime aggregates all panelActions into one footer.

### Iteration 6 — Limit canvas to two objects

- Request: Limit uploads to 2 images or videos at a time.
- Task type: Feature loop; app-side object-count cap with user feedback.
- User-visible result: The canvas holds at most 2 objects. Uploading (or duplicating) a third keeps the existing two, removes the overflow, and shows a toast: "You can place up to 2 objects at a time. Remove one to add another." Removing an object frees a slot.
- Source/reference checked: use-selected-object.ts object-layer helpers; media.import append order (newest appended last); layers.delete command; sonner dependency; runtime has no mounted Toaster.
- Reference inputs: None.
- Docs/contracts read: component-rules.md; decision-contract.md (canvas-no-app-ui applies to the canvas world only, not a body-level toast portal).
- Contract rules applied: layers-enabled-behavior; controls-product-coverage; canvas-no-app-ui.
- Decision: Enforce the cap app-side because uploads dispatch the runtime media.import directly and cannot be intercepted, and the fileDrop control cannot be disabled/hidden by count (validator-forbidden). A reactive effect in useSelectedObjectSync deletes object layers beyond MAX_CANVAS_OBJECTS (=2) — the newest, since media.import appends last — via layers.delete, and notifies once per attempt with a sonner toast. Mounted a single <Toaster> at app root in routes/index.tsx (a body-level portal, outside the canvas world, so it does not violate canvas-no-app-ui).
- Alternatives rejected: Editing the runtime reducer/media.import to hard-cap (forbidden src/toolcraft edit); a `multiple` fileDrop with hardMaxItems (does not gate layer-based objects and triggers reorder-consumption acceptance); silently dropping the third upload (reads as a bug without feedback); rolling-window replace-oldest (removes the user's earlier work unexpectedly — "at a time" implies a slot the user must free).
- State/output mapping: getObjectLayers(state) length gates the effect; overflow layers dispatch layers.delete (cascades their media + obj.<id>.* GC from Iteration 5); the toast is user feedback only.
- Files changed: src/app/use-selected-object.ts; src/routes/index.tsx; docs/toolcraft/agent-worklog.md. No src/toolcraft changes.
- Verification: npm run verify:quick (263/263) and npm run typecheck (exit 0) pass. Headless Chromium probe against the running app: uploading three images left exactly two objects (counts 1, 2, 2) and surfaced the cap toast; no page errors.
- Skipped checks: Full browser performance suite not re-run for this post-first-working non-performance edit; recorded here per the post-first-working guidance. Functional behavior was verified with an agent-controlled headless-browser probe instead.
- Risks: Risk: the cap is reactive (the third object is created then immediately removed within the same interaction) rather than blocked at the input; the toast explains it. Risk: the multi-object Playwright specs were not executed; the cap is proven via the headless-browser probe.

### Iteration 7 — Remove object rotation

- Request: Remove the rotate feature from the tool.
- Task type: Feature loop; schema, renderer, per-object state, acceptance, performance, and test reconciliation.
- User-visible result: Objects can no longer be rotated. The Rotation slider is gone from the Object panel, the on-canvas rotate handle is removed, and objects always render axis-aligned at their placement rect.
- Source/reference checked: app-schema.ts Object controls, ascii-renderer.tsx compositor and canvas handles, use-selected-object.ts mirror fields.
- Reference inputs: None.
- Docs/contracts read: workflow.md; schema-reference.md; acceptance-testing.md; performance.md.
- Contract rules applied: controls-product-coverage; canvas-handle-placement; canvas-no-app-ui; acceptance-product-observable; performance-coverage-levels.
- Decision: Remove selectedLayer.rotation from the schema and control inventory; drop rotation from OBJECT_SETTING_FIELDS and ObjectGeometry; draw cached object bitmaps directly at x/y without context.rotate; remove the canvas-object-rotate handle and rotate drag mode; delete the rotation acceptance row and ascii-rotation-change performance scenario.
- Alternatives rejected: Keeping rotation in state but hiding the UI (would leave dead persisted values and compositor complexity); migrating existing obj.<id>.rotation into placement (no migration needed — rotation was optional and defaults to axis-aligned).
- State/output mapping: obj.<id>.x/y/w/h and ASCII settings still drive compositeAsciiScene; rotation keys are no longer read or written.
- Files changed: src/app/app-schema.ts; src/app/use-selected-object.ts; src/app/ascii-renderer.tsx; src/app/app-acceptance.ts; src/app/app-performance.ts; src/app/app-schema.test.ts; src/app/app-acceptance.test.ts; e2e/app-multi-object.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: npm run verify:quick (262/262 app tests before worklog update; full suite passes after recording results) and npm run typecheck pass.
- Skipped checks: Full browser performance suite not required for this post-first-working non-performance edit.
- Risks: Risk: persisted obj.<id>.rotation values from older sessions are ignored (harmless). Risk: users who relied on rotation must reposition objects instead.

## Renderer Technique Decision Matrix

- sourceRepresentation: image-media.
- productRepresentation: pixel.
- previewRenderer: webgl plus canvas-2d text rasterization.
- exportRenderer: canvas-2d through createToolcraftPngExportCanvas.
- rendererWorkload: pixel-output.
- rendererStrategy: webgl.
- whyNotAlternativeStrategies: DOM text was rejected because it cannot produce exact PNG/JPG export bytes through the standard helper; SVG was rejected because arbitrary image sampling is the core workload; pure Canvas 2D source sampling was rejected for heavy 4K media, so WebGL owns the cell sampling path while Canvas 2D draws product glyphs; export/copy product-quality requires the standard exportRenderer path.
- fidelityRisks: Browser font rasterization can vary slightly at tiny cell sizes; export is intentionally rasterized so glyphs become image pixels.
- performanceRisks: Small cell sizes multiply glyph count; 4K/8K export increases raster work.

## Renderer Layer Inventory

- backgroundLayer: bitmap-media source sampling layer, renderer webgl, exportMode composited, uiSelector `[data-toolcraft-renderer-layer="ascii-product"]`.
- productForegroundLayer: product-foreground text glyph raster layer, renderer canvas-2d, exportMode included, uiSelector `[data-toolcraft-renderer-layer="ascii-product"]`.
- editingHandlesLayer: none; the app has no editing-handles layer because there are no on-canvas handles.
- exportComposite: final still image composition, renderer canvas-2d, exportMode included.

## Render Pipeline Inventory

- Pass source-decode: decode source.image and mediaAssets transform metadata; cache key source.image plus mediaAssets[].transform.
- Pass webgl-cell-sampling: pixel-transform pass on GPU; inputs source-decode, canvas.size, ascii.cellSize; invalidated by media-import and cell-size control-drag.
- Pass ascii-glyph-layout: text-layout pass; inputs glyph set and cell size; invalidated by ascii.charset and ascii.cellSize.
- Pass ascii-rasterize: rasterize pass; inputs glyph layout, tone controls, color controls, background, include background, and render scale; invalidated by control-change and control-drag without re-decoding source media.
- Pass video-frame-decode: decode the source.video frame at timeline.currentTimeSeconds; cache key source.video plus timeline.currentTimeSeconds.
- Pass png-export: export pass; inputs selected image format/resolution and final renderer state.
- Pass video-export: export pass; inputs video-frame-decode, sampling, rasterize, and export.video.resolution; invalidated by export.video.format/resolution.
- Interaction invalidation: media-import invalidates decode and downstream passes for source.image and source.video; timeline scrub/playback invalidates video-frame-decode and downstream sampling/rasterize; control-drag for Cell size invalidates sampling/layout/rasterize; control-drag for Contrast/Brightness invalidates rasterize only; control-change for style/background/export state avoids source decode; viewport-drag and viewport-zoom invalidate no renderer passes.

## Decisions

### Renderer

- Decision: Mixed WebGL sampling plus Canvas 2D glyph raster/export.
- Reason: ASCII conversion needs media pixel sampling and high-quality text drawing into still image bytes.
- Evidence: src/app/ascii-renderer.tsx and src/app/app-performance.ts rendererTechnique/rendererPipeline.

### Timeline

- Decision: Top playback timeline enabled (mode "playback", defaultDurationSeconds 5).
- Reason: Video sources are animated product output and Export Video requires the top Toolcraft timeline; playback transport does not need keyframes.
- Evidence: appTransferMode animationIntent is timeline-playback (loopDuration 5s, product-derived), appSchema panels.timeline.enabled is true, and the renderer reads state.timeline.currentTimeSeconds to render frames.

### Layers

- Decision: No Layers panel.
- Reason: There is one uploaded source image and one final output; there are no selectable/reorderable product objects.
- Evidence: appSchema omits panels.layers and acceptance covers single media lifecycle.

### Controls

- Decision: Source, ASCII, Background, Image Export, and sticky Export sections.
- Reason: Sections follow product meaning and workflow stage, with built-in fileDrop, select, slider, switch, color, and panelActions controls.
- Evidence: starterControlSectionInventory and appSchema controls.

### Export

- Decision: Dual export — Export PNG (PNG/JPG, 2K/4K/8K) for still frames and Export Video (WebM, Current/4K) for video sources; Image Export is placed immediately before Video Export, both directly above the sticky footer actions.
- Reason: Still products expose Export PNG and animated products additionally expose Export Video; each action validates the active source at runtime.
- Evidence: createAsciiExportCanvas passes includeBackground and export.image.resolution into createToolcraftPngExportCanvas; exportAsciiVideo uses getToolcraftVideoExportSize, shouldIncludeToolcraftExportBackground, and MediaRecorder.isTypeSupported and reads export.video.format/resolution.

### Performance

- Decision: Workload coverage for media import, glyph set, cell size, tone sliders, export resolution, preview render, viewport zoom, and viewport stability; responsiveness coverage for toggles, selects, and colors.
- Reason: Dense glyph output and large uploads are the heaviest cases; lightweight controls still need interaction coverage.
- Evidence: app-performance.ts scenarios use hardLimit and smoothTarget at the exposed limits, smoothTargetRatio 1, no failed higher measurement, and no quality-reduction optimization needed yet.

## Evidence

- Source reviewed: local Toolcraft starter, runtime export helper, runtime React hooks, and local contract docs.
- Contract applied: Toolcraft runtime shell, schema controls, product-only canvasContent, standard export helper, required background/image export controls, explicit persistence, custom renderer pipeline.

## Verification

- Passed: `npm run ai:check`.
- Passed: `npm run verify:quick` (typecheck, docs/integrity checks, and the full vitest unit + acceptance + performance-matrix suite) for the video upload/download feature loop.
- Added targeted functional browser coverage for the video path in `e2e/app-video-export.spec.ts` (upload, timeline playback/scrub, and WebM export duration/dimension assertions) and targeted video performance scenarios in `app-performance.ts` (`ascii-video-import`, `ascii-video-playback-render`, `ascii-video-resolution-change`, `ascii-video-export`).
- Browser performance checkpoint: the full browser performance suite is not required for this post-first-working feature loop; the first working still-image product version already recorded its checkpoint, and this feature loop adds targeted video performance scenarios rather than re-running the whole suite. Run `npm run verify:perf` (or an `agent-browser` run) to exercise the new video scenarios before the next final-delivery gate.

## Risks

- Risk: 8K output can be memory-heavy because ASCII text is rasterized into a large export canvas; the visible Resolution control makes this user-selected and performance coverage includes export workload.
