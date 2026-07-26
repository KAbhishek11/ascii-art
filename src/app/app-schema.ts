import { defineToolcraft } from "@/toolcraft/runtime";

export const starterControlSectionInventory = [
  {
    title: "Source",
    entity: "Uploaded image",
    targets: ["source.image"],
    groupingReason:
      "The Source uploader accepts an image as the source material for the ASCII conversion and owns upload, clear, and reset behavior.",
  },
  {
    title: "Object",
    entity: "Selected object",
    targets: [
      "selectedLayer.charset",
      "selectedLayer.cellSize",
      "selectedLayer.contrast",
      "selectedLayer.brightness",
      "selectedLayer.invert",
      "selectedLayer.colorMode",
      "selectedLayer.ink",
    ],
    groupingReason:
      "These controls own the ASCII settings of the currently selected canvas object, so editing them changes only that object's output.",
  },
  {
    title: "Background",
    entity: "Output background",
    targets: ["export.includeBackground", "appearance.background"],
    groupingReason:
      "The background controls own preview backing visibility and PNG alpha behavior directly before export settings.",
  },
  {
    title: "Image Export",
    workflowStage: "Output delivery",
    targets: ["export.image.format", "export.image.resolution", "export.selection"],
    groupingReason:
      "The selected uploaded images, export format, and resolution determine the separate still-image files delivered by the sticky export action.",
  },
] as const;

export const appSchema = defineToolcraft({
  canvas: {
    enabled: true,
    renderScale: true,
    size: { height: 1440, unit: "px", width: 2560 },
    sizing: { mode: "editable-output" },
    upload: true,
  },
  export: {
    png: {
      background: "include",
    },
  },
  panels: {
    layers: true,
    controls: {
      sections: [
        {
          title: "Source",
          controls: {
            sourceImage: {
              accept: "image/*",
              assetKind: "file",
              defaultValue: [],
              description: "Upload an image to convert it into ASCII art.",
              label: "Image",
              multiple: true,
              performanceReason:
                "Large image uploads drive decode and ASCII sampling for preview and export.",
              performanceRole: "workload",
              target: "source.image",
              type: "fileDrop",
            },
          },
        },
        {
          title: "Object",
          controls: {
            charset: {
              defaultValue: "classic",
              label: "Glyphs",
              options: [
                { label: "Classic", value: "classic" },
                { label: "Blocks", value: "blocks" },
                { label: "Fine", value: "fine" },
              ],
              orderRole: "mode",
              performanceReason:
                "Changing glyph sets re-renders text without re-decoding the source image.",
              performanceRole: "workload",
              target: "selectedLayer.charset",
              type: "select",
            },
            colorMode: {
              defaultValue: "mono",
              label: "Color",
              options: [
                { label: "Mono", value: "mono" },
                { label: "Source", value: "source" },
              ],
              orderRole: "mode",
              performanceReason:
                "Color mode changes whether glyphs use the ink color or sampled source color.",
              performanceRole: "responsiveness",
              target: "selectedLayer.colorMode",
              type: "select",
            },
            invert: {
              defaultValue: false,
              label: "Invert",
              orderRole: "primary",
              performanceReason:
                "Invert changes glyph-tone mapping and should update without viewport jank.",
              performanceRole: "responsiveness",
              target: "selectedLayer.invert",
              type: "switch",
            },
            ink: {
              defaultValue: { hex: "#f4f1e8" },
              label: "Ink",
              orderRole: "color",
              performanceReason:
                "Ink color only changes glyph fill style and should remain responsive.",
              performanceRole: "responsiveness",
              target: "selectedLayer.ink",
              type: "color",
              visibleWhen: {
                target: "selectedLayer.colorMode",
                equals: "mono",
              },
            },
            contrast: {
              defaultValue: 1.2,
              label: "Contrast",
              max: 2.5,
              min: 0.5,
              orderRole: "strength",
              performanceReason:
                "Contrast changes per-cell tone mapping during live slider drags.",
              performanceRole: "workload",
              step: 0.05,
              target: "selectedLayer.contrast",
              type: "slider",
            },
            brightness: {
              defaultValue: 0,
              label: "Brightness",
              max: 50,
              min: -50,
              orderRole: "strength",
              performanceReason:
                "Brightness changes per-cell tone mapping during live slider drags.",
              performanceRole: "workload",
              step: 1,
              target: "selectedLayer.brightness",
              type: "slider",
              unit: "%",
            },
            cellSize: {
              defaultValue: 12,
              description:
                "Smaller cells sample more glyphs and increase preview/export detail.",
              label: "Cell size",
              max: 32,
              min: 6,
              orderRole: "detail",
              performanceReason:
                "Cell size controls the number of sampled glyph cells and is the primary workload control.",
              performanceRole: "workload",
              step: 1,
              target: "selectedLayer.cellSize",
              type: "slider",
              unit: "px",
            },
          },
        },
        {
          title: "Background",
          controls: {
            includeBackground: {
              defaultValue: true,
              label: "Include",
              orderRole: "primary",
              performanceReason:
                "The background switch changes preview compositing and PNG alpha handling.",
              performanceRole: "responsiveness",
              target: "export.includeBackground",
              type: "switch",
            },
            background: {
              defaultValue: { hex: "#101010" },
              label: false,
              orderRole: "color",
              performanceReason:
                "Background color changes preview fill and export compositing.",
              performanceRole: "responsiveness",
              target: "appearance.background",
              type: "color",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["includeBackground", "background"],
              layout: "inline",
            },
          ],
        },
        {
          title: "Image Export",
          controls: {
            imageFormat: {
              defaultValue: "png",
              label: "Format",
              options: [
                { label: "PNG", value: "png" },
                { label: "JPG", value: "jpg" },
              ],
              orderRole: "mode",
              performanceReason:
                "Image format changes the final encoded file type for the export action.",
              performanceRole: "responsiveness",
              target: "export.image.format",
              type: "select",
            },
            imageResolution: {
              defaultValue: "4k",
              label: "Resolution",
              options: [
                { label: "2K", value: "2k" },
                { label: "4K", value: "4k" },
                { label: "8K", value: "8k" },
              ],
              orderRole: "detail",
              performanceReason:
                "Image resolution controls the export canvas pixel dimensions.",
              performanceRole: "workload",
              target: "export.image.resolution",
              type: "select",
            },
            exportSelection: {
              defaultValue: [],
              description: "Choose one or more images. Each downloads at its own bounds with the selected background.",
              label: "Images",
              orderRole: "advanced",
              performanceReason:
                "Selection limits export work to the chosen uploaded image objects without changing the live canvas.",
              performanceRole: "responsiveness",
              target: "export.selection",
              type: "exportSelection",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["imageFormat", "imageResolution"],
              layout: "inline",
            },
          ],
        },
        {
          title: "Export",
          controls: {
            outputActions: {
              actions: [
                {
                  icon: "upload-simple",
                  label: "Export PNG",
                  value: "export-png",
                },
              ],
              target: "actions.output",
              type: "panelActions",
            },
          },
        },
      ],
      title: "ASCII Tool",
    },
  },
  persistence: {
    include: ["values", "canvas", "panels"],
    key: "toolcraft:ascii-image-effect:state:v1",
    storage: "localStorage",
    version: 1,
  },
  toolbar: {
    history: true,
    radar: true,
    theme: true,
    zoom: true,
  },
});
