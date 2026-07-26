import * as React from "react";

import {
  createToolcraftPngExportCanvas,
  shouldIncludeToolcraftPreviewBackground,
  type ToolcraftState,
} from "@/toolcraft/runtime";
import { useToolcraft } from "@/toolcraft/runtime/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/toolcraft/ui";

import {
  getObjectGeometry,
  getVisibleObjectLayers,
  objectValueKey,
  useSelectedObjectSync,
} from "./use-selected-object";

const glyphSets: Record<string, string> = {
  blocks: " .-=+#@",
  classic: " .:-=+*#%@",
  fine: " .'`^\",:;Il!i~+_-?][}{1)(|\\/*tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
};

// Canvas monospace glyphs are narrower than their font height. Sampling square
// cells loses horizontal detail and makes the resulting art look stretched.
const MONOSPACE_GLYPH_ASPECT = 0.62;

type Rgb = { b: number; g: number; r: number };

type AsciiRenderSource = HTMLImageElement;

type ObjectAsciiSettings = {
  brightness: number;
  cellSize: number;
  charset: string;
  colorMode: string;
  contrast: number;
  ink: string;
  invert: boolean;
};

function readColor(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "hex" in value) {
    const hex = (value as { hex?: unknown }).hex;
    if (typeof hex === "string") {
      return hex;
    }
  }
  return fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

// Per-object ASCII settings from the flat obj.<layerId>.* value keys.
function getObjectAsciiSettings(state: ToolcraftState, layerId: string): ObjectAsciiSettings {
  const key = (field: string) => state.values[objectValueKey(layerId, field)];
  return {
    brightness: readNumber(key("brightness"), 0),
    cellSize: Math.max(4, readNumber(key("cellSize"), 12)),
    charset: readString(key("charset"), "classic"),
    colorMode: readString(key("colorMode"), "mono"),
    contrast: readNumber(key("contrast"), 1.2),
    ink: readColor(key("ink"), "#f4f1e8"),
    invert: key("invert") === true,
  };
}

function getGlobalBackground(state: ToolcraftState): {
  color: string;
  include: boolean;
} {
  return {
    color: readColor(state.values["appearance.background"], "#101010"),
    include: shouldIncludeToolcraftPreviewBackground({ state }),
  };
}

function getSourceIntrinsicSize(source: AsciiRenderSource): { height: number; width: number } {
  return { height: source.naturalHeight, width: source.naturalWidth };
}

function getLayerAsset(state: ToolcraftState, layerId: string) {
  return state.mediaAssets.find((asset) => asset.layerId === layerId);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the source image."));
    image.src = dataUrl;
  });
}


function getCoverDrawRect(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const scale = Math.max(targetWidth / imageWidth, targetHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    height,
    width,
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
  };
}

// Cover-fit the source into a target rect (no rotation/flip; object placement is
// applied at composite time).
function drawCoverSource(
  context: CanvasRenderingContext2D,
  source: AsciiRenderSource,
  width: number,
  height: number,
): void {
  const intrinsic = getSourceIntrinsicSize(source);
  if (intrinsic.width <= 0 || intrinsic.height <= 0) {
    return;
  }
  const rect = getCoverDrawRect(intrinsic.width, intrinsic.height, width, height);
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
}

function drawCoverSourceIntoGrid(
  context: CanvasRenderingContext2D,
  source: AsciiRenderSource,
  outputWidth: number,
  outputHeight: number,
  columns: number,
  rows: number,
): void {
  const intrinsic = getSourceIntrinsicSize(source);
  if (intrinsic.width <= 0 || intrinsic.height <= 0 || outputWidth <= 0 || outputHeight <= 0) {
    return;
  }
  const rect = getCoverDrawRect(intrinsic.width, intrinsic.height, outputWidth, outputHeight);
  context.drawImage(
    source,
    (rect.x / outputWidth) * columns,
    (rect.y / outputHeight) * rows,
    (rect.width / outputWidth) * columns,
    (rect.height / outputHeight) * rows,
  );
}

export function getAsciiGrid(width: number, height: number, cellSize: number) {
  const cellHeight = Math.max(1, cellSize);
  const fontSize = Math.max(1, Math.round(cellHeight * 1.08));
  const cellWidth = fontSize * MONOSPACE_GLYPH_ASPECT;
  return {
    cellHeight,
    cellWidth,
    columns: Math.max(1, Math.ceil(width / cellWidth)),
    fontSize,
    rows: Math.max(1, Math.ceil(height / cellHeight)),
  };
}

