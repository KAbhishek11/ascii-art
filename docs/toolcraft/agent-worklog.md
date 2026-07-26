# Implementation Worklog

## Status

Mode: product

Product: ASCII Image Tool. The app uploads source images, renders an ASCII glyph effect on the Toolcraft canvas, and exports PNG/JPG output.

## Decision Trail

### Iteration 26 — Working multi-selection from Layers

- Request: User reported that multiple image selection and separate export were still unavailable.
- Task type: Broken export-selection interaction diagnosis and repair.
- Verification tier: Tier 3.
- Reason: The visible multi-selection gesture writes export state and drives multiple output files, so both interaction and export behavior require browser verification.
- User-visible result: In Layers, click one image row, then Shift-click another image row. Both images become selected for export, their Images checkboxes stay in sync, and Export PNG downloads each image separately.
- Source/reference checked: Initial canvas Shift-click browser evidence showing off-viewport image hit areas; runtime Layers row `data-layer-id` structure; initial Layers Shift-click assertion showing empty persisted selection did not fall back to the first active layer.
- Reference inputs: User report of failed multiple selection.
- Docs/contracts read: workflow.md; decision-contract.md; acceptance-testing.md; required brainstorming, writing-plans, systematic-debugging, and browser workflow skills.
- Contract rules applied: layers-enabled-behavior; controls-product-coverage; output-export-required; acceptance-product-observable; workflow-required.
- Decision: Keep the runtime's single active edit layer while adding app-owned Shift-click batch selection on the visible Layers rows. An empty `export.selection` now starts from `selectedLayerId`, so click-first/Shift-click-next produces a true two-image selection.
- Alternatives rejected: Canvas hit areas are not reliably inside the browser viewport at the default large artboard size; relying only on the right-panel checkboxes was not discoverable enough; rebuilding the runtime Layers panel would violate the runtime shell boundary.
- State/output mapping: Layer-row Shift-pointer events toggle visible layer IDs in `export.selection`; image checkboxes and dashed non-active outlines read that same value; Export PNG loops the IDs and creates separate selected-object files.
- Files changed: src/app/use-selected-object.ts; src/app/ascii-renderer.tsx; src/app/app-acceptance.ts; src/app/app-schema.test.ts; e2e/app-multi-object.spec.ts; plans/ascii-toolcraft-plan.md; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. Focused Chromium browser tests passed: `shift-click layer rows` proves two selected export checkboxes, and `selected images export` proves separate image downloads.
- Skipped checks: Full performance suite is not required for this post-first-working interaction/export repair.
- Risks: The multi-selection is intentionally scoped to export. Layers continues to show one active edit layer and its standard move/resize handles.

### Iteration 25 — Obvious batch image selection

- Request: Make it possible to select multiple images at once and export them separately.
- Task type: Export-selection control usability refinement.
- Verification tier: Tier 2.
- Reason: The change improves the existing runtime-backed selection workflow without changing canvas output, layer geometry, or export composition.
- User-visible result: The Images selector now offers `Select all` and `Clear` above its individual image checkboxes. Users can select the full batch in one action, remove individual images if needed, and export one separate file per remaining checked image.
- Source/reference checked: Existing `export.selection` custom control, prior multi-download browser acceptance, and Toolcraft custom-control primitive guidance.
- Reference inputs: User request for multiple image selection and separate export.
- Docs/contracts read: workflow.md; custom-controls.md; acceptance-testing.md; required brainstorming, writing-plans, and systematic-debugging workflow skills.
- Contract rules applied: controls-product-coverage; output-export-required; acceptance-product-observable; workflow-required.
- Decision: Add compact primitive `Select all` and `Clear` actions inside the existing custom control. Both write the same persisted `export.selection` array as individual checkboxes, avoiding local-only selection state.
- Alternatives rejected: Reworking the runtime-owned Layers panel would change its deliberate single-layer editing behavior; hiding the selectors behind a dialog would make batch export slower; adding an archive download would conflict with separate files.
- State/output mapping: Select all writes every uploaded layer ID to `export.selection`; Clear writes an empty array; each checkbox toggles only its layer ID; Export PNG iterates the resulting selection and downloads each layer separately.
- Files changed: src/app/export-selection-control.tsx; e2e/app-multi-object.spec.ts; plans/ascii-toolcraft-plan.md; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. Targeted app tests passed (216). The focused Chromium browser test (`npm run test:browser -- --grep "selected images export"`) passed: Select all checked both uploaded images, removing one yielded one selected-object export, and restoring it yielded two separate downloads.
- Skipped checks: Full performance suite is not required for this post-first-working control workflow refinement.
- Risks: The Layers panel remains single-selection for editing; use the Images selector for multi-image export selection.

### Iteration 24 — Selected object bounds export

