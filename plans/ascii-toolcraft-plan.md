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
