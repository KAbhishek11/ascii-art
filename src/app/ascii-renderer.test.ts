import { describe, expect, it } from "vitest";

import {
  createSelectedLayerExportState,
  getAsciiGrid,
  getSelectedExportLayerIds,
} from "./ascii-renderer";
import type { ToolcraftState } from "@/toolcraft/runtime";

describe("getAsciiGrid", () => {
  it("uses the monospace glyph aspect ratio for denser horizontal sampling", () => {
    const grid = getAsciiGrid(640, 360, 12);

    expect(grid).toMatchObject({ cellHeight: 12, fontSize: 13, rows: 30 });
    expect(grid.columns).toBe(80);
    expect(grid.cellWidth).toBeCloseTo(8.06, 2);
  });

  it("keeps the logical output aspect ratio when deriving rows and columns", () => {
    const grid = getAsciiGrid(2560, 1440, 12);

    expect(grid.columns / grid.rows).toBeCloseTo(2.67, 1);
  });
});

describe("createSelectedLayerExportState", () => {
  it("uses the selected object's bounds as the export frame", () => {
    const state = {
      canvas: { size: { height: 1080, width: 1920 } },
      layers: [
        { id: "first", kind: "image", visible: true },
        { id: "second", kind: "image", visible: true },
      ],
      mediaAssets: [
        { id: "asset-first", layerId: "first" },
        { id: "asset-second", layerId: "second" },
      ],
      values: {
        "obj.first.h": 160,
        "obj.first.w": 240,
        "obj.first.x": 320,
        "obj.first.y": 180,
      },
    } as unknown as ToolcraftState;

    const exportState = createSelectedLayerExportState(state, "first");

    expect(exportState.canvas.size).toMatchObject({ height: 160, width: 240 });
    expect(exportState.layers.map((layer) => layer.id)).toEqual(["first"]);
    expect(exportState.mediaAssets.map((asset) => asset.layerId)).toEqual(["first"]);
    expect(exportState.values).toMatchObject({
      "obj.first.h": 160,
      "obj.first.w": 240,
      "obj.first.x": 0,
      "obj.first.y": 0,
    });
  });
});

describe("getSelectedExportLayerIds", () => {
  it("keeps only selected visible image layers", () => {
    const state = {
      layers: [
        { id: "first", kind: "image", visible: true },
        { id: "hidden", kind: "image", visible: false },
        { id: "group", kind: "group", visible: true },
      ],
      mediaAssets: [
        { id: "asset-first", layerId: "first" },
        { id: "asset-hidden", layerId: "hidden" },
      ],
      values: { "export.selection": ["first", "hidden", "missing"] },
    } as unknown as ToolcraftState;

    expect(getSelectedExportLayerIds(state)).toEqual(["first"]);
  });

  it("uses the currently selected layer until an export selection is made", () => {
    const state = {
      layers: [{ id: "first", kind: "image", visible: true }],
      mediaAssets: [{ id: "asset-first", layerId: "first" }],
      selectedLayerId: "first",
      values: { "export.selection": [] },
    } as unknown as ToolcraftState;

    expect(getSelectedExportLayerIds(state)).toEqual(["first"]);
  });
});