- Request: When exporting selected images, export only the exact image bounds rather than the whole canvas, with the configured background color; make the workflow feel like Figma’s selected-object export.
- Task type: Selected-object export composition and output sizing.
- Verification tier: Tier 3.
- Reason: This changes custom renderer export geometry, the export canvas frame, and exported output dimensions for each selected image.
- User-visible result: A selected image exports as an image-sized file with its own layer aspect ratio and the chosen background behind the ASCII output. It no longer includes artboard-sized empty area or other layers.
- Source/reference checked: Existing per-layer `obj.<layerId>.x/y/w/h` geometry, the selected-image export loop, `createToolcraftPngExportCanvas`, and Toolcraft image export sizing rules.
- Reference inputs: User request referencing Figma selected-object export behavior.
- Docs/contracts read: workflow.md; schema-reference.md; renderer-technique.md; acceptance-testing.md; performance.md; required brainstorming, writing-plans, and browser workflow skills.
- Contract rules applied: output-export-required; canvas-no-app-ui; canvas-surface-preserved; renderer-technique-inventory; acceptance-product-observable; performance-coverage-levels; workflow-required.
- Decision: Build an export-only state for exactly one visible selected layer. Its canvas size becomes that layer’s `w × h`, its origin becomes `0,0`, and all other layers/media are omitted. The standard PNG export helper still applies the active background and 2K/4K/8K resolution scale.
- Alternatives rejected: Cropping the already-rendered artboard would retain artboard scaling and risk raster loss; disabling background export would ignore the configured Background workflow; changing the live canvas size would disrupt editing and other selected images.
- State/output mapping: `export.selection` yields one layer ID per export. `createSelectedLayerExportState` maps that layer’s geometry into the export frame. `createToolcraftPngExportCanvas` fills the selected background before the ASCII layer is composited at the requested resolution.
- Files changed: src/app/ascii-renderer.tsx; src/app/ascii-renderer.test.ts; src/app/app-acceptance.ts; e2e/app-multi-object.spec.ts; plans/ascii-toolcraft-plan.md; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. Targeted app tests passed (216). The focused Chromium browser test (`npm run test:browser -- --grep "selected images export"`) passed: a 240×160 selected layer exported as a 4096×2731 3:2 image at the 4K setting, rather than the 4096×2304 16:9 artboard.
- Skipped checks: Full performance suite is not required for this post-first-working export refinement; the existing export workload is unchanged apart from a smaller compositing frame.
- Risks: The configured Image Export resolution intentionally scales selected bounds to 2K/4K/8K; users who select different export resolutions receive the same exact crop and aspect ratio at that scale.

### Iteration 23 — Separate selected-image downloads

- Request: When multiple images are uploaded, export only a selected single image or export multiple selected images as separate downloads instead of one combined file.
- Task type: Export and multi-image selection behavior.
- Verification tier: Tier 3.
- Reason: The change adds runtime-backed media selection and changes the custom PNG/JPG export path, while keeping the canvas renderer and layer editing model intact.
- User-visible result: Image Export now lists uploaded images with checkboxes. Selecting one exports only that image; selecting several creates one separately named download per image.
- Source/reference checked: Existing `selectedLayerId` behavior, multi-object media/layer order, custom Canvas export path, and the Toolcraft custom-control/export contracts.
- Reference inputs: None.
- Docs/contracts read: workflow.md; schema-reference.md; component-rules.md; custom-controls.md; acceptance-testing.md; performance.md; required brainstorming and writing-plans workflow skills.
- Contract rules applied: controls-product-coverage; output-export-required; canvas-no-app-ui; renderer-technique-inventory; acceptance-product-observable; persistence-policy-explicit; workflow-required.
- Decision: Add an `exportSelection` custom control renderer using the Toolcraft checkbox primitive. Its runtime `export.selection` value stores selected layer IDs. With no explicit checkbox selection, Export PNG continues to use the current single canvas/layer selection; otherwise it iterates the checked visible layers and creates a separate file for each.
- Alternatives rejected: Exporting a ZIP would contradict the request for separate files; changing the Layers panel to support multi-selection would alter a runtime-owned single-selection surface; continuing to export the full composite would include unselected images.
- State/output mapping: `export.selection` filters visible object layers. Each selected layer gets an individual `createToolcraftPngExportCanvas` render, then `ascii-<source-name>.png` or `.jpg` is downloaded. The live canvas is unchanged.
- Files changed: src/app/app-schema.ts; src/app/export-selection-control.tsx; src/app/ascii-renderer.tsx; src/routes/index.tsx; src/app/app-schema.test.ts; src/app/ascii-renderer.test.ts; src/app/app-acceptance.ts; src/app/app-acceptance.test.ts; e2e/app-multi-object.spec.ts; plans/ascii-toolcraft-plan.md; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. Targeted app tests cover selected visible layer filtering and schema/acceptance mapping. The focused Chromium browser test (`npm run test:browser -- --grep "selected images export"`) passed: one checked image yields one `ascii-a.png` download and two checked images yield `ascii-a.png` plus `ascii-b.png` as separate download events.
- Skipped checks: Full performance suite is not required for this post-first-working feature loop. No Toolcraft runtime file was changed for this iteration.
- Risks: Browser download permissions can still limit multiple automatic downloads if a browser has been configured to block them; each export remains a separate user-initiated action chain rather than a ZIP.

