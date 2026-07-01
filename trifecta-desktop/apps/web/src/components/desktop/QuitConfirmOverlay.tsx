import { useEffect, useRef, useState } from "react";

import { Kbd, KbdGroup } from "../ui/kbd";
import { isMacPlatform } from "~/lib/utils";

const QUIT_CONFIRM_VISIBLE_DURATION_MS = 2500;

/**
 * Displays a small overlay prompting the user to press Cmd/Ctrl+Q again to
 * confirm quitting. The overlay is shown when the main process sends a "quit"
 * menu action (the first Cmd+Q press). The second press quits the app directly
 * from the main process, so this component only needs to render the prompt and
 * auto-dismiss after a short window.
 */
export function QuitConfirmOverlay() {
  const [visible, setVisible] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);
  const isMac = typeof navigator !== "undefined" && isMacPlatform(navigator.platform);

  useEffect(() => {
    const bridge = window.desktopBridge;
    if (!bridge?.onMenuAction) {
      return;
    }

    return bridge.onMenuAction((action) => {
      if (action !== "quit") {
        return;
      }
      setVisible(true);
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
      dismissTimerRef.current = window.setTimeout(
        () => setVisible(false),
        QUIT_CONFIRM_VISIBLE_DURATION_MS,
      );
    });
  }, []);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]"
      role="presentation"
    >
      <div
        className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border bg-popover p-6 text-center text-popover-foreground shadow-lg/5"
        role="dialog"
        aria-live="polite"
      >
        <p className="text-sm font-medium text-foreground">Press again to quit</p>
        <KbdGroup className="text-lg">
          <Kbd className="size-7 text-sm">{isMac ? "\u2318" : "Ctrl"}</Kbd>
          <Kbd className="size-7 text-sm">Q</Kbd>
        </KbdGroup>
        <p className="text-xs text-muted-foreground">
          Press {isMac ? "\u2318" : "Ctrl"}+Q again to confirm.
        </p>
      </div>
    </div>
  );
}
