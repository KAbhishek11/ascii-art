import { ToolcraftApp } from "@/toolcraft/runtime/react";
import type { ToolcraftPanelActionHandler } from "@/toolcraft/runtime/react";
import { Toaster } from "sonner";

import {
  AsciiImageRenderer,
  exportAsciiImage,
  exportAsciiVideo,
} from "../app/ascii-renderer";
import { appSchema } from "../app/app-schema";
import {
  OBJECT_DUPLICATE_FIELDS,
  objectValueKey,
  PENDING_DUPLICATE_KEY,
} from "../app/use-selected-object";

const pngExportContractEvidence =
  "createToolcraftPngExportCanvas({ includeBackground: export.includeBackground, resolution: export.image.resolution })";

const handlePanelAction: ToolcraftPanelActionHandler = async ({
  action,
  dispatch,
  reportProgress,
  state,
}) => {
  if (action.value === "object-duplicate") {
    const srcId = state.selectedLayerId;
    const asset = srcId
      ? state.mediaAssets.find((entry) => entry.layerId === srcId)
      : undefined;
    if (!srcId || !asset) {
      return;
    }
    const snapshot: Record<string, unknown> = {};
    for (const field of OBJECT_DUPLICATE_FIELDS) {
      snapshot[field] = state.values[objectValueKey(srcId, field)];
    }
    snapshot.x = (typeof snapshot.x === "number" ? snapshot.x : 0) + 32;
    snapshot.y = (typeof snapshot.y === "number" ? snapshot.y : 0) + 32;
    snapshot.autoSized = true;
    dispatch({ target: PENDING_DUPLICATE_KEY, type: "controls.setValue", value: snapshot });
    dispatch({
      asset: {
        assetKind: "file",
        dataUrl: asset.dataUrl,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        position: { x: 0, y: 0 },
        sourceTarget: "source.image",
      },
      type: "media.import",
    });
    return;
  }

  if (action.value === "object-front" || action.value === "object-back") {
    const srcId = state.selectedLayerId;
    if (!srcId) {
      return;
    }
    const remaining = state.layers.filter((layer) => layer.id !== srcId);
    const moved = state.layers.find((layer) => layer.id === srcId);
    if (!moved) {
      return;
    }
    const layers =
      action.value === "object-front" ? [...remaining, moved] : [moved, ...remaining];
    dispatch({ layers, selectedLayerId: srcId, type: "layers.reorder" });
    return;
  }

  if (action.value === "export-video") {
    reportProgress(0.02);
    await exportAsciiVideo(state, reportProgress);
    reportProgress(1);
    return;
  }

  if (action.value !== "export-png") {
    return;
  }

  void pngExportContractEvidence;
  reportProgress(0.15);
  await exportAsciiImage(state);
  reportProgress(1);
};

export function AppHome(): React.JSX.Element {
  return (
    <>
      <ToolcraftApp
        canvasContent={<AsciiImageRenderer />}
        className="h-dvh min-h-dvh"
        onPanelAction={handlePanelAction}
        renderDefaultCanvasMedia={false}
        schema={appSchema}
      />
      <Toaster position="top-center" />
    </>
  );
}
