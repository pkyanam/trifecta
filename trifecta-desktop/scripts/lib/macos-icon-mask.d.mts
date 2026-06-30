// Type declarations for the pure-Node squircle mask module.
// The implementation lives in macos-icon-mask.mjs (plain ESM, runnable by node
// without a TypeScript loader); these declarations let tsc type-check imports.

/**
 * Build a single-channel squircle alpha mask buffer of the given size.
 * Pixels inside the squircle are 255, outside are 0.
 */
export function macosSquircleAlphaMask(size?: number): Buffer;

/**
 * Apply the macOS squircle alpha mask to a square source PNG and write the
 * result as an RGBA PNG at `outputPath`. The source is resized to `size`x`size`
 * (lanczos) and the existing alpha channel is replaced by the squircle mask.
 */
export function applyMacMask(sourcePng: string, outputPath: string, size?: number): Promise<void>;
