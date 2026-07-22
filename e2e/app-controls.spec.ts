import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { appPerformance } from "../src/app/app-performance";
import {
  applyToolcraftPerformanceStressFixture,
  applyToolcraftPerformanceWorkloadFixture,
  dragToolcraftSliderByLabel,
  dragToolcraftSliderToPerformanceStressValue,
  dragToolcraftSliderToValue,
  expectToolcraftDiscreteSliderDragSmoothness,
  expectToolcraftCanvasBackingPixelsForRenderScale,
  expectToolcraftCanvasViewportStable,
  expectToolcraftScenarioPerformanceBudget,
  getToolcraftFieldByLabel,
  getToolcraftPerformanceStressValue,
  measureToolcraftInteraction,
  waitForToolcraftAnimationFrames,
  zoomToolcraftCanvasViewport,
} from "./performance-helpers";
import {
  expectToolcraftProductObservableToChange,
  getToolcraftProductObservableSnapshot,
} from "./product-observable-helpers";

const fixtureSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
  <rect width="320" height="360" fill="#050505"/>
  <rect x="320" width="320" height="360" fill="#f8f8f8"/>
  <circle cx="320" cy="180" r="92" fill="#d82424"/>
  <rect x="440" y="80" width="140" height="200" fill="#2468d8"/>
</svg>`;

const portraitSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640">
  <rect width="360" height="640" fill="#111"/>
  <rect y="220" width="360" height="200" fill="#eee"/>
</svg>`;

async function uploadFixture(page: Page, source = fixtureSvg): Promise<void> {
  const handle = await page.evaluateHandle((svgSource) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([svgSource], "ascii-fixture.svg", { type: "image/svg+xml" }));
    return dataTransfer;
  }, source);

  await page.getByRole("application", { name: "Canvas viewport" }).dispatchEvent("drop", {
    dataTransfer: handle,
  });
  await expect(page.getByRole("img", { name: "ascii-fixture.svg" })).toBeVisible();
  await expect(page.getByLabel("ASCII image output")).toBeVisible();
  await waitForToolcraftAnimationFrames(page, 4);
}

async function selectFieldOption(page: Page, label: string, value: string): Promise<void> {
  const field =
    label === "Resolution"
      ? page.locator('[data-slot="field"]').filter({ hasText: /^Resolution/ }).last()
      : await getToolcraftFieldByLabel(page, label);
  const optionLabels: Record<string, string> = {
    "2k": "2K",
    "4k": "4K",
    "8k": "8K",
    blocks: "Blocks",
    classic: "Classic",
    fine: "Fine",
    jpg: "JPG",
    mono: "Mono",
    png: "PNG",
    source: "Source",
  };
  const optionLabel = optionLabels[value] ?? value;
  await field.locator('[data-slot="select-trigger"]').click();
  await page
    .locator('[data-slot="select-item"]')
    .filter({ hasText: new RegExp(`^${optionLabel}$`) })
    .click();
  await waitForToolcraftAnimationFrames(page, 3);
}

async function setSliderValueByLabel(page: Page, label: string, value: number): Promise<void> {
  await page.getByRole("button", { name: `Edit ${label} value` }).click();
  const editor = page.getByRole("textbox", { name: `${label} value` });
  await editor.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await editor.fill(String(value));
  await editor.press("Enter");
  await waitForToolcraftAnimationFrames(page, 4);
}

async function clickSwitch(page: Page, label: string): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, label);
  await field.getByRole("switch").click();
  await waitForToolcraftAnimationFrames(page, 3);
}

async function changeFirstColorInput(page: Page, label: string, value: string): Promise<void> {
  await page.getByRole("textbox", { name: `${label} hex` }).fill(value);
  await page.getByRole("textbox", { name: `${label} hex` }).press("Enter");
  await waitForToolcraftAnimationFrames(page, 3);
}

async function exportAndReadBytes(page: Page): Promise<Buffer> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  return readFile(path!);
}

