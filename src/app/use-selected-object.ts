import * as React from "react";
import { toast } from "sonner";

import type { ToolcraftState } from "@/toolcraft/runtime";
import { useToolcraft } from "@/toolcraft/runtime/react";

// The canvas holds at most this many uploaded image objects at a time.
export const MAX_CANVAS_OBJECTS = 5;
const IMAGE_UPLOAD_LIMIT_MESSAGE = `You can add up to ${MAX_CANVAS_OBJECTS} images. Remove an image layer to upload another.`;

// Per-object state lives in flat namespaced value keys (obj.<layerId>.<field>) so
// it round-trips through the runtime's global values map + persistence without any
// runtime changes. The schema's Object controls read/write constant mirror keys
// (selectedLayer.<field>); this hook keeps the mirror synced to the selected
// object: load object -> mirror on select, write mirror -> object on edit.

export type ObjectField =
  | "charset"
  | "cellSize"
  | "contrast"
  | "brightness"
  | "invert"
  | "colorMode"
  | "ink";

// Panel-synced settings fields (the schema's Object controls).
export const OBJECT_SETTING_FIELDS: readonly ObjectField[] = [
  "charset",
  "cellSize",
  "contrast",
  "brightness",
  "invert",
  "colorMode",
  "ink",
];

export const OBJECT_SETTING_DEFAULTS: Record<ObjectField, unknown> = {
  charset: "classic",
  cellSize: 12,
  contrast: 1.2,
  brightness: 0,
  invert: false,
  colorMode: "mono",
  ink: { hex: "#f4f1e8" },
};

export type ObjectGeometry = {
  h: number;
  w: number;
  x: number;
  y: number;
};

// Geometry fields (edited directly on obj.* by canvas handles, not mirrored).
export const OBJECT_GEOMETRY_FIELDS = ["x", "y", "w", "h"] as const;

// Every per-object field copied when duplicating (geometry + settings + flags).
export const OBJECT_DUPLICATE_FIELDS: readonly string[] = [
  ...OBJECT_GEOMETRY_FIELDS,
  ...OBJECT_SETTING_FIELDS,
  "autoSized",
];

// Transient value key holding the settings snapshot for a pending duplicate; the
// seeding effect applies it to the next new object layer, then clears it.
export const PENDING_DUPLICATE_KEY = "actions.pendingDuplicate";

export function objectValueKey(layerId: string, field: string): string {
  return `obj.${layerId}.${field}`;
}