function mapToneToGlyph(tone: number, settings: ObjectAsciiSettings): string {
  const glyphs = glyphSets[settings.charset] ?? glyphSets.classic;
  const normalized = Math.min(
    1,
    Math.max(0, (tone - 0.5) * settings.contrast + 0.5 + settings.brightness / 100),
  );
  const value = settings.invert ? 1 - normalized : normalized;
  const index = Math.min(glyphs.length - 1, Math.max(0, Math.round(value * (glyphs.length - 1))));
  return glyphs[index] ?? " ";
}

function rgbFromCell(data: Uint8Array | Uint8ClampedArray, width: number, x: number, y: number): Rgb {
  const offset = (y * width + x) * 4;
  return {
    b: data[offset + 2] ?? 0,
    g: data[offset + 1] ?? 0,
    r: data[offset] ?? 0,
  };
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Could not create WebGL shader.");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Could not compile WebGL shader.");
  }
  return shader;
}

// A single WebGL context is reused across every object and frame to avoid
// exhausting the browser's context limit.
type WebGlSampler = {
  buffer: WebGLBuffer;
  gl: WebGLRenderingContext;
  glCanvas: HTMLCanvasElement;
  positionLocation: number;
  program: WebGLProgram;
  source: HTMLCanvasElement;
  sourceContext: CanvasRenderingContext2D;
  texture: WebGLTexture;
  uvLocation: number;
};

let sharedWebGlSampler: WebGlSampler | null = null;

function createWebGlSampler(): WebGlSampler | null {
  if (typeof document === "undefined") {
    return null;
  }
  const source = document.createElement("canvas");
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    return null;
  }
  const glCanvas = document.createElement("canvas");
  const gl = glCanvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true });
  if (!gl) {
    return null;
  }
  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    `
      attribute vec2 position;
      attribute vec2 uv;
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
    `,
  );
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      uniform sampler2D sourceImage;
      varying vec2 vUv;
      void main() { gl_FragColor = texture2D(sourceImage, vUv); }
    `,
  );
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!program || !buffer || !texture) {
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, -1, 1, 0, 0, 1, -1, 1, 1, 1, 1, 1, 0]),
    gl.STATIC_DRAW,
  );
  const positionLocation = gl.getAttribLocation(program, "position");
  const uvLocation = gl.getAttribLocation(program, "uv");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uvLocation);
  gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  return {
    buffer,
    gl,
    glCanvas,
    positionLocation,
    program,
    source,
    sourceContext,
    texture,
    uvLocation,
  };
}

function getWebGlSampler(): WebGlSampler | null {
  if (sharedWebGlSampler && !sharedWebGlSampler.gl.isContextLost()) {
    return sharedWebGlSampler;
  }
  sharedWebGlSampler = createWebGlSampler();
  return sharedWebGlSampler;
}

function sampleCellsWithCanvas2d(
  source: AsciiRenderSource,
  columns: number,
  rows: number,
  outputWidth: number,
  outputHeight: number,
): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return new Uint8Array(columns * rows * 4);
  }
  drawCoverSourceIntoGrid(context, source, outputWidth, outputHeight, columns, rows);
  const readImageData = Reflect.get(context, "getImageData") as CanvasRenderingContext2D["getImageData"];
  return new Uint8Array(readImageData.call(context, 0, 0, columns, rows).data);
}

function sampleCells(
  source: AsciiRenderSource,
  columns: number,
  rows: number,
  outputWidth: number,
  outputHeight: number,
): Uint8Array {
  const sampler = getWebGlSampler();
  if (!sampler) {
    return sampleCellsWithCanvas2d(source, columns, rows, outputWidth, outputHeight);
  }
  const { gl, glCanvas } = sampler;
  sampler.source.width = columns;
  sampler.source.height = rows;
  sampler.sourceContext.clearRect(0, 0, columns, rows);
  drawCoverSourceIntoGrid(
    sampler.sourceContext,
    source,
    outputWidth,
    outputHeight,
    columns,
    rows,
  );
  glCanvas.width = columns;
  glCanvas.height = rows;
  gl.useProgram(sampler.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, sampler.buffer);
  gl.enableVertexAttribArray(sampler.positionLocation);
  gl.vertexAttribPointer(sampler.positionLocation, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(sampler.uvLocation);
  gl.vertexAttribPointer(sampler.uvLocation, 2, gl.FLOAT, false, 16, 8);
  gl.bindTexture(gl.TEXTURE_2D, sampler.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sampler.source);
  gl.viewport(0, 0, columns, rows);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const pixels = new Uint8Array(columns * rows * 4);
  gl.readPixels(0, 0, columns, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

// Rasterize one object's ASCII into a transparent offscreen bitmap sized to its
// rect (device px), so the compositor can place/layer it cheaply.
function renderAsciiObjectToBitmap({
  deviceScale,
  height,
  settings,
  source,
  width,
}: {
  deviceScale: number;
  height: number;
  settings: ObjectAsciiSettings;
  source: AsciiRenderSource;
  width: number;
}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * deviceScale));
  canvas.height = Math.max(1, Math.round(height * deviceScale));
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }
  context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);

  const grid = getAsciiGrid(width, height, settings.cellSize);
  const pixels = sampleCells(source, grid.columns, grid.rows, width, height);

  context.font = `${grid.fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const rgb = rgbFromCell(pixels, grid.columns, column, row);
      const tone = (rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722) / 255;
      const glyph = mapToneToGlyph(tone, settings);
      if (glyph === " ") {
        continue;
      }
      context.fillStyle =
        settings.colorMode === "source" ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : settings.ink;
      context.fillText(
        glyph,
        column * grid.cellWidth + grid.cellWidth / 2,
        row * grid.cellHeight + grid.cellHeight / 2,
      );
    }
  }
  return canvas;
}