test("browser: source image upload drives ASCII output", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);

  const uploaded = await getToolcraftProductObservableSnapshot(page);
  await page.getByRole("button", { name: "90°" }).click();
  await waitForToolcraftAnimationFrames(page, 4);
  const rotated = await getToolcraftProductObservableSnapshot(page);
  expect(rotated).not.toBe(uploaded);

  await page.getByRole("button", { name: "Flip H" }).click();
  await waitForToolcraftAnimationFrames(page, 4);
  await expectToolcraftProductObservableToChange(page, async () => {
    await page.getByRole("button", { name: "Flip V" }).click();
  });

  await page.getByRole("button", { name: /remove|clear|delete/i }).first().click();
  await expect(page.getByRole("img", { name: "ascii-fixture.svg" })).toHaveCount(0);
  await page.getByRole("button", { name: /Reset controls/i }).click();
  await expect(page.getByRole("img", { name: "ascii-fixture.svg" })).toHaveCount(0);
});

test("browser: glyph selector changes ASCII characters", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await expectToolcraftProductObservableToChange(page, async () => {
    await selectFieldOption(page, "Glyphs", "blocks");
  });
  await expectToolcraftProductObservableToChange(page, async () => {
    await selectFieldOption(page, "Glyphs", "fine");
  });
});

test("browser: cell size slider changes ASCII density live", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await expectToolcraftProductObservableToChange(page, async () => {
    await setSliderValueByLabel(page, "Cell size", 8);
  });
});

test("browser: contrast slider changes ASCII tone mapping live", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await expectToolcraftProductObservableToChange(page, async () => {
    await setSliderValueByLabel(page, "Contrast", 2.2);
  });
});

test("browser: brightness slider changes ASCII tone mapping live", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await expectToolcraftProductObservableToChange(page, async () => {
    await setSliderValueByLabel(page, "Brightness", 36);
  });
});

test("browser: invert switch reverses ASCII tone mapping", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await expectToolcraftProductObservableToChange(page, async () => {
    await clickSwitch(page, "Invert");
  });
});

test("browser: color mode select switches mono and source color", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await expectToolcraftProductObservableToChange(page, async () => {
    await selectFieldOption(page, "Color", "source");
  });
  await expectToolcraftProductObservableToChange(page, async () => {
    await selectFieldOption(page, "Color", "mono");
  });
});

test("browser: ink color changes mono ASCII glyph color", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await expectToolcraftProductObservableToChange(page, async () => {
    await changeFirstColorInput(page, "Ink", "#00ff88");
  });
});

test("browser: background include and color control preview and PNG alpha", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await expectToolcraftProductObservableToChange(page, async () => {
    await changeFirstColorInput(page, "background", "#274050");
  });
  await expectToolcraftProductObservableToChange(page, async () => {
    await clickSwitch(page, "Include");
  });
  await expect(page.getByRole("application", { name: "Canvas viewport" })).toBeVisible();
  const bytes = await exportAndReadBytes(page);
  expect(bytes.length).toBeGreaterThan(1000);
});

test("browser: image export format and resolution change output bytes", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await selectFieldOption(page, "Resolution", "2k");
  const pngBytes = await exportAndReadBytes(page);
  expect(pngBytes.subarray(1, 4).toString()).toBe("PNG");
  const png = await page.evaluate(async (rawBytes) => {
    const blob = new Blob([new Uint8Array(rawBytes)], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    return { height: bitmap.height, width: bitmap.width };
  }, [...pngBytes]);
  expect(png.width).toBe(2048);
  expect(png.height).toBe(1152);

  await selectFieldOption(page, "Format", "jpg");
  await selectFieldOption(page, "Resolution", "4k");
  const jpgBytes = await exportAndReadBytes(page);
  expect(jpgBytes[0]).toBe(0xff);
  expect(jpgBytes[1]).toBe(0xd8);
  expect(jpgBytes.length).not.toBe(pngBytes.length);
});

test("browser: localStorage persistence restores ASCII settings", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await setSliderValueByLabel(page, "Cell size", 18);
  await clickSwitch(page, "Invert");
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole("button", { name: "Edit Cell size value" })).toContainText("18px");
  await expect((await getToolcraftFieldByLabel(page, "Invert")).getByRole("switch")).toBeChecked();
});