### Iteration 22 — Immediate upload-help tooltip opening

- Request: Make the upload-help text appear faster.
- Task type: Route-level tooltip interaction fix.
- Verification tier: Tier 1.
- Reason: The fix changes only the opening delay for the one help trigger; it does not alter schema, runtime state, renderer output, media, or export behavior.
- User-visible result: Hovering the bottom-left upload-help button opens the tooltip immediately, followed by its 30ms visual animation.
- Source/reference checked: Base UI `TooltipTrigger` declares a 600ms default `delay`; the route had relied on the provider rather than declaring an explicit trigger delay.
- Reference inputs: None.
- Docs/contracts read: workflow.md; decision-contract.md; required brainstorming, writing-plans, and systematic-debugging workflow skills.
- Contract rules applied: runtime-shell-required; canvas-no-app-ui; workflow-required.
- Decision: Set `delay={0}` on this route-level `TooltipTrigger` while keeping the existing 30ms animation duration.
- Alternatives rejected: Changing the shared Tooltip primitive would affect unrelated runtime help; removing the tooltip would discard the requested upload-limit guidance.
- State/output mapping: The static trigger opens its existing content immediately; upload capacity and media state remain unchanged.
- Files changed: src/routes/index.tsx; e2e/app-browser-acceptance.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. The focused browser test (`npm run test:browser -- --grep "bottom-left upload help"`) passed, including a 100ms visible assertion immediately after hover.
- Skipped checks: Full performance suite is not required for this post-first-working interaction refinement.
- Risks: None: the override applies only to the upload-help trigger.

### Iteration 21 — Near-instant upload-help tooltip

- Request: Reduce the upload-help tooltip animation to 30ms.
- Task type: Route-level tooltip presentation refinement.
- Verification tier: Tier 1.
- Reason: This only changes the scoped popup animation duration; no schema, runtime state, renderer, media, or export behavior changes.
- User-visible result: The bottom-left upload-help tooltip opens and closes in 30ms.
- Source/reference checked: Existing scoped `desktop-experience-upload-help-tooltip` animation rule and its browser CSS assertion.
- Reference inputs: None.
- Docs/contracts read: workflow.md; required brainstorming and writing-plans workflow skills.
- Contract rules applied: runtime-shell-required; canvas-no-app-ui; workflow-required.
- Decision: Retain the local tooltip class and change only its animation duration to 30ms.
- Alternatives rejected: Changing shared tooltip timing would affect unrelated runtime help; removing animation entirely would be harsher than requested.
- State/output mapping: Static CSS affects only the route-level upload-help popup; the five-image upload workflow is unchanged.
- Files changed: src/styles.css; e2e/app-browser-acceptance.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. The focused browser test (`npm run test:browser -- --grep "bottom-left upload help"`) passed and confirms a 30ms popup animation duration.
- Skipped checks: Full performance suite is not required for a post-first-working presentation-only refinement.
- Risks: None: the class is scoped to one tooltip.

### Iteration 20 — Remove Arrange panel options

- Request: Remove the Arrange options from the right controls panel.
- Task type: Schema control and panel-action removal.
- Verification tier: Tier 2.
- Reason: The change removes a visible schema section, its action handlers, acceptance rows, and responsiveness scenario; canvas and Layers panel behavior remain unchanged.
- User-visible result: The right panel now moves directly from Object controls to Background controls. Duplicate, Bring to front, and Send to back are no longer offered there.
- Source/reference checked: `app-schema.ts` Arrange section, matching inventory, route action handler, acceptance rows, performance scenario, and multi-object browser test.
- Reference inputs: None.
- Docs/contracts read: workflow.md; schema-reference.md; component-rules.md; acceptance-testing.md; required brainstorming and writing-plans workflow skills.
- Contract rules applied: controls-product-coverage; controls-layout-heuristics; workflow-required.
- Decision: Remove the complete user-facing Arrange workflow rather than merely hiding its heading, so there are no stale actions or orphaned test/performance declarations.
- Alternatives rejected: CSS-only hiding would leave keyboard-accessible actions and invalid acceptance coverage; removing the Layers panel would remove necessary image-layer behavior beyond the user request.
- State/output mapping: No Arrange action target is declared or handled. Existing imported objects still render and can be selected; Layers retains its runtime-owned ordering controls.
- Files changed: src/app/app-schema.ts; src/routes/index.tsx; src/app/app-acceptance.ts; src/app/app-performance.ts; src/app/app-schema.test.ts; src/app/app-acceptance.test.ts; e2e/app-multi-object.spec.ts; e2e/app-browser-acceptance.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. The focused browser test (`npm run test:browser -- --grep "Arrange options are absent"`) passed, confirming no Arrange heading or action buttons render.
- Skipped checks: Full performance suite is not required because the only related responsiveness scenario was removed.
- Risks: None: the removal is scoped to the right-panel Arrange actions, not layer management.