type BitmapCacheEntry = { bitmap: HTMLCanvasElement; key: string };

function objectBitmapKey(
  settings: ObjectAsciiSettings,
  width: number,
  height: number,
  deviceScale: number,
  frameId: string,
): string {
  return JSON.stringify([
    settings.charset,
    settings.cellSize,
    settings.contrast,
    settings.brightness,
    settings.invert,
    settings.colorMode,
    settings.ink,
    Math.round(width),
    Math.round(height),
    Math.round(deviceScale * 100),
    frameId,
  ]);
}

export type SceneSourceResolver = (layerId: string) => AsciiRenderSource | undefined;

// Composite every visible object's ASCII into a canvas at its placement rect,
// reusing per-object cached bitmaps so only changed objects re-rasterize.
export function compositeAsciiScene({
  cache,
  canvas,
  cssHeight,
  cssWidth,
  deviceScale,
  resolveSource,
  state,
}: {
  cache: Map<string, BitmapCacheEntry>;
  canvas: HTMLCanvasElement;
  cssHeight: number;
  cssWidth: number;
  deviceScale: number;
  resolveSource: SceneSourceResolver;
  state: ToolcraftState;
}): void {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const pixelRatio =
    cssWidth > 0 && cssHeight > 0
      ? Math.max(canvas.width / cssWidth, canvas.height / cssHeight)
      : deviceScale;
  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);

  const background = getGlobalBackground(state);
  if (background.include) {
    context.fillStyle = background.color;
    context.fillRect(0, 0, cssWidth, cssHeight);
  }

  for (const layer of getVisibleObjectLayers(state)) {
    const source = resolveSource(layer.id);
    if (!source) {
      continue;
    }
    const geometry = getObjectGeometry(state, layer.id);
    if (geometry.w <= 0 || geometry.h <= 0) {
      continue;
    }
    const settings = getObjectAsciiSettings(state, layer.id);
    const asset = getLayerAsset(state, layer.id);
    const frameId = `static:${asset?.dataUrl.slice(0, 24) ?? ""}`;
    const key = objectBitmapKey(settings, geometry.w, geometry.h, pixelRatio, frameId);

    let entry = cache.get(layer.id);
    if (!entry || entry.key !== key) {
      entry = {
        bitmap: renderAsciiObjectToBitmap({
          deviceScale: pixelRatio,
          height: geometry.h,
          settings,
          source,
          width: geometry.w,
        }),
        key,
      };
      cache.set(layer.id, entry);
    }

    context.drawImage(entry.bitmap, geometry.x, geometry.y, geometry.w, geometry.h);
  }

  context.restore();
}

function sizeRendererCanvas(
  canvas: HTMLCanvasElement,
  state: ToolcraftState,
  renderScale: number,
): void {
  const ratio = Math.max(1, (window.devicePixelRatio || 1) * renderScale);
  canvas.width = Math.max(1, Math.round(state.canvas.size.width * ratio));
  canvas.height = Math.max(1, Math.round(state.canvas.size.height * ratio));
}

// ---------------------------------------------------------------------------
// Object source manager: decoded still images are cached by media asset id.
// ---------------------------------------------------------------------------

type ObjectSources = {
  resolve: SceneSourceResolver;
  version: number;
};

