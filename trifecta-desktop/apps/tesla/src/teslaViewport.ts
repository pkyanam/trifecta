const TESLA_KEYBOARD_OCCLUSION_RATIO = 0.48;

function syncTeslaViewportMetrics(): void {
  const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
  const visibleHeight = window.visualViewport?.height ?? layoutHeight;
  const detectedKeyboardInset = Math.max(0, layoutHeight - visibleHeight);
  const conservativeKeyboardInset = layoutHeight * TESLA_KEYBOARD_OCCLUSION_RATIO;

  document.documentElement.style.setProperty("--tesla-layout-height", `${layoutHeight}px`);
  document.documentElement.style.setProperty(
    "--tesla-keyboard-safe-offset",
    `${Math.max(detectedKeyboardInset, conservativeKeyboardInset)}px`,
  );
}

export function startTeslaViewportSync(): void {
  syncTeslaViewportMetrics();
  window.addEventListener("resize", syncTeslaViewportMetrics);
  window.visualViewport?.addEventListener("resize", syncTeslaViewportMetrics);
}