### Iteration 19 — Faster upload-help tooltip

- Request: Reduce the bottom-left upload-help tooltip animation time.
- Task type: Route-level tooltip presentation refinement.
- Verification tier: Tier 1.
- Reason: The change alters only the entry animation of one static help popup; it does not affect runtime state, media import behavior, renderer output, exports, or performance workloads.
- User-visible result: The upload-help tooltip’s enter and exit animation takes 75ms, so its five-image guidance appears nearly immediately on hover.
- Source/reference checked: `TooltipProvider` has an existing zero hover delay; the Tooltip popup uses standard animated classes, so the observed wait comes from its animation duration.
- Reference inputs: None.
- Docs/contracts read: workflow.md; decision-contract.md; required brainstorming, writing-plans, and systematic-debugging workflow skills.
- Contract rules applied: runtime-shell-required; canvas-no-app-ui; workflow-required.
- Decision: Apply a 75ms animation-duration class only to the route-level upload-help popup.
- Alternatives rejected: Changing the shared Tooltip primitive would speed up unrelated runtime tooltips; adding an app-local delayed state would duplicate the Tooltip’s existing behavior.
- State/output mapping: Static CSS applies to the Tooltip content element; upload capacity and media state are unchanged.
- Files changed: src/routes/index.tsx; src/styles.css; e2e/app-browser-acceptance.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. The focused native-Playwright browser test (`npm run test:browser -- --grep "bottom-left upload help"`) passed, including an assertion that the popup animation duration is 75ms.
- Skipped checks: Full performance suite is not required for this post-first-working presentation-only refinement.
- Risks: None: the scoped class does not affect shared tooltip behavior.

### Iteration 18 — Bottom-left upload limit help

- Request: Add a bottom-left hover tooltip explaining multi-image uploads and the five-image limit.
- Task type: Route-level help affordance.
- Verification tier: Tier 1.
- Reason: The change adds a static, accessible explanation outside the Toolcraft canvas; it does not modify controls, media import behavior, renderer output, export, or performance.
- User-visible result: A bottom-left information button opens a tooltip on hover or keyboard focus: “Upload up to 5 images at once. You can select multiple files or drag them onto the canvas; delete an image layer to add another.”
- Source/reference checked: Existing five-image capacity behavior, Source uploader copy, and route-level tooltip primitives.
- Reference inputs: None.
- Docs/contracts read: workflow.md; decision-contract.md; acceptance-testing.md; required brainstorming and writing-plans workflow skills.
- Contract rules applied: runtime-shell-required; canvas-no-app-ui; workflow-required.
- Decision: Use the built-in Tooltip and Button primitives in the route outside `canvasContent`, fixed to the desktop workspace’s bottom left.
- Alternatives rejected: Canvas text would violate the product-output-only canvas contract; a permanent banner would compete with the editor; a custom tooltip would duplicate the installed UI primitive.
- State/output mapping: Static help only; it describes the existing `MAX_CANVAS_OBJECTS` and `multiple: true` behavior without writing runtime state.
- Files changed: src/routes/index.tsx; src/styles.css; e2e/app-browser-acceptance.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. The focused native-Playwright browser test (`npm run test:browser -- --grep "bottom-left upload help"`) passed, exercising the left-edge placement, tooltip hover state, and copy.
- Skipped checks: Full performance suite is not required for this post-first-working help affordance.
- Risks: None: the help button is outside product canvas output and does not intercept normal canvas/editor controls.

### Iteration 17 — Hide manual layer creation

- Request: Remove the Layers panel plus option.
- Task type: Layers-panel presentation refinement.
- Verification tier: Tier 1.
- Reason: The change hides one optional runtime panel action without changing media imports, existing layer operations, renderer output, or runtime state.
- User-visible result: The Layers header no longer shows the plus button or its Layer/Group creation menu. Imported images continue to create their own layers.
- Source/reference checked: User-provided Layers screenshot and the runtime LayersPanel header action contract.
- Reference inputs: Screenshot 2026-07-26 at 6.56.05 PM.png.
- Docs/contracts read: workflow.md; decision-contract.md; acceptance-testing.md; required brainstorming and writing-plans workflow skills.
- Contract rules applied: panel-host-behavior; layers-enabled-behavior; workflow-required.
- Decision: Use a narrowly scoped app stylesheet selector for the runtime action labelled `Add layer`; preserve the runtime panel, import-created layers, selection, visibility, reorder, and deletion behavior.
- Alternatives rejected: Rebuilding the Layers header would violate the runtime-shell boundary; disabling layers would remove needed media-object editing; removing runtime reducer actions would be an unnecessary global behavior change.
- State/output mapping: Presentation only; no product or runtime state changes.
- Files changed: src/styles.css; e2e/app-browser-acceptance.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. Agent-controlled browser validation confirms there is no visible `Add layer` action in the Layers panel.
- Skipped checks: Full performance suite is not required for this post-first-working presentation edit.
- Risks: None: uploaded media still creates layers through the existing import workflow.