export function selectedMirrorKey(field: string): string {
  return `selectedLayer.${field}`;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function getLayerAsset(state: ToolcraftState, layerId: string) {
  return state.mediaAssets.find((asset) => asset.layerId === layerId);
}

// Object layers = non-group layers that own a media asset.
export function getObjectLayers(state: ToolcraftState) {
  return state.layers.filter(
    (layer) => layer.kind !== "group" && Boolean(getLayerAsset(state, layer.id)),
  );
}

export function getVisibleObjectLayers(state: ToolcraftState) {
  return getObjectLayers(state).filter((layer) => layer.visible !== false);
}

export function getObjectGeometry(state: ToolcraftState, layerId: string): ObjectGeometry {
  const read = (field: string, fallback: number): number => {
    const value = state.values[objectValueKey(layerId, field)];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };

  return {
    h: read("h", 270),
    w: read("w", 480),
    x: read("x", 0),
    y: read("y", 0),
  };
}

function computeSeedRect(
  assetSize: { height: number; width: number } | undefined,
  canvasSize: { height: number; width: number },
  index: number,
): { h: number; w: number; x: number; y: number } {
  const maxW = 640;
  const maxH = 360;
  let w = 480;
  let h = 270;

  if (assetSize && assetSize.width > 0 && assetSize.height > 0) {
    const scale = Math.min(maxW / assetSize.width, maxH / assetSize.height, 1);
    w = Math.max(80, Math.round(assetSize.width * scale));
    h = Math.max(80, Math.round(assetSize.height * scale));
  }

  const stagger = (index % 6) * 48;
  const x = Math.round((canvasSize.width - w) / 2) + stagger;
  const y = Math.round((canvasSize.height - h) / 2) + stagger;

  return { h, w, x, y };
}

// Keeps the selected object's settings in sync with the Object control panel and
// seeds/auto-selects objects. Returns nothing; drives dispatch side effects only.
export function useSelectedObjectSync(): void {
  const { dispatch, state } = useToolcraft();

  const stateRef = React.useRef(state);
  stateRef.current = state;

  const lastLoadedIdRef = React.useRef<string | null>(null);
  const writeBackSeenIdRef = React.useRef<string | null>(null);
  const snapshotRef = React.useRef<Map<ObjectField, unknown>>(new Map());

  const selectedLayerId = state.selectedLayerId;
  const mirrorSignature = OBJECT_SETTING_FIELDS.map((field) =>
    JSON.stringify(state.values[selectedMirrorKey(field)] ?? null),
  ).join("|");

  // Seed geometry + ASCII defaults for any object layer that has none yet.
  const objectLayerSignature = getObjectLayers(state)
    .map((layer) => layer.id)
    .join("|");

  // The generated runtime owns the uploader and Layers panel. This app-level
  // enhancement keeps those standard surfaces in sync with the object cap
  // without reimplementing either surface.
  React.useEffect(() => {
    const atLimit = getObjectLayers(stateRef.current).length >= MAX_CANVAS_OBJECTS;
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    const uploadSurface = input?.parentElement?.querySelector<HTMLElement>('[role="button"]');
    const layersHeader = document.querySelector<HTMLElement>(
      '[data-toolcraft-layers-panel] [data-slot="layers-panel-header"]',
    );

    if (!input || !uploadSurface || !layersHeader) {
      return;
    }

    const stopUpload = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    input.disabled = atLimit;
    uploadSurface.setAttribute("aria-disabled", String(atLimit));
    uploadSurface.classList.toggle("pointer-events-none", atLimit);
    uploadSurface.classList.toggle("cursor-not-allowed", atLimit);
    uploadSurface.classList.toggle("opacity-45", atLimit);
    layersHeader.toggleAttribute("data-image-upload-limit-reached", atLimit);

    if (atLimit) {
      layersHeader.title = IMAGE_UPLOAD_LIMIT_MESSAGE;
      layersHeader.setAttribute("aria-label", `Layers. ${IMAGE_UPLOAD_LIMIT_MESSAGE}`);
      ["dragenter", "dragover", "drop"].forEach((type) =>
        uploadSurface.addEventListener(type, stopUpload, true),
      );
    } else {
      layersHeader.removeAttribute("title");
      layersHeader.removeAttribute("aria-label");
    }

    return () => {
      ["dragenter", "dragover", "drop"].forEach((type) =>
        uploadSurface.removeEventListener(type, stopUpload, true),
      );
    };
  }, [objectLayerSignature]);

  // Cap the number of objects on the canvas. Uploads and duplicates append via
  // media.import; if that pushes past MAX_CANVAS_OBJECTS, remove the newest
  // overflow (appended last) so the user keeps their existing objects, and tell
  // them to make room instead of silently dropping the upload.
  const overCapNotifiedRef = React.useRef(false);
  React.useEffect(() => {
    const objectLayers = getObjectLayers(stateRef.current);

    if (objectLayers.length <= MAX_CANVAS_OBJECTS) {
      overCapNotifiedRef.current = false;
      return;
    }

    objectLayers.slice(MAX_CANVAS_OBJECTS).forEach((layer) => {
      dispatch({ layerId: layer.id, type: "layers.delete" });
    });

    if (!overCapNotifiedRef.current) {
      overCapNotifiedRef.current = true;
      toast(
        `You can place up to ${MAX_CANVAS_OBJECTS} objects at a time. Remove one to add another.`,
      );
    }
  }, [dispatch, objectLayerSignature]);

  React.useEffect(() => {
    const current = stateRef.current;
    const objectLayers = getObjectLayers(current);
    const unseeded = objectLayers.filter(
      (layer) => current.values[objectValueKey(layer.id, "x")] === undefined,
    );

    if (unseeded.length === 0) {
      return;
    }

    // A pending duplicate snapshot targets the newest unseeded object layer.
    const pending = current.values[PENDING_DUPLICATE_KEY];
    const duplicateSnapshot =
      pending && typeof pending === "object" ? (pending as Record<string, unknown>) : null;
    const duplicateTargetId = duplicateSnapshot ? unseeded[unseeded.length - 1]?.id : undefined;

    unseeded.forEach((layer) => {
      const index = objectLayers.findIndex((entry) => entry.id === layer.id);

      if (duplicateSnapshot && layer.id === duplicateTargetId) {
        OBJECT_DUPLICATE_FIELDS.forEach((field) => {
          if (field in duplicateSnapshot) {
            dispatch({
              target: objectValueKey(layer.id, field),
              type: "controls.setValue",
              value: duplicateSnapshot[field],
            });
          }
        });
        return;
      }

      const asset = getLayerAsset(current, layer.id);
      const rect = computeSeedRect(asset?.size, current.canvas.size, Math.max(0, index));

      dispatch({ target: objectValueKey(layer.id, "x"), type: "controls.setValue", value: rect.x });
      dispatch({ target: objectValueKey(layer.id, "y"), type: "controls.setValue", value: rect.y });
      dispatch({ target: objectValueKey(layer.id, "w"), type: "controls.setValue", value: rect.w });
      dispatch({ target: objectValueKey(layer.id, "h"), type: "controls.setValue", value: rect.h });

      OBJECT_SETTING_FIELDS.forEach((field) => {
        dispatch({
          target: objectValueKey(layer.id, field),
          type: "controls.setValue",
          value: OBJECT_SETTING_DEFAULTS[field],
        });
      });
    });

    if (duplicateSnapshot) {
      dispatch({ target: PENDING_DUPLICATE_KEY, type: "controls.setValue", value: undefined });
    }
  }, [dispatch, objectLayerSignature]);

  // Garbage-collect per-object values whose layer no longer exists so deleted
  // objects do not leave dead weight in persisted state.
  React.useEffect(() => {
    const current = stateRef.current;
    const liveIds = new Set(current.layers.map((layer) => layer.id));
    const orphanKeys = Object.keys(current.values).filter((key) => {
      if (!key.startsWith("obj.")) {
        return false;
      }
      if (current.values[key] === undefined) {
        return false;
      }
      const layerId = key.slice("obj.".length, key.lastIndexOf("."));
      return layerId.length > 0 && !liveIds.has(layerId);
    });

    orphanKeys.forEach((key) => {
      dispatch({ target: key, type: "controls.setValue", value: undefined });
    });
  }, [dispatch, objectLayerSignature]);

  // Ensure a selection exists whenever objects do (avoids disabling the panel,
  // which the acceptance validator forbids).
  React.useEffect(() => {
    const current = stateRef.current;
    const visible = getVisibleObjectLayers(current);

    if (visible.length === 0) {
      return;
    }

    const stillValid = visible.some((layer) => layer.id === current.selectedLayerId);
    if (!stillValid) {
      const topmost = visible[visible.length - 1];
      dispatch({ layerId: topmost.id, type: "layers.select" });
    }
  }, [dispatch, objectLayerSignature, selectedLayerId]);

  // LOAD: on selection change, copy the selected object's stored settings into the
  // mirror keys the Object controls display.
  React.useEffect(() => {
    const current = stateRef.current;
    const id = current.selectedLayerId;

    if (!id || id === lastLoadedIdRef.current) {
      return;
    }

    OBJECT_SETTING_FIELDS.forEach((field) => {
      const stored = current.values[objectValueKey(id, field)];
      const value = stored === undefined ? OBJECT_SETTING_DEFAULTS[field] : stored;

      if (!valuesEqual(current.values[selectedMirrorKey(field)], value)) {
        dispatch({ target: selectedMirrorKey(field), type: "controls.setValue", value });
      }
      snapshotRef.current.set(field, value);
    });

    lastLoadedIdRef.current = id;
  }, [dispatch, selectedLayerId]);

  // WRITE-BACK: when a mirror control changes for the stable selection, persist it
  // to the selected object. Skips the render right after a selection change (the
  // load round) so the previous object's values are never written to the new one.
  React.useEffect(() => {
    const current = stateRef.current;
    const id = current.selectedLayerId;

    if (!id) {
      return;
    }

    if (id !== writeBackSeenIdRef.current) {
      writeBackSeenIdRef.current = id;
      return;
    }

    OBJECT_SETTING_FIELDS.forEach((field) => {
      const mirrorValue = current.values[selectedMirrorKey(field)];
      if (!valuesEqual(mirrorValue, snapshotRef.current.get(field))) {
        dispatch({
          target: objectValueKey(id, field),
          type: "controls.setValue",
          value: mirrorValue,
        });
        snapshotRef.current.set(field, mirrorValue);
      }
    });
  }, [dispatch, selectedLayerId, mirrorSignature]);
}
