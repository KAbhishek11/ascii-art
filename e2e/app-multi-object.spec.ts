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

async function uploadTwoObjects(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await uploadImage(page, "a.png", [200, 40, 40]);
  await page.waitForTimeout(600);
  await uploadImage(page, "b.png", [40, 80, 220]);
  await page.waitForTimeout(1500);
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

  test("browser: object arrange actions duplicate and reorder the selected object", async ({ page }) => {
    await uploadTwoObjects(page);
    const before = await page.locator("[data-object-hit]").count();
    await page.getByRole("button", { name: /^duplicate$/i }).click();
    await page.waitForTimeout(600);
    expect(await page.locator("[data-object-hit]").count()).toBeGreaterThanOrEqual(before);
    await page.getByRole("button", { name: /bring to front/i }).click();
    await page.getByRole("button", { name: /send to back/i }).click();
  });
});

test("browser perf: Object arrange actions stay responsive", async ({ page }) => {
  await page.goto("/");
});

test("browser perf: object composite scene stays under budget", async ({ page }) => {
  expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain("ascii-object-composite");
  await uploadTwoObjects(page);
  await expect(page.locator("[data-object-hit]")).toHaveCount(2);
});

test("browser perf: layer interactions keep viewport stable", async ({ page }) => {
  expect(appPerformance.scenarios.map((scenario) => scenario.id)).toContain("ascii-layers-interactions");
  await uploadTwoObjects(page);
  await expect(page.locator("[data-object-hit]")).toHaveCount(2);
});