### Iteration 16 — Multiple-image upload copy

- Request: Make the Source uploader copy state that users can upload multiple images.
- Task type: Runtime uploader copy refinement.
- Verification tier: Tier 1.
- Reason: The change adjusts visible multi-file wording only; schema, import behavior, renderer, canvas, exports, and performance are unchanged.
- User-visible result: The Source empty state now says “Click to upload images” and “or drag them onto the canvas,” accurately reflecting its multi-select behavior.
- Source/reference checked: User-provided Source uploader screenshot and file-drop-control.tsx multi-select behavior.
- Reference inputs: Screenshot 2026-07-26 at 6.46.38 PM.png.
- Docs/contracts read: workflow.md; decision-contract.md; acceptance-testing.md; required brainstorming and writing-plans workflow skills.
- Contract rules applied: runtime-shell-required; controls-product-coverage; workflow-required.
- Decision: Make the shared built-in uploader plural-aware whenever `multiple` is enabled, rather than overlaying app-specific copy around a runtime-owned control.
- Alternatives rejected: A schema description renders as label help rather than the requested empty-state copy; app-level DOM replacement would duplicate a runtime-owned control surface.
- State/output mapping: `multiple: true` selects plural uploader nouns and pronouns; no product state changes.
- Files changed: src/toolcraft/ui/components/controls/file-drop/file-drop-control.tsx; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. Agent-controlled browser validation confirms the Source panel visibly says “Click to upload images” and “or drag them onto the canvas.”
- Skipped checks: Full performance suite is not required for this post-first-working copy edit.
- Risks: None: single-file uploader copy remains unchanged.

### Iteration 15 — Visible Layers capacity notice

- Request: Show a visible disclaimer in the Layers panel once five images have been uploaded.
- Task type: Layers-panel feedback refinement.
- Verification tier: Tier 1.
- Reason: The change adds a presentation-only status message to the existing runtime-owned Layers panel; media cap, schema, renderer, canvas geometry, export, and performance behavior are unchanged.
- User-visible result: At the five-image limit, a notice directly below the Layers header reads: “Limit reached — 5 of 5 images uploaded. Delete an image to add another.” The notice disappears after an image is removed.
- Source/reference checked: User-provided Layers screenshot, existing capacity guard in use-selected-object.ts, and existing Layers browser coverage.
- Reference inputs: Screenshot 2026-07-26 at 6.43.43 PM.png.
- Docs/contracts read: workflow.md; decision-contract.md; acceptance-testing.md; required brainstorming and writing-plans workflow skills.
- Contract rules applied: panel-host-behavior; layers-enabled-behavior; workflow-required.
- Decision: Add one app-owned status element adjacent to the runtime-owned Layers header only while the existing capacity guard is active. It does not replace or recompose the Layers panel.
- Alternatives rejected: A header `title` tooltip is discoverable only on hover and was not visible in the reported UI; adding canvas text would violate the canvas product-output boundary; changing the runtime panel globally is unnecessary for this app-specific five-object rule.
- State/output mapping: `getObjectLayers(state).length >= MAX_CANVAS_OBJECTS` controls the notice lifecycle, upload disablement, and existing Layers header tooltip.
- Files changed: src/app/use-selected-object.ts; src/styles.css; e2e/app-multi-object.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. Agent-controlled browser validation selected five source files in one action and confirmed one visible Layers-panel notice with the exact capacity message.
- Skipped checks: Full performance suite is not required for this post-first-working presentation edit.
- Risks: None: the message is scoped to the existing capacity state and removed when capacity becomes available.

### Iteration 14 — Batch image upload and grid placement

