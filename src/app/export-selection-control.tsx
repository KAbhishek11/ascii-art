import * as React from "react";

import type { ToolcraftCustomControlRendererProps } from "@/toolcraft/runtime/react";
import { Button, Checkbox } from "@/toolcraft/ui/components/primitives";

import { getObjectLayers } from "./use-selected-object";

function selectedLayerIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function ExportSelectionControl({
  setValue,
  state,
  value,
}: ToolcraftCustomControlRendererProps): React.JSX.Element | null {
  const selected = new Set(selectedLayerIds(value));
  const objects = getObjectLayers(state).flatMap((layer) => {
    const asset = state.mediaAssets.find((candidate) => candidate.layerId === layer.id);
    return asset ? [{ fileName: asset.fileName, layerId: layer.id }] : [];
  });

  if (objects.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2" data-testid="export-selection">
      <div className="flex items-center gap-2">
        <Button
          aria-label="Select all images for export"
          onClick={() => setValue(objects.map((item) => item.layerId))}
          size="sm"
          type="button"
          variant="secondary"
        >
          Select all
        </Button>
        <Button
          aria-label="Clear image export selection"
          onClick={() => setValue([])}
          size="sm"
          type="button"
          variant="ghost"
        >
          Clear
        </Button>
      </div>
      {objects.map(({ fileName, layerId }) => {
        const checked = selected.has(layerId);
        return (
          <label className="flex min-h-6 items-center gap-2" key={layerId}>
            <Checkbox
              aria-label={fileName}
              checked={checked}
              onCheckedChange={(nextChecked) => {
                const next = new Set(selected);
                if (nextChecked === true) {
                  next.add(layerId);
                } else {
                  next.delete(layerId);
                }
                setValue([...next]);
              }}
            />
            <span className="text-sm opacity-90">{fileName}</span>
          </label>
        );
      })}
    </div>
  );
}
