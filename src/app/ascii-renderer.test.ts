import { describe, expect, it } from "vitest";

import { getAsciiGrid } from "./ascii-renderer";

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