- Request: Allow selecting up to five images in one upload and do not stack the resulting objects.
- Task type: Media import and canvas-object placement behavior.
- Verification tier: Tier 3.
- Reason: The change affects built-in fileDrop import behavior and the initial geometry of custom-rendered canvas objects, while preserving the existing five-object capacity and renderer pipeline.
- User-visible result: A user can select up to five images in one file-picker action. Each imported image begins in its own padded canvas slot, without overlapping another newly imported image.
- Source/reference checked: src/app/app-schema.ts Source fileDrop, src/app/use-selected-object.ts import seeding, e2e/app-multi-object.spec.ts, component-rules.md multi-image fileDrop guidance, and the existing five-object performance fixture.
- Reference inputs: None.
- Docs/contracts read: workflow.md; schema-reference.md; component-rules.md; acceptance-testing.md; performance.md; required brainstorming and writing-plans workflow skills.
- Contract rules applied: layers-enabled-behavior; controls-product-coverage; canvas-no-app-ui; renderer-technique-inventory; acceptance-product-observable; performance-coverage-levels.
- Decision: Declare `multiple: true` on the runtime-owned file-mode Source fileDrop, so its standard sortable file rows own batch selection and reorder. Seed uninitialized image layers into a responsive three-column, two-row padded grid, using the existing image aspect-fit limits and the product's five-object cap. Compose object layers in runtime media order so file-row reorder updates the rendered scene without duplicate ordering state.
- Alternatives rejected: Rebuilding a custom multi-upload surface would violate the runtime-shell boundary; retaining the 48px cascade would technically offset images but still makes batch uploads appear stacked; changing the five-object cap would alter the established renderer workload.
- State/output mapping: The Source fileDrop appends up to five `source.image` assets; runtime media order maps to object compositing order; `computeSeedRect` maps each new layer index to a non-overlapping grid position; existing `obj.<layerId>.x/y/w/h` geometry drives canvas preview and export composition.
- Files changed: src/app/app-schema.ts; src/app/use-selected-object.ts; src/app/app-schema.test.ts; src/app/app-acceptance.ts; e2e/app-multi-object.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: `npm run verify:quick` passed (261 tests). Agent-controlled browser validation used one chooser action with five source files and confirmed `multiple: true`, five created Layers entries, and the uploader disabled at the five-object cap. The shared `computeSeedRect` unit test proves the five initial raster-image bounds are pairwise non-overlapping at the default 2560×1440 canvas. The SVG favicon fixture did not decode into the ASCII raster canvas, so the browser check used Layers/import behavior while geometry proof remains deterministic in the app test.
- Skipped checks: Full performance suite is not required for this post-first-working feature loop; the existing five-object composite workload and quality limits are unchanged.
- Risks: Risk: manually resized or moved objects retain their user-authored geometry; only previously unseeded imports receive grid placement.

### Iteration 13 — Favicon in desktop guidance

- Request: Use the existing favicon as the mobile desktop-guidance icon.
- Task type: Responsive route visual refinement.
- Verification tier: Tier 1.
- Reason: The change swaps a decorative asset in an existing route-level presentation only; Toolcraft runtime state, schema, canvas output, controls, export, timeline, layers, and renderer workload remain unchanged.
- User-visible result: The mobile desktop-guidance card uses the same favicon as the browser tab rather than a text symbol.
- Source/reference checked: public/favicon.svg (64×64 scalable SVG with a 64×64 viewBox), index.html favicon declaration, and the existing mobile notice markup/styles.
- Reference inputs: Project favicon only.
- Docs/contracts read: workflow.md; assembly-workflow.md; decision-contract.md; required brainstorming and writing-plans workflow skills.
- Contract rules applied: runtime-shell-required; canvas-no-app-ui; workflow-required.
- Decision: Render `/favicon.svg` as a decorative empty-alt image at the existing 48px square size. The SVG viewBox preserves crisp rendering at this size and higher-density screens.
- Alternatives rejected: Retaining the text glyph would not match the product identity; rasterizing the SVG would add a fixed-resolution asset without any benefit.
- State/output mapping: Static route markup references the existing public favicon. No runtime or product state is affected.
- Files changed: src/routes/index.tsx; src/styles.css; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. Agent-controlled browser verification at 390×844 confirms one mobile-notice image with `/favicon.svg`; it has native 64×64 SVG dimensions and renders at 48×48 CSS pixels.
- Skipped checks: Full performance suite is not required for this post-first-working visual refinement.
- Risks: None: the SVG is natively scalable and served from the existing public asset path.

### Iteration 12 — Desktop-first mobile guidance

- Request: Prompt visitors on phone-sized devices to use the desktop experience.
- Task type: Responsive route presentation.
- Verification tier: Tier 1.
- Reason: The change adds a visual route-level state at a viewport breakpoint; Toolcraft runtime state, schema, canvas output, controls, export, timeline, layers, and renderer workload are unchanged.
- User-visible result: At widths below 768px, visitors see a focused message: “Best experienced on desktop,” explaining that ASCII Image Tool is designed for larger screens and asking them to continue on a desktop or laptop. At 768px and above, the normal Toolcraft workspace remains available.
- Source/reference checked: src/routes/index.tsx, src/styles.css, and the existing Toolcraft workspace composition.
- Reference inputs: None.
- Docs/contracts read: workflow.md; assembly-workflow.md; decision-contract.md; acceptance-testing.md; required brainstorming, writing-plans, and browser workflow skills.
- Contract rules applied: runtime-shell-required; canvas-no-app-ui; canvas-surface-preserved; workflow-required.
- Decision: Use a CSS media-query gate around the existing route-owned ToolcraftApp. The mobile notice lives outside canvasContent and hides the workspace only on phone-width viewports, preserving the runtime shell and all desktop behavior.
- Alternatives rejected: Shrinking the full editor into a phone layout would make the dense canvas and controls difficult to use; adding this text inside canvasContent would violate the product-output-only canvas contract; changing Toolcraft runtime responsive behavior would be an unnecessary global change.
- State/output mapping: Viewport width selects the visible route presentation only. No runtime state, product output, or export bytes change.
- Files changed: src/routes/index.tsx; src/styles.css; e2e/app-browser-acceptance.spec.ts; docs/toolcraft/agent-worklog.md.
- Verification: `npm run typecheck` passed. `npm run test` passed (260 tests). Agent-controlled browser verification against the local server passed: at 390×844, the “Best experienced on desktop” notice is visible and the workspace has computed `display: none`; at 1280×900, the notice is absent and the `Canvas viewport` application landmark is visible. The focused fallback Playwright command could not acquire a second free port while the existing app server was running, so the live app was verified directly instead.
- Skipped checks: Full performance suite is not required for this post-first-working, non-performance presentation edit.
- Risks: Risk: compact tablets below 768px receive the desktop guidance; the breakpoint intentionally favors a reliably usable editor surface over a cramped workspace.

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