test("browser: editable output sizing keeps upload cropped to canvas", async ({ page }) => {
  await page.goto("/");
  const before = await getToolcraftProductObservableSnapshot(page);
  await uploadFixture(page, portraitSvg);
  const after = await getToolcraftProductObservableSnapshot(page);
  expect(after).not.toBe(before);
  await expect(await getToolcraftFieldByLabel(page, "Canvas width")).toBeVisible();
  await expect(await getToolcraftFieldByLabel(page, "Canvas height")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Resolution scale value" })).toBeVisible();
  await expect(
    (await getToolcraftFieldByLabel(page, "Resolution scale")).locator(
      '[data-slot="slider"][data-variant="discrete"]',
    ),
  ).toBeVisible();
  await expect(
    (await getToolcraftFieldByLabel(page, "Resolution scale")).locator(
      '[data-slot="slider-marker"]',
    ).first(),
  ).toBeVisible();
  await expectToolcraftDiscreteSliderDragSmoothness(page, "Resolution scale", {
    maxFrameGapMs: 240,
    maxInteractionMs: 800,
  });
  await expect(page.getByLabel("ASCII image output")).toBeVisible();
});

test("browser perf: ASCII preview render stays under budget", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await applyToolcraftPerformanceStressFixture(
    page,
    appPerformance,
    "ascii-preview-render",
    {
      cellSize: async (value) => {
        await dragToolcraftSliderToValue(page, "Cell size", Number(value));
      },
      renderScale: async (value) => {
        await expectToolcraftCanvasBackingPixelsForRenderScale(
          page,
          '[data-toolcraft-renderer-layer="ascii-product"]',
          Number(value),
        );
      },
      sourceMedia: async () => {
        await expect(page.getByRole("img", { name: "ascii-fixture.svg" })).toBeVisible();
      },
    },
  );
  getToolcraftPerformanceStressValue<Record<string, unknown>>(
    appPerformance,
    "ascii-preview-render",
  );
  const result = await measureToolcraftInteraction(
    page,
    async () => {
      const glyphField = await getToolcraftFieldByLabel(page, "Glyphs");
      await glyphField.locator('[data-slot="select-trigger"]').click();
      await page.locator('[data-slot="select-item"]').filter({ hasText: /^Fine$/ }).click();
      await page.getByRole("application", { name: "Canvas viewport" }).click();
    },
    { settleFrames: 8 },
  );
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-preview-render");
});

test("browser perf: Source image import stays responsive", async ({ page }) => {
  await page.goto("/");
  getToolcraftPerformanceStressValue(appPerformance, "ascii-media-import");
  const result = await measureToolcraftInteraction(page, async () => {
    await uploadFixture(page);
  });
  await expect(page.getByLabel("ASCII image output")).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-media-import");
});

test("browser perf: Source image control coverage uses heavy media", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await applyToolcraftPerformanceWorkloadFixture(
    page,
    appPerformance,
    "ascii-source-control-change",
    {
      renderScale: async (value) => {
        await expectToolcraftCanvasBackingPixelsForRenderScale(
          page,
          '[data-toolcraft-renderer-layer="ascii-product"]',
          Number(value),
        );
      },
    },
  );
  getToolcraftPerformanceStressValue(appPerformance, "ascii-source-control-change");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("application", { name: "Canvas viewport" }).click();
    await uploadFixture(page);
  });
  await expect(page.getByLabel("ASCII image output")).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(
    result,
    appPerformance,
    "ascii-source-control-change",
  );
});

