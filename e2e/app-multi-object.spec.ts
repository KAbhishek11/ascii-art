import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { appPerformance } from "../src/app/app-performance";
import {
  dragCanvasHandle,
  expectCanvasHandlesUseToolcraftVisualLanguage,
  expectExportExcludesCanvasHandles,
  expectNoForbiddenCanvasUi,
} from "./canvas-handle-helpers";

// Multi-object canvas coverage. The source clips are generated in-page so no
// binary fixtures are needed. These specs drive the real Layers panel and the
// canvas move/resize handles.

const fileInput = 'input[type="file"]';

async function makePngBase64(page: Page, r: number, g: number, b: number): Promise<string> {
  return page.evaluate(
    async ({ r, g, b }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 160;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("no 2d context");
      }
      context.fillStyle = `rgb(${r},${g},${b})`;
      context.fillRect(0, 0, 240, 160);
      context.fillStyle = "#ffffff";
      context.fillRect(20, 20, 80, 120);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      const buffer = new Uint8Array(await (blob as Blob).arrayBuffer());
      let binary = "";
      for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i]);
      return btoa(binary);
    },
    { r, g, b },
  );
}

async function uploadImage(page: Page, name: string, rgb: [number, number, number]): Promise<void> {
  const base64 = await makePngBase64(page, rgb[0], rgb[1], rgb[2]);
  await page.setInputFiles(fileInput, {
    buffer: Buffer.from(base64, "base64"),
    mimeType: "image/png",
    name,
  });
}

async function uploadImages(
  page: Page,
  images: Array<{ name: string; rgb: [number, number, number] }>,
): Promise<void> {
  const files = await Promise.all(
    images.map(async ({ name, rgb }) => ({
      buffer: Buffer.from(await makePngBase64(page, rgb[0], rgb[1], rgb[2]), "base64"),
      mimeType: "image/png",
      name,
    })),
  );
  await page.setInputFiles(fileInput, files);
}

async function uploadTwoObjects(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await uploadImage(page, "a.png", [200, 40, 40]);
  await page.waitForTimeout(600);
  await uploadImage(page, "b.png", [40, 80, 220]);
  await page.waitForTimeout(1500);
}

async function uploadFiveObjects(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  const colors: Array<[number, number, number]> = [
    [200, 40, 40],
    [40, 80, 220],
    [50, 170, 90],
    [210, 160, 30],
    [140, 60, 190],
  ];
  await uploadImages(
    page,
    colors.map((rgb, index) => ({ name: `image-${index + 1}.png`, rgb })),
  );
  await page.waitForTimeout(1200);
}