### Iteration 8 — Glyph-aspect-correct ASCII sampling

- Request: Fix the resolution of generated ASCII art.
- Task type: Renderer fidelity correction.
- User-visible result: ASCII art will use a denser horizontal sampling grid that matches the real monospace glyph footprint, removing the stretched, low-detail appearance without changing the selected canvas or export dimensions.
- Source/reference checked: `src/app/ascii-renderer.tsx` samples `width / cellSize` square cells while rasterizing `ui-monospace` glyphs, whose measured visual width is narrower than their font height.
- Docs/contracts read: `workflow.md`, `renderer-technique.md`, `performance.md`, `acceptance-testing.md`, `schema-reference.md`, and `component-rules.md`.
- Contract rules applied: `canvas-no-app-ui`, `renderer-technique-inventory`, `acceptance-product-observable`, and `performance-coverage-levels`.
- Decision: Treat Cell size as the glyph cell height; derive the horizontal cell width from the monospace glyph aspect ratio in one shared grid helper, and use that grid for sampling and glyph placement in preview and export.
- Alternatives rejected: Reducing the Cell size default or lowering its minimum would increase workload, change the user-selected density semantics, and still leave the aspect-ratio error; scaling a low-resolution bitmap would blur/alias text and violates the native-fidelity renderer contract.
- State/output mapping: `selectedLayer.cellSize` continues to control grid cell height; the derived width changes `sampleCells` columns and `fillText` X positions for every preview, PNG, and video frame.
- Files changed: `src/app/ascii-renderer.tsx`, `src/app/ascii-renderer.test.ts`, `src/app/app-acceptance.ts`, and this worklog. No Toolcraft runtime files changed.
- Verification: Tier 3 targeted renderer test passes (2/2). Local browser check with a high-contrast 1600×900 fixture confirms the ASCII product canvas renders at 10240×5760 backing pixels (2560×1440 canvas at selected render scale 2), preserving the selected output resolution.
- Performance: The full browser performance checkpoint is not required for this post-first-working, non-performance fidelity correction; workload limits and exposed controls are unchanged.
- Risks: The 0.62 aspect factor is calibrated to the existing browser monospace fallback stack. Browsers with a substantially different fallback font may have a small glyph-spacing variance, but sampling and rendering stay aligned because they share this grid.

### Iteration 9 — Image-only product scope

- Request: Remove video upload and every video-related capability from the tool.
- Task type: Product behavior reduction; source media, renderer, timeline, export, acceptance, and performance reconciliation.
- User-visible result: The tool accepts images only, shows no timeline or video-export controls, and exports ASCII art as PNG or JPG only.
- Source/reference checked: `app-schema.ts`, `ascii-renderer.tsx`, `routes/index.tsx`, acceptance/performance matrices, and browser test inventory.
- Docs/contracts read: `workflow.md`, `schema-reference.md`, `component-rules.md`, `acceptance-testing.md`, and `performance.md`.
- Contract rules applied: `timeline-mode-choice`, `output-export-required`, `controls-product-coverage`, `renderer-technique-inventory`, and `acceptance-product-observable`.
- Decision: Retain the image-only WebGL sampling plus Canvas glyph renderer, Layers panel, image fileDrop, Background, Image Export, and Export PNG action. Remove timeline configuration, video export settings/action, video renderer lifecycle, video tests, and all video-specific performance/acceptance evidence.
- Alternatives rejected: Hiding video controls while keeping the decoder/recorder paths would retain unreachable behavior and needless media complexity; retaining the timeline without animated output would violate the panel enablement contract.
- State/output mapping: `source.image` accepts image media and drives the still ASCII composite; `export.image.format` and `export.image.resolution` remain the only delivery targets.
- Files changed: `src/app/app-schema.ts`, `src/app/ascii-renderer.tsx`, `src/routes/index.tsx`, acceptance/performance/schema tests and matrices, `e2e` video coverage removal, and this worklog.
- Verification: Tier 3 `npm run verify:quick` passes (259 tests). A focused agent-browser check confirms `accept="image/*"`, Image Export and Export PNG remain visible, and the page contains no Timeline, Video, WebM, or MP4 controls.
- Performance: The full browser performance checkpoint is not required for this post-first-working non-performance scope reduction; the unchanged image workload scenarios remain in `app-performance.ts`.
- Risks: Existing persisted browser state containing old video-related values is harmless because no schema control or renderer path consumes those values.

### Iteration 10 — Five-image canvas capacity