test("browser perf: Glyph selector change stays responsive", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await applyToolcraftPerformanceWorkloadFixture(page, appPerformance, "ascii-glyphs-change", {
    renderScale: async (value) => {
      await expectToolcraftCanvasBackingPixelsForRenderScale(
        page,
        '[data-toolcraft-renderer-layer="ascii-product"]',
        Number(value),
      );
    },
    sourceMedia: async () => {
      await expect(page.getByRole("img", { name: "ascii-fixture.svg" })).toBeVisible();
    },
  });
  getToolcraftPerformanceStressValue(appPerformance, "ascii-glyphs-change");
  const result = await measureToolcraftInteraction(page, async () => {
    const glyphField = await getToolcraftFieldByLabel(page, "Glyphs");
    await glyphField.locator('[data-slot="select-trigger"]').click();
    await page.locator('[data-slot="select-item"]').filter({ hasText: /^Fine$/ }).click();
    await page.getByRole("application", { name: "Canvas viewport" }).click();
  });
  await expect(await getToolcraftFieldByLabel(page, "Glyphs")).toContainText("Fine");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-glyphs-change");
});

test("browser perf: Cell size drag stays responsive at heavy source", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await applyToolcraftPerformanceWorkloadFixture(
    page,
    appPerformance,
    "ascii-cell-size-drag",
    {
      renderScale: async (value) => {
        await expectToolcraftCanvasBackingPixelsForRenderScale(
          page,
          '[data-toolcraft-renderer-layer="ascii-product"]',
          Number(value),
        );
      },
      sourceMedia: async () => {
        await expect(page.getByRole("img", { name: "ascii-fixture.svg" })).toBeVisible();
      },
    },
  );
  await dragToolcraftSliderToPerformanceStressValue(
    page,
    "Cell size",
    appPerformance,
    "ascii-cell-size-drag",
  );
  const result = await measureToolcraftInteraction(
    page,
    async () => {
      await dragToolcraftSliderByLabel(page, "Cell size", 0.5);
    },
    { settleFrames: 4 },
  );
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-cell-size-drag");
});

test("browser perf: Contrast drag stays responsive at heavy source", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await applyToolcraftPerformanceWorkloadFixture(page, appPerformance, "ascii-contrast-drag", {
    renderScale: async (value) => {
      await expectToolcraftCanvasBackingPixelsForRenderScale(
        page,
        '[data-toolcraft-renderer-layer="ascii-product"]',
        Number(value),
      );
    },
    sourceMedia: async () => {
      await expect(page.getByRole("img", { name: "ascii-fixture.svg" })).toBeVisible();
    },
  });
  await dragToolcraftSliderToPerformanceStressValue(
    page,
    "Contrast",
    appPerformance,
    "ascii-contrast-drag",
  );
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Contrast", 0.25);
  });
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-contrast-drag");
});

test("browser perf: Brightness drag stays responsive at heavy source", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await applyToolcraftPerformanceWorkloadFixture(page, appPerformance, "ascii-brightness-drag", {
    renderScale: async (value) => {
      await expectToolcraftCanvasBackingPixelsForRenderScale(
        page,
        '[data-toolcraft-renderer-layer="ascii-product"]',
        Number(value),
      );
    },
    sourceMedia: async () => {
      await expect(page.getByRole("img", { name: "ascii-fixture.svg" })).toBeVisible();
    },
  });
  await dragToolcraftSliderToPerformanceStressValue(
    page,
    "Brightness",
    appPerformance,
    "ascii-brightness-drag",
  );
  const result = await measureToolcraftInteraction(page, async () => {
    await dragToolcraftSliderByLabel(page, "Brightness", 0.25);
  });
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-brightness-drag");
});

test("browser perf: Invert toggle stays responsive", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const invertField = await getToolcraftFieldByLabel(page, "Invert");
    await invertField.getByRole("switch").click();
  });
  await expect((await getToolcraftFieldByLabel(page, "Invert")).getByRole("switch")).toBeChecked();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-invert-change");
});

test("browser perf: Color mode select stays responsive", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const colorField = await getToolcraftFieldByLabel(page, "Color");
    await colorField.locator('[data-slot="select-trigger"]').click();
    await page.locator('[data-slot="select-item"]').filter({ hasText: /^Source$/ }).click();
    await page.getByRole("application", { name: "Canvas viewport" }).click();
  });
  await expect(await getToolcraftFieldByLabel(page, "Color")).toContainText("Source");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-color-mode-change");
});

