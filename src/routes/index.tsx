import { ToolcraftApp } from "@/toolcraft/runtime/react";
import type { ToolcraftPanelActionHandler } from "@/toolcraft/runtime/react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/toolcraft/ui";
import { InfoIcon } from "@phosphor-icons/react";
import { Toaster } from "sonner";

import {
  AsciiImageRenderer,
  exportAsciiImage,
} from "../app/ascii-renderer";
import { appSchema } from "../app/app-schema";

const pngExportContractEvidence =
  "createToolcraftPngExportCanvas({ includeBackground: export.includeBackground, resolution: export.image.resolution })";

const handlePanelAction: ToolcraftPanelActionHandler = async ({ action, reportProgress, state }) => {
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
      <main className="desktop-experience-gate">
        <section
          aria-labelledby="desktop-experience-title"
          className="desktop-experience-notice"
        >
          <img
            alt=""
            aria-hidden="true"
            className="desktop-experience-notice__mark"
            src="/favicon.svg"
          />
          <h1 id="desktop-experience-title">Best experienced on desktop</h1>
          <p>
            ASCII Image Tool is designed for a larger screen, where you can edit,
            arrange, and export your work comfortably. Please open it on a desktop
            or laptop to continue.
          </p>
        </section>
        <div className="desktop-experience-workspace">
          <ToolcraftApp
            canvasContent={<AsciiImageRenderer />}
            className="h-dvh min-h-dvh"
            onPanelAction={handlePanelAction}
            renderDefaultCanvasMedia={false}
            schema={appSchema}
          />
          <Tooltip>
            <TooltipTrigger
              delay={0}
              render={
                <Button
                  aria-label="Image upload limit information"
                  className="desktop-experience-upload-help"
                  size="icon"
                  type="button"
                  variant="secondary"
                >
                  <InfoIcon weight="bold" />
                </Button>
              }
            />
            <TooltipContent
              align="end"
              className="desktop-experience-upload-help-tooltip max-w-64 whitespace-normal"
              side="top"
            >
              Upload up to 5 images at once. You can select multiple files or drag them onto
              the canvas; delete an image layer to add another.
            </TooltipContent>
          </Tooltip>
        </div>
      </main>
      <Toaster position="top-center" />
    </>
  );
}
