import type { ReactNode } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";

export type BrowserPanelMode = "inline" | "sheet" | "sidebar";

function getBrowserPanelHeaderRowClassName(mode: BrowserPanelMode) {
  const shouldUseDragRegion = isElectron && mode !== "sheet";
  return cn(
    "flex items-center justify-between gap-2 px-4",
    shouldUseDragRegion
      ? "drag-region h-[52px] border-b border-border wco:h-[env(titlebar-area-height)] wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]"
      : "h-12 wco:max-h-[env(titlebar-area-height)]",
  );
}

export function BrowserPanelShell(props: {
  mode: BrowserPanelMode;
  header: ReactNode;
  children: ReactNode;
}) {
  const shouldUseDragRegion = isElectron && props.mode !== "sheet";

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col bg-background",
        props.mode === "inline"
          ? "w-[42vw] min-w-[360px] max-w-[560px] shrink-0 border-l border-border"
          : "w-full",
      )}
    >
      {shouldUseDragRegion ? (
        <div className={getBrowserPanelHeaderRowClassName(props.mode)}>{props.header}</div>
      ) : (
        <div className="border-b border-border">
          <div className={getBrowserPanelHeaderRowClassName(props.mode)}>{props.header}</div>
        </div>
      )}
      {props.children}
    </div>
  );
}