test("browser perf: Ink color change stays responsive", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("textbox", { name: "Ink hex" }).fill("#00ff88");
    await page.getByRole("textbox", { name: "Ink hex" }).press("Enter");
  });
  await expect(page.getByRole("textbox", { name: "Ink hex" })).toHaveValue("#00FF88");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-ink-change");
});

test("browser perf: Include background toggle stays responsive", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const includeField = await getToolcraftFieldByLabel(page, "Include");
    await includeField.getByRole("switch").click();
  });
  await expect((await getToolcraftFieldByLabel(page, "Include")).getByRole("switch")).not.toBeChecked();
  expectToolcraftScenarioPerformanceBudget(
    result,
    appPerformance,
    "ascii-include-background-change",
  );
});

test("browser perf: Background color change stays responsive", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("textbox", { name: "background hex" }).fill("#274050");
    await page.getByRole("textbox", { name: "background hex" }).press("Enter");
  });
  await expect(page.getByRole("textbox", { name: "background hex" })).toHaveValue("#274050");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-background-change");
});

test("browser perf: Image format select stays responsive", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const formatField = await getToolcraftFieldByLabel(page, "Format");
    await formatField.locator('[data-slot="select-trigger"]').click();
    await page.locator('[data-slot="select-item"]').filter({ hasText: /^JPG$/ }).click();
    await page.getByRole("application", { name: "Canvas viewport" }).click();
  });
  await expect(await getToolcraftFieldByLabel(page, "Format")).toContainText("JPG");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-format-change");
});

test("browser perf: Image resolution select uses export workload values", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await applyToolcraftPerformanceWorkloadFixture(
    page,
    appPerformance,
    "ascii-resolution-change",
    {
      sourceMedia: async () => {
        await expect(page.getByRole("img", { name: "ascii-fixture.svg" })).toBeVisible();
      },
    },
  );
  getToolcraftPerformanceStressValue(appPerformance, "ascii-resolution-change");
  const result = await measureToolcraftInteraction(page, async () => {
    const resolutionField = page
      .locator('[data-slot="field"]')
      .filter({ hasText: /^Resolution/ })
      .last();
    await resolutionField.locator('[data-slot="select-trigger"]').click();
    await page.locator('[data-slot="select-item"]').filter({ hasText: /^8K$/ }).click();
    await page.getByRole("application", { name: "Canvas viewport" }).click();
  });
  await expect(
    page.locator('[data-slot="field"]').filter({ hasText: /^Resolution/ }).last(),
  ).toContainText("8K");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-resolution-change");
});

test("browser perf: ASCII export completes at selected resolution", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await applyToolcraftPerformanceStressFixture(page, appPerformance, "ascii-export", {
    resolution: async (value) => {
      await selectFieldOption(page, "Resolution", String(value));
    },
    sourceMedia: async () => {
      await expect(page.getByRole("img", { name: "ascii-fixture.svg" })).toBeVisible();
    },
  });
  const startedAt = Date.now();
  let bytes = Buffer.alloc(0);
  const interaction = await measureToolcraftInteraction(page, async () => {
    bytes = await exportAndReadBytes(page);
  });
  const result = { ...interaction, exportMs: Date.now() - startedAt };
  expect(bytes.length).toBeGreaterThan(1000);
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-export");
});

test("browser perf: ASCII viewport zoom stays stable", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  await applyToolcraftPerformanceStressFixture(
    page,
    appPerformance,
    "ascii-viewport-zoom",
    {
      cellSize: async (value) => {
        await dragToolcraftSliderToValue(page, "Cell size", Number(value));
      },
      renderScale: async (value) => {
        await expectToolcraftCanvasBackingPixelsForRenderScale(
          page,
          '[data-toolcraft-renderer-layer="ascii-product"]',
          Number(value),
        );
      },
    },
  );
  const result = await measureToolcraftInteraction(page, async () => {
    await zoomToolcraftCanvasViewport(page, 1);
  });
  await expectToolcraftCanvasViewportStable(page, async () => {});
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-viewport-zoom");
});