function useObjectSources(state: ToolcraftState): ObjectSources {
  const imageCacheRef = React.useRef<Map<string, HTMLImageElement>>(new Map());
  const [version, setVersion] = React.useState(0);
  const bump = React.useCallback(() => setVersion((value) => value + 1), []);

  const layers = getVisibleObjectLayers(state);
  const decodeSignature = layers
    .map((layer) => `${layer.id}:${getLayerAsset(state, layer.id)?.dataUrl.slice(0, 16) ?? ""}`)
    .join("|");

  // Decode source images once and reuse them across recomposites.
  React.useEffect(() => {
    let cancelled = false;
    for (const layer of layers) {
      const asset = getLayerAsset(state, layer.id);
      if (!asset) {
        continue;
      }
      if (!imageCacheRef.current.has(asset.id)) {
        void loadImage(asset.dataUrl)
          .then((image) => {
            if (!cancelled) {
              imageCacheRef.current.set(asset.id, image);
              bump();
            }
          })
          .catch(() => undefined);
      }
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump, decodeSignature]);

  // Keep a ref to state for the resolver (called outside render during playback).
  const stateRefForSources = React.useRef(state);
  stateRefForSources.current = state;

  const resolve = React.useCallback<SceneSourceResolver>(
    (layerId) => {
      const asset = getLayerAsset(stateRefForSources.current, layerId);
      if (!asset) {
        return undefined;
      }
      return imageCacheRef.current.get(asset.id);
    },
    [],
  );

  return { resolve, version };
}

// ---------------------------------------------------------------------------
// Renderer component
// ---------------------------------------------------------------------------

const HANDLE_CORNERS = ["nw", "ne", "sw", "se"] as const;
type HandleCorner = (typeof HANDLE_CORNERS)[number];

// Delete/Backspace should never fire object deletion while the user is typing
// into a form field or editing text elsewhere on the page.
function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
}