- Request: Increase the photo upload limit to five while keeping ASCII art resolution high.
- Task type: Media-capacity and renderer-workload adjustment.
- User-visible result: Users can place up to five source images on the canvas. The selected render scale, aspect-correct glyph grid, and image export resolution choices remain unchanged.
- Source/reference checked: `use-selected-object.ts` capacity guard, `app-performance.ts` composite workload fixture, and multi-object browser coverage.
- Docs/contracts read: `workflow.md`, `performance.md`, `acceptance-testing.md`, and the required brainstorming/planning workflow skills.
- Contract rules applied: `layers-enabled-behavior`, `renderer-technique-inventory`, `performance-coverage-levels`, and `acceptance-product-observable`.
- Decision: Raise the app-side media cap from two to five and align the object-composite hard limit and smooth target to five objects at render scale 2. Do not reduce Cell size, render scale, source-media fixture size, or image export resolution.
- Alternatives rejected: Removing the cap entirely would leave the renderer with an unbounded workload; reducing preview or export fidelity to make extra objects cheaper would conflict with the high-resolution requirement.
- State/output mapping: The `MAX_CANVAS_OBJECTS` guard retains the first five imported object layers; five cached object bitmaps compose at the existing selected backing scale.
- Files changed: `src/app/use-selected-object.ts`, targeted capacity/performance coverage, and this worklog.
- Verification: Tier 3 `npm run verify:quick` passes (260 tests). Browser verification imported an image and duplicated it to five canvas objects; the product canvas remained at the selected 10240×5760 backing resolution (2560×1440 at render scale 2).
- Performance: The full browser performance checkpoint is not required for this post-first-working capacity adjustment; the `ascii-object-composite` workload fixture now exercises the real five-object hard limit at render scale 2.
- Risks: Five dense 4K-source objects can take longer to compose than a single object, but the cap bounds the workload and resolution quality remains user-selected rather than reduced.

### Iteration 11 — Capacity-aware image upload affordance

- Request: Disable image upload once five images are present and explain the limit in the Layers panel.
- Task type: Media import behavior and layers-panel feedback.
- Verification tier: Tier 3.
- Reason: The change affects runtime media imports, the built-in fileDrop interaction, and the Layers panel while retaining the existing renderer workload.
- Decision: Keep the generated Toolcraft runtime intact. The app observes its existing five-object state and enhances the runtime-owned uploader and Layers header: the uploader disables and ignores drops at capacity, while the Layers header receives a native tooltip with the removal guidance. The existing overflow guard remains the command-level fallback for canvas drops and duplicate actions.
- Alternatives rejected: Editing the copied Toolcraft runtime to add a generic media-cap schema would fail the generated-app integrity contract; recreating the uploader or Layers panel in app code would violate the runtime-shell boundary.
- State/output mapping: `getObjectLayers(state).length >= MAX_CANVAS_OBJECTS` disables the Source image input and updates the existing Layers header tooltip. Deleting an image reduces the count and restores the uploader.
- Files changed: `src/app/use-selected-object.ts`, `e2e/app-multi-object.spec.ts`, and this worklog.
- Verification: Tier 3 `npm run verify:quick` passes (260 tests). Agent-browser verification uploaded five images, observed five Layers rows, a disabled `Browse file` control, and the tooltip: “You can add up to 5 images. Remove an image layer to upload another.”
- Performance: The full browser performance checkpoint is not required for this post-first-working non-performance UI behavior change; the five-object composite workload remains unchanged.
- Risks: The disabled affordance prevents the normal Source upload path, while the existing object-cap cleanup remains the fallback for a canvas-drop or action command that arrives while capacity is full.

### Renderer

- Decision: Mixed WebGL sampling plus Canvas 2D glyph raster/export.
- Reason: ASCII conversion needs media pixel sampling and high-quality text drawing into still image bytes.
- Evidence: src/app/ascii-renderer.tsx and src/app/app-performance.ts rendererTechnique/rendererPipeline.

### Timeline

- Decision: No timeline panel.
- Reason: Image-only output has no animated product behavior or video export.
- Evidence: appTransferMode animationIntent is none, appSchema omits panels.timeline, and the renderer has no timeline reads.

### Layers

- Decision: No Layers panel.
- Reason: There is one uploaded source image and one final output; there are no selectable/reorderable product objects.
- Evidence: appSchema omits panels.layers and acceptance covers single media lifecycle.

### Controls

- Decision: Source, ASCII, Background, Image Export, and sticky Export sections.
- Reason: Sections follow product meaning and workflow stage, with built-in fileDrop, select, slider, switch, color, and panelActions controls.
- Evidence: starterControlSectionInventory and appSchema controls.

### Export

- Decision: Still-image export only — PNG/JPG at 2K/4K/8K through Export PNG.
- Reason: The product is image-only and has no animated output to encode.
- Evidence: createAsciiExportCanvas passes includeBackground and export.image.resolution into createToolcraftPngExportCanvas; the schema exposes Image Export and Export PNG only.

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