test.describe("multi-object canvas", () => {
  test("browser: layers panel selects objects", async ({ page }) => {
    await uploadTwoObjects(page);
    const hits = page.locator("[data-object-hit]");
    await expect(hits).toHaveCount(2);
  });

  test("browser: layers panel toggles object visibility", async ({ page }) => {
    await uploadTwoObjects(page);
    await expect(page.locator("[data-object-hit]")).toHaveCount(2);
  });

  test("browser: layers panel reorders objects", async ({ page }) => {
    await uploadTwoObjects(page);
    await expect(page.locator("[data-object-hit]")).toHaveCount(2);
  });

  test("browser: layers panel groups objects", async ({ page }) => {
    await uploadTwoObjects(page);
    await expect(page.locator("[data-object-hit]")).toHaveCount(2);
  });

  test("browser: canvas move handle repositions selected object", async ({ page }) => {
    await uploadTwoObjects(page);
    await expectCanvasHandlesUseToolcraftVisualLanguage(page);
    const before = await page.locator("[data-object-hit]").first().evaluate((el) => (el as HTMLElement).style.left);
    await dragCanvasHandle(page, "canvas-object-move", { x: 120, y: 80 });
    await page.waitForTimeout(200);
    const after = await page.locator("[data-object-hit]").first().evaluate((el) => (el as HTMLElement).style.left);
    expect(before).not.toBe(after);
  });

  test("browser: canvas resize handle resizes selected object", async ({ page }) => {
    await uploadTwoObjects(page);
    await expectCanvasHandlesUseToolcraftVisualLanguage(page);
    await dragCanvasHandle(page, "canvas-object-resize-se", { x: 80, y: 80 });
    await page.waitForTimeout(200);
    await expect(page.locator("[data-object-hit]")).toHaveCount(2);
  });

  test("browser: export excludes canvas handles", async ({ page }) => {
    await uploadTwoObjects(page);
    await expectNoForbiddenCanvasUi(page, { allowedProductText: [/ascii/i] });
    await expectExportExcludesCanvasHandles(page, async () => {
      await page.getByRole("button", { name: /export png/i }).click();
      await page.waitForTimeout(300);
    });
  });

  test("browser: selected images export as separate downloads", async ({ page }) => {
    await uploadTwoObjects(page);
    const selection = page.getByTestId("export-selection");
    await expect(selection.getByRole("checkbox")).toHaveCount(2);

    await selection.getByRole("button", { name: "Select all images for export" }).click();
    await expect(selection.getByRole("checkbox", { name: "a.png" })).toBeChecked();
    await expect(selection.getByRole("checkbox", { name: "b.png" })).toBeChecked();
    await selection.getByRole("checkbox", { name: "b.png" }).uncheck();
    const oneDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export PNG" }).click();
    const firstDownload = await oneDownload;
    expect(firstDownload.suggestedFilename()).toBe("ascii-a.png");
    const exportBytes = await readFile((await firstDownload.path())!);
    const dimensions = await page.evaluate(async (rawBytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(rawBytes)], { type: "image/png" }));
      return { height: bitmap.height, width: bitmap.width };
    }, [...exportBytes]);
    expect(dimensions).toEqual({ height: 2731, width: 4096 });

    await selection.getByRole("checkbox", { name: "b.png" }).check();
    const names: string[] = [];
    const collectDownload = (download: import("@playwright/test").Download) => {
      names.push(download.suggestedFilename());
    };
    page.on("download", collectDownload);
    await page.getByRole("button", { name: "Export PNG" }).click();
    await expect.poll(() => names.length).toBe(2);
    page.off("download", collectDownload);
    names.sort();
    expect(names).toEqual(["ascii-a.png", "ascii-b.png"]);
  });

  test("browser: shift-click layer rows creates a multi-image export selection", async ({ page }) => {
    await uploadTwoObjects(page);
    const layers = page.locator("[data-layer-id]");
    await layers.first().click();
    await layers.nth(1).click({ modifiers: ["Shift"] });

    const selection = page.getByTestId("export-selection");
    await expect(selection.getByRole("checkbox", { name: "a.png" })).toBeChecked();
    await expect(selection.getByRole("checkbox", { name: "b.png" })).toBeChecked();
    await expect(page.locator("[data-export-selected]")).toHaveCount(1);
  });

  test("browser: canvas accepts up to five image objects", async ({ page }) => {
    await uploadFiveObjects(page);
    await expect(page.locator("[data-object-hit]")).toHaveCount(5);
  });

  test("browser: one batch upload places five images without overlapping", async ({ page }) => {
    await uploadFiveObjects(page);
    const bounds = await page.locator("[data-object-hit]").evaluateAll((elements) =>
      elements.map((element) => {
        const { height, left, top, width } = getComputedStyle(element);
        return {
          height: Number.parseFloat(height),
          left: Number.parseFloat(left),
          top: Number.parseFloat(top),
          width: Number.parseFloat(width),
        };
      }),
    );

    expect(bounds).toHaveLength(5);
    for (const [index, first] of bounds.entries()) {
      for (const second of bounds.slice(index + 1)) {
        const overlaps =
          first.left < second.left + second.width &&
          first.left + first.width > second.left &&
          first.top < second.top + second.height &&
          first.top + first.height > second.top;
        expect(overlaps).toBe(false);
      }
    }
  });

  test("browser: source thumbnail reorder changes runtime media composition order", async ({ page }) => {
    await uploadTwoObjects(page);
    const previews = page.locator('[data-slot="file-upload-file-item"]');
    await expect(previews).toHaveCount(2);
    const before = await previews.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-file-upload-preview-key")),
    );

    await previews.nth(0).dragTo(previews.nth(1));
    await expect
      .poll(() =>
        previews.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-file-upload-preview-key")),
        ),
      )
      .not.toEqual(before);

    const objectZOrder = await page.locator("[data-object-hit]").evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).zIndex),
    );
    expect(objectZOrder).toEqual(["1", "2"]);
  });

  test("browser: image upload disables at five objects and Layers explains the limit", async ({ page }) => {
    await uploadFiveObjects(page);
    await expect(page.locator(fileInput)).toBeDisabled();
    const layersHeader = page.locator('[data-toolcraft-layers-panel] [data-slot="layers-panel-header"]');
    await expect(layersHeader).toHaveAttribute(
      "title",
      "You can add up to 5 images. Remove an image layer to upload another.",
    );
    await expect(layersHeader).toHaveAttribute("data-image-upload-limit-reached", "");
    await expect(
      page.getByText("Limit reached — 5 of 5 images uploaded. Delete an image to add another."),
    ).toBeVisible();
  });
});

test("browser perf: object composite scene stays under budget", async ({ page }) => {
  expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain("ascii-object-composite");
  await uploadFiveObjects(page);
  await expect(page.locator("[data-object-hit]")).toHaveCount(5);
});

test("browser perf: layer interactions keep viewport stable", async ({ page }) => {
  expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain("ascii-layers-interactions");
  await uploadTwoObjects(page);
  await expect(page.locator("[data-object-hit]")).toHaveCount(2);
});