export function AsciiImageRenderer(): React.JSX.Element {
  const { dispatch, state } = useToolcraft();
  useSelectedObjectSync();

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const cacheRef = React.useRef<Map<string, BitmapCacheEntry>>(new Map());
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const sources = useObjectSources(state);
  const { resolve } = sources;
  const resolveRef = React.useRef(resolve);
  resolveRef.current = resolve;

  const renderScale = readNumber(state.values["canvas.renderScale"], 2);
  const zoom = state.canvas.zoom || 100;
  const visibleLayers = getVisibleObjectLayers(state);
  const selectedLayerId = state.selectedLayerId;
  const exportSelectedLayerIds = new Set(getSelectedExportLayerIds(state));

  // Scene signature — recomposite whenever any input to the canvas changes.
  const sceneSignature = [
    state.canvas.size.width,
    state.canvas.size.height,
    state.values["appearance.background"],
    state.values["export.includeBackground"],
    renderScale,
    sources.version,
    visibleLayers
      .map((layer) => {
        const g = getObjectGeometry(state, layer.id);
        const s = getObjectAsciiSettings(state, layer.id);
        return `${layer.id}:${g.x},${g.y},${g.w},${g.h}:${JSON.stringify(s)}`;
      })
      .join(";"),
  ]
    .map((value) => JSON.stringify(value ?? null))
    .join("|");

  const recompositeRef = React.useRef<() => void>(() => undefined);
  recompositeRef.current = () => {
    const canvas = canvasRef.current;
    const current = stateRef.current;
    if (!canvas) {
      return;
    }
    sizeRendererCanvas(canvas, current, readNumber(current.values["canvas.renderScale"], 2));
    compositeAsciiScene({
      cache: cacheRef.current,
      canvas,
      cssHeight: current.canvas.size.height,
      cssWidth: current.canvas.size.width,
      deviceScale: Math.max(1, (window.devicePixelRatio || 1) * readNumber(current.values["canvas.renderScale"], 2)),
      resolveSource: resolveRef.current,
      state: current,
    });
  };

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => recompositeRef.current());
    return () => cancelAnimationFrame(frame);
  }, [sceneSignature]);

  // Aspect-correct sizing: once a source decodes, fit the object's rect to the
  // source's real aspect ratio (inside 640x360), once per object and never over a
  // user resize. File uploads carry no intrinsic size, so this runs after decode.
  const objectIdsSignature = visibleLayers.map((layer) => layer.id).join("|");
  React.useEffect(() => {
    const current = stateRef.current;
    for (const layer of getVisibleObjectLayers(current)) {
      if (current.values[objectValueKey(layer.id, "autoSized")] === true) {
        continue;
      }
      const source = resolveRef.current(layer.id);
      if (!source) {
        continue;
      }
      const { height: ih, width: iw } = getSourceIntrinsicSize(source);
      if (iw <= 0 || ih <= 0) {
        continue;
      }
      const fit = Math.min(640 / iw, 360 / ih, 1);
      const w = Math.max(80, Math.round(iw * fit));
      const h = Math.max(80, Math.round(ih * fit));
      const g = getObjectGeometry(current, layer.id);
      const cx = g.x + g.w / 2;
      const cy = g.y + g.h / 2;
      const set = (field: string, value: number) =>
        dispatch({ target: objectValueKey(layer.id, field), type: "controls.setValue", value });
      set("w", w);
      set("h", h);
      set("x", Math.round(cx - w / 2));
      set("y", Math.round(cy - h / 2));
      dispatch({ target: objectValueKey(layer.id, "autoSized"), type: "controls.setValue", value: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, objectIdsSignature, sources.version]);

  // --- Interaction: select, move, resize + snap guides -------------

  const [guides, setGuides] = React.useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const guidesRef = React.useRef(guides);
  guidesRef.current = guides;

  const dragStateRef = React.useRef<
    | {
        corner: HandleCorner | null;
        layerId: string;
        mode: "move" | "resize";
        others: { h: number; w: number; x: number; y: number }[];
        pointerId: number;
        prevRenderScale: number;
        startGeom: { h: number; w: number; x: number; y: number };
        startX: number;
        startY: number;
      }
    | null
  >(null);
  const dragFrameRef = React.useRef(0);

  const scaleForPointer = () => zoom / 100;

  const collectOtherRects = (layerId: string) =>
    getVisibleObjectLayers(stateRef.current)
      .filter((layer) => layer.id !== layerId)
      .map((layer) => {
        const g = getObjectGeometry(stateRef.current, layer.id);
        return { h: g.h, w: g.w, x: g.x, y: g.y };
      });

  const beginMove = (layerId: string) => (event: React.PointerEvent) => {
    event.stopPropagation();
    if (event.shiftKey) {
      event.preventDefault();
      const nextSelection = new Set(getSelectedExportLayerIds(stateRef.current));
      if (nextSelection.has(layerId)) {
        nextSelection.delete(layerId);
      } else {
        nextSelection.add(layerId);
      }
      dispatch({ target: "export.selection", type: "controls.setValue", value: [...nextSelection] });
      dispatch({ layerId, type: "layers.select" });
      return;
    }
    if (state.selectedLayerId !== layerId) {
      dispatch({ layerId, type: "layers.select" });
    }
    const geom = getObjectGeometry(stateRef.current, layerId);
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      corner: null,
      layerId,
      mode: "move",
      others: collectOtherRects(layerId),
      pointerId: event.pointerId,
      prevRenderScale: readNumber(stateRef.current.values["canvas.renderScale"], 2),
      startGeom: { h: geom.h, w: geom.w, x: geom.x, y: geom.y },
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const beginResize = (layerId: string, corner: HandleCorner) => (event: React.PointerEvent) => {
    event.stopPropagation();
    if (state.selectedLayerId !== layerId) {
      dispatch({ layerId, type: "layers.select" });
    }
    const geom = getObjectGeometry(stateRef.current, layerId);
    const prevRenderScale = readNumber(stateRef.current.values["canvas.renderScale"], 2);
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dispatch({ target: "canvas.renderScale", type: "controls.setValue", value: 1 });
    dragStateRef.current = {
      corner,
      layerId,
      mode: "resize",
      others: [],
      pointerId: event.pointerId,
      prevRenderScale,
      startGeom: { h: geom.h, w: geom.w, x: geom.x, y: geom.y },
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const snapMove = (
    x: number,
    y: number,
    w: number,
    h: number,
    others: { h: number; w: number; x: number; y: number }[],
  ): { guideX: number | null; guideY: number | null; x: number; y: number } => {
    const threshold = 8;
    const canvasW = stateRef.current.canvas.size.width;
    const canvasH = stateRef.current.canvas.size.height;
    const targetsX = [0, canvasW / 2, canvasW];
    const targetsY = [0, canvasH / 2, canvasH];
    for (const o of others) {
      targetsX.push(o.x, o.x + o.w / 2, o.x + o.w);
      targetsY.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    const solve = (
      anchors: number[],
      targets: number[],
    ): { delta: number; guide: number } | null => {
      let best: { delta: number; guide: number } | null = null;
      for (const anchor of anchors) {
        for (const target of targets) {
          const delta = target - anchor;
          if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
            best = { delta, guide: target };
          }
        }
      }
      return best;
    };
    const sx = solve([x, x + w / 2, x + w], targetsX);
    const sy = solve([y, y + h / 2, y + h], targetsY);
    return {
      guideX: sx ? sx.guide : null,
      guideY: sy ? sy.guide : null,
      x: sx ? Math.round(x + sx.delta) : Math.round(x),
      y: sy ? Math.round(y + sy.delta) : Math.round(y),
    };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    const scale = scaleForPointer();
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    const shift = event.shiftKey;
    const setValue = (field: string, value: number) =>
      dispatch({ target: objectValueKey(drag.layerId, field), type: "controls.setValue", value });

    if (dragFrameRef.current) {
      cancelAnimationFrame(dragFrameRef.current);
    }
    dragFrameRef.current = requestAnimationFrame(() => {
      if (drag.mode === "move") {
        const snapped = snapMove(
          drag.startGeom.x + dx,
          drag.startGeom.y + dy,
          drag.startGeom.w,
          drag.startGeom.h,
          drag.others,
        );
        setValue("x", snapped.x);
        setValue("y", snapped.y);
        const nextGuides = { x: snapped.guideX, y: snapped.guideY };
        if (guidesRef.current.x !== nextGuides.x || guidesRef.current.y !== nextGuides.y) {
          setGuides(nextGuides);
        }
        return;
      }

      // resize
      const min = 40;
      const ratio = drag.startGeom.w / Math.max(1, drag.startGeom.h);
      let { h, w, x, y } = drag.startGeom;
      let freeW: number;
      let freeH: number;
      if (drag.corner === "se") {
        freeW = drag.startGeom.w + dx;
        freeH = drag.startGeom.h + dy;
      } else if (drag.corner === "sw") {
        freeW = drag.startGeom.w - dx;
        freeH = drag.startGeom.h + dy;
      } else if (drag.corner === "ne") {
        freeW = drag.startGeom.w + dx;
        freeH = drag.startGeom.h - dy;
      } else {
        freeW = drag.startGeom.w - dx;
        freeH = drag.startGeom.h - dy;
      }
      freeW = Math.max(min, freeW);
      freeH = Math.max(min, freeH);
      if (shift) {
        // Shift = free (non-locked) resize.
        w = freeW;
        h = freeH;
      } else {
        // Default = aspect-locked: scale uniformly to cover the drag.
        const s = Math.max(freeW / drag.startGeom.w, freeH / drag.startGeom.h);
        w = Math.max(min, drag.startGeom.w * s);
        h = Math.max(min, ratio > 0 ? w / ratio : drag.startGeom.h * s);
      }
      // Keep the corner opposite the dragged one anchored.
      const isRight = drag.corner === "ne" || drag.corner === "se";
      const isBottom = drag.corner === "sw" || drag.corner === "se";
      x = isRight ? drag.startGeom.x : drag.startGeom.x + (drag.startGeom.w - w);
      y = isBottom ? drag.startGeom.y : drag.startGeom.y + (drag.startGeom.h - h);
      setValue("x", Math.round(x));
      setValue("y", Math.round(y));
      setValue("w", Math.round(w));
      setValue("h", Math.round(h));
    });
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    if (drag.mode === "resize") {
      dispatch({ target: "canvas.renderScale", type: "controls.setValue", value: drag.prevRenderScale });
    }
    if (drag.mode === "move" && (guidesRef.current.x !== null || guidesRef.current.y !== null)) {
      setGuides({ x: null, y: null });
    }
    dragStateRef.current = null;
  };

  const selectedGeom = selectedLayerId ? getObjectGeometry(state, selectedLayerId) : null;
  const selectedIsObject = visibleLayers.some((layer) => layer.id === selectedLayerId);

  // Delete key -> confirm -> remove the selected object from the canvas. Holds the
  // layer id pending confirmation (null when the dialog is closed).
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const pendingDeleteIdRef = React.useRef(pendingDeleteId);
  pendingDeleteIdRef.current = pendingDeleteId;

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      if (pendingDeleteIdRef.current !== null || isEditableEventTarget(event.target)) {
        return;
      }
      const current = stateRef.current;
      const id = current.selectedLayerId;
      if (!id || !getVisibleObjectLayers(current).some((layer) => layer.id === id)) {
        return;
      }
      event.preventDefault();
      setPendingDeleteId(id);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const pendingDeleteAsset = pendingDeleteId ? getLayerAsset(state, pendingDeleteId) : undefined;

  const confirmDelete = (): void => {
    const id = pendingDeleteIdRef.current;
    if (id) {
      dispatch({ layerId: id, type: "layers.delete" });
    }
    setPendingDeleteId(null);
  };

  return (
    <div className="absolute inset-0" style={{ height: state.canvas.size.height, width: state.canvas.size.width }}>
      <canvas
        aria-label="ASCII canvas output"
        className="absolute inset-0 h-full w-full"
        data-toolcraft-product-output
        data-toolcraft-renderer-layer="ascii-product"
        ref={canvasRef}
        style={{ height: state.canvas.size.height, width: state.canvas.size.width }}
      />

      {/* Subtle artboard edge so the fixed canvas bounds are visible. Preview-only
          affordance: a textless, non-interactive DOM overlay that never draws into
          the export canvas. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        data-toolcraft-canvas-artboard-edge
        style={{
          border: "1px solid color-mix(in oklab, var(--foreground) 26%, transparent)",
        }}
      />

      {/* Per-object hit areas (bottom-to-top z-order) for click-to-select. */}
      {visibleLayers.map((layer, index) => {
        const g = getObjectGeometry(state, layer.id);
        return (
          <div
            data-object-hit={layer.id}
            key={layer.id}
            onPointerDown={beginMove(layer.id)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              cursor: "move",
              height: g.h,
              left: g.x,
              position: "absolute",
              top: g.y,
              width: g.w,
              zIndex: index + 1,
            }}
          />
        );
      })}

      {visibleLayers
        .filter((layer) => exportSelectedLayerIds.has(layer.id) && layer.id !== selectedLayerId)
        .map((layer) => {
          const g = getObjectGeometry(state, layer.id);
          return (
            <div
              aria-hidden="true"
              data-export-selected={layer.id}
              key={`export-selected-${layer.id}`}
              style={{
                border: "1.5px dashed color-mix(in oklab, var(--link) 72%, transparent)",
                height: g.h,
                left: g.x,
                pointerEvents: "none",
                position: "absolute",
                top: g.y,
                width: g.w,
                zIndex: 999,
              }}
            />
          );
        })}

      {/* Selection outline + handles for the selected object. */}
      {selectedGeom && selectedIsObject ? (
        <div
          style={{
            height: selectedGeom.h,
            left: selectedGeom.x,
            pointerEvents: "none",
            position: "absolute",
            top: selectedGeom.y,
            width: selectedGeom.w,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              border: "1.5px solid color-mix(in oklab, var(--link) 70%, transparent)",
              inset: 0,
              position: "absolute",
            }}
          />
          <div
            data-testid="canvas-object-move"
            data-toolcraft-canvas-handle
            onPointerDown={beginMove(selectedLayerId as string)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              background: "color-mix(in oklab, var(--link) 80%, transparent)",
              borderRadius: 8,
              cursor: "move",
              height: 14,
              left: selectedGeom.w / 2 - 7,
              pointerEvents: "auto",
              position: "absolute",
              top: selectedGeom.h / 2 - 7,
              width: 14,
            }}
          />
          {HANDLE_CORNERS.map((corner) => {
            const isRight = corner === "ne" || corner === "se";
            const isBottom = corner === "sw" || corner === "se";
            return (
              <div
                data-testid={`canvas-object-resize-${corner}`}
                data-toolcraft-canvas-handle
                key={corner}
                onPointerDown={beginResize(selectedLayerId as string, corner)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{
                  background: "var(--background)",
                  border: "1.5px solid color-mix(in oklab, var(--link) 80%, transparent)",
                  borderRadius: 2,
                  cursor: `${isBottom ? "s" : "n"}${isRight ? "e" : "w"}-resize`,
                  height: 10,
                  left: isRight ? selectedGeom.w - 5 : -5,
                  pointerEvents: "auto",
                  position: "absolute",
                  top: isBottom ? selectedGeom.h - 5 : -5,
                  width: 10,
                }}
              />
            );
          })}
        </div>
      ) : null}

      {/* Snap/alignment guide lines while moving (textless overlays). */}
      {guides.x !== null ? (
        <div
          data-testid="canvas-guide-x"
          style={{
            background: "color-mix(in oklab, var(--link) 70%, transparent)",
            height: state.canvas.size.height,
            left: guides.x,
            pointerEvents: "none",
            position: "absolute",
            top: 0,
            width: 1,
            zIndex: 1100,
          }}
        />
      ) : null}
      {guides.y !== null ? (
        <div
          data-testid="canvas-guide-y"
          style={{
            background: "color-mix(in oklab, var(--link) 70%, transparent)",
            height: 1,
            left: 0,
            pointerEvents: "none",
            position: "absolute",
            top: guides.y,
            width: state.canvas.size.width,
            zIndex: 1100,
          }}
        />
      ) : null}

      {/* Confirm before removing the selected object from the canvas. */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this object?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteAsset
                ? `“${pendingDeleteAsset.fileName}” will be removed from the canvas.`
                : "This object will be removed from the canvas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="canvas-object-delete-confirm"
              variant="destructive-outline"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

type ResolvedExportSource = { layerId: string; source: AsciiRenderSource };

function getExportLayers(state: ToolcraftState, layerIds: readonly string[]) {
  const wanted = new Set(layerIds);
  return getVisibleObjectLayers(state).filter((layer) => wanted.has(layer.id));
}

export function getSelectedExportLayerIds(state: ToolcraftState): string[] {
  const selected = state.values["export.selection"];
  const available = new Set(getVisibleObjectLayers(state).map((layer) => layer.id));
  const explicitSelection = Array.isArray(selected)
    ? selected.filter((layerId): layerId is string => typeof layerId === "string" && available.has(layerId))
    : [];
  if (explicitSelection.length > 0) {
    return explicitSelection;
  }
  return state.selectedLayerId && available.has(state.selectedLayerId) ? [state.selectedLayerId] : [];
}

export function createSelectedLayerExportState(
  state: ToolcraftState,
  layerId: string,
): ToolcraftState {
  const layer = getVisibleObjectLayers(state).find((item) => item.id === layerId);
  if (!layer) {
    throw new Error("Select a visible image before exporting ASCII output.");
  }

  const geometry = getObjectGeometry(state, layerId);
  const values: Record<string, unknown> = {
    ...state.values,
    [objectValueKey(layerId, "h")]: geometry.h,
    [objectValueKey(layerId, "w")]: geometry.w,
    [objectValueKey(layerId, "x")]: 0,
    [objectValueKey(layerId, "y")]: 0,
  };

  return {
    ...state,
    canvas: {
      ...state.canvas,
      size: { ...state.canvas.size, height: geometry.h, width: geometry.w },
    },
    layers: state.layers.filter((item) => item.id === layerId),
    mediaAssets: state.mediaAssets.filter((asset) => asset.layerId === layerId),
    values,
  };
}

async function resolveExportSources(
  state: ToolcraftState,
  layerIds: readonly string[],
): Promise<Map<string, AsciiRenderSource>> {
  const map = new Map<string, AsciiRenderSource>();
  const entries = await Promise.all(
    getExportLayers(state, layerIds).map(async (layer): Promise<ResolvedExportSource | null> => {
      const asset = getLayerAsset(state, layer.id);
      if (!asset) {
        return null;
      }
      const image = await loadImage(asset.dataUrl);
      return { layerId: layer.id, source: image };
    }),
  );
  for (const entry of entries) {
    if (entry) {
      map.set(entry.layerId, entry.source);
    }
  }
  return map;
}

export async function createAsciiExportCanvas(
  state: ToolcraftState,
  layerIds = getSelectedExportLayerIds(state),
): Promise<HTMLCanvasElement> {
  const exportLayers = getExportLayers(state, layerIds);
  if (exportLayers.length !== 1) {
    throw new Error("Export exactly one visible image at a time.");
  }
  const layerId = exportLayers[0]!.id;
  const exportState = createSelectedLayerExportState(state, layerId);
  const sources = await resolveExportSources(state, [layerId]);
  const background = readColor(state.values["appearance.background"], "#101010");
  const includeBackground = state.values["export.includeBackground"] !== false;

  return createToolcraftPngExportCanvas({
    background,
    includeBackground,
    resolution: readString(state.values["export.image.resolution"], "4k"),
    state: exportState,
    render({ canvas, cssHeight, cssWidth }) {
      const cache = new Map<string, BitmapCacheEntry>();
      compositeAsciiScene({
        cache,
        canvas,
        cssHeight,
        cssWidth,
        deviceScale: 1,
        resolveSource: (layerId) => sources.get(layerId),
        state: exportState,
      });
    },
  });
}

function getExportFileStem(state: ToolcraftState, layerId: string, index: number): string {
  const sourceName = getLayerAsset(state, layerId)?.fileName ?? `image-${index + 1}`;
  const withoutExtension = sourceName.replace(/\.[^.]+$/, "");
  const safeName = withoutExtension.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return safeName || `image-${index + 1}`;
}

async function downloadAsciiCanvas(
  canvas: HTMLCanvasElement,
  format: string,
  fileStem: string,
): Promise<void> {
  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
  const extension = format === "jpg" ? "jpg" : "png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
          return;
        }
        reject(new Error("Could not encode the ASCII export."));
      },
      mimeType,
      format === "jpg" ? 0.92 : undefined,
    );
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ascii-${fileStem}.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportAsciiImages(
  state: ToolcraftState,
  reportProgress?: (progress: number) => void,
): Promise<void> {
  const layerIds = getSelectedExportLayerIds(state);
  if (layerIds.length === 0) {
    throw new Error("Select at least one visible image before exporting ASCII output.");
  }

  const format = readString(state.values["export.image.format"], "png");
  for (const [index, layerId] of layerIds.entries()) {
    reportProgress?.(index / layerIds.length);
    const canvas = await createAsciiExportCanvas(state, [layerId]);
    await downloadAsciiCanvas(canvas, format, getExportFileStem(state, layerId, index));
    reportProgress?.((index + 1) / layerIds.length);
  }
}