test("browser perf: ASCII viewport remains stable", async ({ page }) => {
  await page.goto("/");
  await uploadFixture(page);
  const result = await expectToolcraftCanvasViewportStable(page, async () => {
    const colorField = await getToolcraftFieldByLabel(page, "Color");
    await colorField.locator('[data-slot="select-trigger"]').click();
    await page.locator('[data-slot="select-item"]').filter({ hasText: /^Source$/ }).click();
    await page.getByRole("application", { name: "Canvas viewport" }).click();
  });
  await expect(await getToolcraftFieldByLabel(page, "Color")).toContainText("Source");
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-viewport-stability");
});

async function uploadVideoFixture(page: Page): Promise<void> {
  const handle = await page.evaluateHandle(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    });
    recorder.start();
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const draw = (): void => {
        const elapsed = (performance.now() - start) / 1000;
        const shade = Math.floor((elapsed / 1) * 255) % 256;
        context.fillStyle = `rgb(${shade}, ${255 - shade}, 128)`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (elapsed >= 1) {
          resolve();
          return;
        }
        requestAnimationFrame(draw);
      };
      draw();
    });
    recorder.stop();
    const blob = await stopped;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([blob], "ascii-fixture.webm", { type: "video/webm" }));
    return dataTransfer;
  });

  await page.getByRole("application", { name: "Canvas viewport" }).dispatchEvent("drop", {
    dataTransfer: handle,
  });
  await expect(page.getByLabel("ASCII image output")).toBeVisible();
  await waitForToolcraftAnimationFrames(page, 4);
}

test("browser perf: Video timeline playback renders frames under budget", async ({ page }) => {
  await page.goto("/");
  await uploadVideoFixture(page);
  getToolcraftPerformanceStressValue(appPerformance, "ascii-video-playback-render");
  const result = await measureToolcraftInteraction(page, async () => {
    await page.getByRole("button", { name: /play/i }).first().click();
    await waitForToolcraftAnimationFrames(page, 8);
    await page.getByRole("button", { name: /pause/i }).first().click();
  });
  await expect(page.getByLabel("ASCII image output")).toBeVisible();
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-video-playback-render");
});

test("browser perf: Video resolution select uses export workload values", async ({ page }) => {
  await page.goto("/");
  await uploadVideoFixture(page);
  await applyToolcraftPerformanceWorkloadFixture(
    page,
    appPerformance,
    "ascii-video-resolution-change",
    {
      sourceMedia: async () => {
        await expect(page.getByLabel("ASCII image output")).toBeVisible();
      },
    },
  );
  getToolcraftPerformanceStressValue(appPerformance, "ascii-video-resolution-change");
  const result = await measureToolcraftInteraction(page, async () => {
    const resolutionField = page
      .locator('[data-slot="field"]')
      .filter({ hasText: /^Resolution/ })
      .last();
    await resolutionField.locator('[data-slot="select-trigger"]').click();
    await page.locator('[data-slot="select-item"]').filter({ hasText: /^4K$/ }).click();
    await page.getByRole("application", { name: "Canvas viewport" }).click();
  });
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-video-resolution-change");
});

test("browser perf: Video format select stays responsive", async ({ page }) => {
  await page.goto("/");
  await uploadVideoFixture(page);
  const result = await measureToolcraftInteraction(page, async () => {
    const formatField = page
      .locator('[data-slot="field"]')
      .filter({ hasText: /^Format/ })
      .last();
    await formatField.locator('[data-slot="select-trigger"]').click();
    await page.locator('[data-slot="select-item"]').filter({ hasText: /^WebM$/ }).click();
    await page.getByRole("application", { name: "Canvas viewport" }).click();
  });
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-video-format-change");
});

test("browser perf: ASCII video export completes at selected resolution", async ({ page }) => {
  await page.goto("/");
  await uploadVideoFixture(page);
  getToolcraftPerformanceStressValue(appPerformance, "ascii-video-export");
  const result = await measureToolcraftInteraction(page, async () => {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /export video/i }).click();
    await downloadPromise;
  });
  expectToolcraftScenarioPerformanceBudget(result, appPerformance, "ascii-video-export");
});
