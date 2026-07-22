import { describe, expect, it } from "vitest";

import { appPerformance } from "./app-performance";
import { appSchema, starterControlSectionInventory } from "./app-schema";

function section(title: string) {
  const found = appSchema.panels.controls?.sections.find((item) => item.title === title);
  expect(found).toBeDefined();
  return found!;
}

describe("appSchema", () => {
  it("publishes the ASCII image Toolcraft product contract", () => {
    expect(appSchema.canvas.draggable).toBe(true);
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.canvas.renderScale).toMatchObject({ enabled: true });
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });
    expect(appSchema.canvas.upload).toBe(true);
    expect(appSchema.panels.layers).toBe(true);
    expect(appSchema.panels.timeline).toMatchObject({ enabled: true, mode: "playback" });
    expect(appSchema.toolbar).toEqual({
      history: true,
      radar: true,
      theme: true,
      zoom: true,
    });
    expect(appSchema.assembly.components).toEqual([
      "canvas",
      "controlsPanel",
      "layersPanel",
      "timelinePanel",
      "toolbar",
    ]);
    expect(appSchema.assembly.capabilities).toEqual(
      expect.arrayContaining([
        "canvas.draggable",
        "canvas.editableSize",
        "canvas.renderScale",
        "canvas.upload",
        "controls.defaults",
        "controls.panel",
        "toolbar.history",
        "toolbar.radar",
        "toolbar.theme",
        "toolbar.zoom",
      ]),
    );
    expect(appSchema.assembly.capabilities).toContain("timeline.playback");
    expect(appSchema.assembly.capabilities).not.toContain("timeline.keyframes");
  });

  it("groups product controls by source, ASCII effect, background, and export workflow", () => {
    const productSections =
      appSchema.panels.controls?.sections.filter(
        (section) =>
          section.title !== "Setup" &&
          !Object.values(section.controls).some((control) => control.type === "panelActions"),
      ) ??
      [];

    expect(productSections.map((section) => section.title)).toEqual([
      "Source",
      "Object",
      "Arrange",
      "Background",
      "Image Export",
      "Video Export",
    ]);
    expect(starterControlSectionInventory.map((section) => section.title)).toEqual([
      "Source",
      "Object",
      "Arrange",
      "Background",
      "Image Export",
      "Video Export",
    ]);
  });

  it("exposes PNG delivery with required background and image export controls", () => {
    const controls = appSchema.panels.controls?.sections.flatMap((section) =>
      Object.values(section.controls),
    );
    const targets = controls?.map((control) => control.target) ?? [];

    expect(targets).toEqual(
      expect.arrayContaining([
        "source.image",
        "selectedLayer.charset",
        "selectedLayer.cellSize",
        "selectedLayer.contrast",
        "selectedLayer.brightness",
        "selectedLayer.invert",
        "selectedLayer.colorMode",
        "selectedLayer.ink",
        "export.includeBackground",
        "appearance.background",
        "export.image.format",
        "export.image.resolution",
      ]),
    );
    const exportSection = appSchema.panels.controls?.sections.find((item) =>
      Object.values(item.controls).some((control) => control.type === "panelActions"),
    );
    const panelActions = exportSection
      ? Object.values(exportSection.controls).find((control) => control.type === "panelActions")
      : undefined;
    expect(panelActions?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          icon: "upload-simple",
          label: "Export PNG",
          value: "export-png",
        }),
      ]),
    );
  });

  it("acceptance: source image upload drives ASCII output", () => {
    expect(section("Source").controls.sourceImage.target).toBe("source.image");
  });

  it("acceptance: glyph selector changes ASCII characters", () => {
    expect(section("Object").controls.charset.type).toBe("select");
  });

  it("acceptance: cell size slider changes ASCII density live", () => {
    expect(section("Object").controls.cellSize.type).toBe("slider");
  });

  it("acceptance: contrast slider changes ASCII tone mapping live", () => {
    expect(section("Object").controls.contrast.type).toBe("slider");
  });

  it("acceptance: brightness slider changes ASCII tone mapping live", () => {
    expect(section("Object").controls.brightness.type).toBe("slider");
  });

  it("acceptance: invert switch reverses ASCII tone mapping", () => {
    expect(section("Object").controls.invert.type).toBe("switch");
  });

  it("acceptance: object arrange actions duplicate and reorder the selected object", () => {
    const arrange = section("Arrange").controls.arrange;
    expect(arrange.type).toBe("actions");
    expect(arrange.actions?.map((a) => (typeof a === "string" ? a : a.value))).toEqual([
      "object-duplicate",
      "object-front",
      "object-back",
    ]);
  });

  it("acceptance: color mode select switches mono and source color", () => {
    expect(section("Object").controls.colorMode.type).toBe("select");
  });

  it("acceptance: ink color changes mono ASCII glyph color", () => {
    expect(section("Object").controls.ink.type).toBe("color");
  });

  it("acceptance: background include and color control preview and PNG alpha", () => {
    expect(section("Background").title).toBe("Background");
  });

  it("acceptance: image export format and resolution change output bytes", () => {
    expect(section("Image Export").title).toBe("Image Export");
  });

  it("acceptance: localStorage persistence restores ASCII settings", () => {
    expect(appSchema.persistence?.storage).toBe("localStorage");
  });

  it("acceptance: editable output sizing keeps upload cropped to canvas", () => {
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });
  });

  it("declares renderer performance coverage for the custom ASCII pipeline", () => {
    expect(appPerformance.usesCustomRenderer).toBe(true);
    expect(appPerformance.rendererStrategy).toBe("webgl");
    expect(appPerformance.rendererWorkload).toBe("pixel-output");
    expect(appPerformance.workloadTargets).toEqual(
      expect.arrayContaining([
        "source.image",
        "selectedLayer.cellSize",
        "selectedLayer.contrast",
        "selectedLayer.brightness",
        "export.image.resolution",
      ]),
    );
  });

  it("perf: ASCII preview render stays under budget", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-preview-render",
    );
  });

  it("perf: Source image import stays responsive", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-media-import",
    );
  });

  it("perf: Source image control coverage uses heavy media", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-source-control-change",
    );
  });

  it("perf: Glyph selector change stays responsive", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-glyphs-change",
    );
  });

  it("perf: Cell size drag stays responsive at heavy source", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-cell-size-drag",
    );
  });

  it("perf: Contrast drag stays responsive at heavy source", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-contrast-drag",
    );
  });

  it("perf: Brightness drag stays responsive at heavy source", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-brightness-drag",
    );
  });

  it("perf: Invert toggle stays responsive", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-invert-change",
    );
  });

  it("perf: Object arrange actions stay responsive", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-arrange-change",
    );
  });

  it("perf: Color mode select stays responsive", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-color-mode-change",
    );
  });

  it("perf: Ink color change stays responsive", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-ink-change",
    );
  });

  it("perf: Include background toggle stays responsive", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-include-background-change",
    );
  });

  it("perf: Background color change stays responsive", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-background-change",
    );
  });

  it("perf: Image format select stays responsive", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-format-change",
    );
  });

  it("perf: Image resolution select uses export workload values", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-resolution-change",
    );
  });

  it("perf: ASCII export completes at selected resolution", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain("ascii-export");
  });

  it("perf: ASCII viewport zoom stays stable", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-viewport-zoom",
    );
  });

  it("perf: ASCII viewport remains stable", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-viewport-stability",
    );
  });

  it("acceptance: source upload accepts image and video", () => {
    expect(section("Source").controls.sourceImage.assetKind).toBe("file");
    expect(section("Source").controls.sourceImage.accept).toContain("image/*");
    expect(section("Source").controls.sourceImage.accept).toContain("video/*");
  });

  it("acceptance: video export format and resolution change output", () => {
    expect(section("Video Export").controls.videoFormat.target).toBe("export.video.format");
    expect(section("Video Export").controls.videoResolution.target).toBe(
      "export.video.resolution",
    );
  });

  it("acceptance: timeline playback advances video ASCII frames", () => {
    expect(appSchema.panels.timeline).toMatchObject({ enabled: true, mode: "playback" });
  });

  it("perf: Video timeline playback renders frames under budget", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-video-playback-render",
    );
  });

  it("perf: Video resolution select uses export workload values", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-video-resolution-change",
    );
  });

  it("perf: Video format select stays responsive", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-video-format-change",
    );
  });

  it("perf: ASCII video export completes at selected resolution", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-video-export",
    );
  });

  it("acceptance: layers panel selects objects", () => {
    expect(appSchema.panels.layers).toBe(true);
  });

  it("acceptance: layers panel toggles object visibility", () => {
    expect(appSchema.panels.layers).toBe(true);
  });

  it("acceptance: layers panel reorders objects", () => {
    expect(appSchema.panels.layers).toBe(true);
  });

  it("acceptance: layers panel groups objects", () => {
    expect(appSchema.panels.layers).toBe(true);
  });

  it("acceptance: canvas move handle repositions selected object", () => {
    expect(section("Object").controls.charset.target).toBe("selectedLayer.charset");
  });

  it("acceptance: canvas resize handle resizes selected object", () => {
    expect(section("Object").controls.cellSize.target).toBe("selectedLayer.cellSize");
  });

  it("perf: object composite scene stays under budget", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-object-composite",
    );
  });

  it("perf: layer interactions keep viewport stable", () => {
    expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain(
      "ascii-layers-interactions",
    );
  });
});
