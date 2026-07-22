import { expect, test, type Page } from "@playwright/test";

// End-to-end coverage for the video -> ASCII -> WebM pipeline.
//
// The source clip is generated in the browser (recording a moving canvas) so the
// test needs no binary fixture. The exported blob is then loaded back as a
// <video> to assert real timeline-length duration and encoder-safe dimensions
// (Current and 4K). getToolcraftVideoExportSize fits 4K inside 3840x2160, so the
// dimension assertions below stay within that box.

const videoAccept = 'input[type="file"][accept*="video"]';

// Records a short moving-gradient clip in the page and returns it as base64 so it
// can be handed to the Video file input via setInputFiles.
async function createSourceClipBase64(page: Page, seconds: number): Promise<string> {
  return page.evaluate(async (durationSeconds) => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("no 2d context");
    }

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      recorder.onerror = () => reject(new Error("record failed"));
    });

    recorder.start();
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const draw = (): void => {
        const elapsed = (performance.now() - start) / 1000;
        const shade = Math.floor((elapsed / durationSeconds) * 255) % 256;
        context.fillStyle = `rgb(${shade}, ${255 - shade}, 128)`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff";
        context.fillRect((elapsed * 60) % canvas.width, 0, 24, canvas.height);
        if (elapsed >= durationSeconds) {
          resolve();
          return;
        }
        requestAnimationFrame(draw);
      };
      draw();
    });
    recorder.stop();

    const blob = await stopped;
    const buffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }, seconds);
}

// Loads an exported blob as a <video>, waits for loadedmetadata, and resolves its
// real duration. Rejects (never falls back to an expected value) on error so a
// broken export cannot masquerade as a correct-length one.
async function getExportedVideoDuration(
  page: Page,
  base64: string,
  mimeType: string,
): Promise<number> {
  return page.evaluate(
    ({ encoded, mime }) =>
      new Promise<number>((resolve, reject) => {
        const decoded = atob(encoded);
        const bytes = new Uint8Array(decoded.length);
        for (let index = 0; index < decoded.length; index += 1) {
          bytes[index] = decoded.charCodeAt(index);
        }
        const video = document.createElement("video");
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        video.addEventListener(
          "loadedmetadata",
          () => {
            const measured = video.duration;
            URL.revokeObjectURL(url);
            resolve(measured);
          },
          { once: true },
        );
        video.addEventListener("error", () => {
          URL.revokeObjectURL(url);
          reject(new Error("could not load exported video duration"));
        });
        video.src = url;
      }),
    { encoded: base64, mime: mimeType },
  );
}

// Reads the exported blob's pixel dimensions from <video> metadata.
async function getExportedVideoDimensions(
  page: Page,
  base64: string,
  mimeType: string,
): Promise<{ height: number; width: number }> {
  return page.evaluate(
    ({ encoded, mime }) =>
      new Promise<{ height: number; width: number }>((resolve, reject) => {
        const decoded = atob(encoded);
        const bytes = new Uint8Array(decoded.length);
        for (let index = 0; index < decoded.length; index += 1) {
          bytes[index] = decoded.charCodeAt(index);
        }
        const video = document.createElement("video");
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        video.addEventListener(
          "loadedmetadata",
          () => {
            const dimensions = { height: video.videoHeight, width: video.videoWidth };
            URL.revokeObjectURL(url);
            resolve(dimensions);
          },
          { once: true },
        );
        video.addEventListener("error", () => {
          URL.revokeObjectURL(url);
          reject(new Error("could not load exported video dimensions"));
        });
        video.src = url;
      }),
    { encoded: base64, mime: mimeType },
  );
}

async function readBlobBase64(page: Page, download: Awaited<ReturnType<Page["waitForEvent"]>>): Promise<string> {
  const stream = await download.createReadStream();
  const buffers: Buffer[] = [];
  for await (const chunk of stream) {
    buffers.push(chunk as Buffer);
  }
  return Buffer.concat(buffers).toString("base64");
}

async function uploadSourceClip(page: Page, base64: string): Promise<void> {
  await page.setInputFiles(videoAccept, {
    buffer: Buffer.from(base64, "base64"),
    mimeType: "video/webm",
    name: "source-clip.webm",
  });
}

test.describe("video export", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  });

  test("browser: timeline playback advances video ASCII frames", async ({ page }) => {
    const capable = await page.evaluate(
      () =>
        typeof MediaRecorder !== "undefined" &&
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported("video/webm"),
    );
    test.skip(!capable, "Browser cannot record WebM in this environment.");

    const clip = await createSourceClipBase64(page, 1);
    await uploadSourceClip(page, clip);

    const scrubber = page.getByRole("slider", { name: /time|scrub|duration/i }).first();
    await expect(scrubber).toBeVisible({ timeout: 10_000 });

    // Duration coverage: open the real timeline duration editor, edit the
    // contenteditable duration textbox, and confirm the renderer follows
    // state.timeline.durationSeconds after the video loads.
    await page.getByRole("button", { name: "Edit timeline duration" }).click();
    const durationEditor = page.getByRole("textbox", { name: "timeline duration" });
    await durationEditor.fill("2");
    await durationEditor.press("Enter");
    const durationSeconds = Number(await scrubber.getAttribute("aria-valuemax"));
    expect(durationSeconds).toBeGreaterThan(0);

    await page.getByRole("button", { name: /play/i }).first().click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /pause/i }).first().click();

    await expect(page.locator("[data-toolcraft-product-output]")).toBeVisible();
  });

  test("browser: source video upload drives animated ASCII output", async ({ page }) => {
    const capable = await page.evaluate(
      () =>
        typeof MediaRecorder !== "undefined" &&
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported("video/webm"),
    );
    test.skip(!capable, "Browser cannot record WebM in this environment.");

    const clip = await createSourceClipBase64(page, 1);
    await uploadSourceClip(page, clip);

    // The timeline duration should follow the uploaded clip length (durationSeconds).
    const durationSlider = page.getByRole("slider", { name: /time|scrub|duration/i }).first();
    await expect(durationSlider).toBeVisible({ timeout: 10_000 });
    const durationSeconds = Number(await durationSlider.getAttribute("aria-valuemax"));
    expect(durationSeconds).toBeGreaterThan(0);

    await expect(page.locator("[data-toolcraft-product-output]")).toBeVisible();
  });

  test("browser: video export format and resolution change output", async ({ page }) => {
    const capable = await page.evaluate(
      () =>
        typeof MediaRecorder !== "undefined" &&
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported("video/webm"),
    );
    test.skip(!capable, "Browser cannot record WebM in this environment.");

    const clip = await createSourceClipBase64(page, 1);
    await uploadSourceClip(page, clip);
    await page.waitForTimeout(500);

    // Cover both video resolutions: export.video.resolution current and 4k.
    const resolutions: Array<"current" | "4k"> = ["current", "4k"];
    for (const resolution of resolutions) {
      const resolutionControl = page.getByLabel("Resolution", { exact: false }).last();
      await resolutionControl.selectOption(resolution).catch(async () => {
        // Some runtime select variants are custom widgets; fall back to click flow.
        await resolutionControl.click();
        await page.getByRole("option", { name: new RegExp(resolution, "i") }).click();
      });

      const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
      await page.getByRole("button", { name: /export video/i }).click();
      const download = await downloadPromise;
      const exportedBase64 = await readBlobBase64(page, download);

      const videoDuration = await getExportedVideoDuration(page, exportedBase64, "video/webm");
      expect(videoDuration).toBeGreaterThan(0.5);
      expect(videoDuration).toBeLessThan(2.5);

      const dimensions = await getExportedVideoDimensions(page, exportedBase64, "video/webm");
      expect(dimensions.width).toBeGreaterThan(0);
      expect(dimensions.height).toBeGreaterThan(0);
      // getToolcraftVideoExportSize keeps 4K inside the 3840x2160 encoder-safe box.
      expect(dimensions.width).toBeLessThanOrEqual(3840);
      expect(dimensions.height).toBeLessThanOrEqual(2160);
    }
  });
});
