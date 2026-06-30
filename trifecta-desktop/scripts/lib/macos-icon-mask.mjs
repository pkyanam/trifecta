// Pure-Node (sharp) implementation of the macOS squircle alpha mask.
//
// Replaces the former scripts/lib/macos-icon-mask.py, which required Pillow to
// be installed on every CI runner. sharp is a direct devDependency and ships
// prebuilt binaries for macOS, Linux, and Windows, so this works on every
// platform without provisioning Python/Pillow.
//
// The mask is a superellipse ("squircle") of the form
//   |x/r|^n + |y/r|^n <= 1
// which matches the shape macOS applies to dock icons. The masked PNG keeps
// rounded corners and consistent sizing when rendered by the OS.

import sharp from "sharp";

const DEFAULT_SIZE = 1024;
const SQUIRCLE_EXPONENT = 5.0;

/**
 * Build a single-channel (L) squircle alpha mask buffer of the given size.
 * Pixels inside the squircle are 255, outside are 0.
 */
export function macosSquircleAlphaMask(size = DEFAULT_SIZE) {
  const mask = Buffer.alloc(size * size);
  const center = (size - 1) / 2;
  const radius = size / 2;
  const exponent = SQUIRCLE_EXPONENT;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = Math.abs(x - center) / radius;
      const ny = Math.abs(y - center) / radius;
      if (Math.pow(nx, exponent) + Math.pow(ny, exponent) <= 1.0) {
        mask[y * size + x] = 255;
      }
    }
  }

  return mask;
}

/**
 * Apply the macOS squircle alpha mask to a square source PNG and write the
 * result as an RGBA PNG at `outputPath`. Mirrors the behavior of the previous
 * Python implementation: the source is resized to `size`x`size` (lanczos) and
 * the existing alpha channel is replaced by the squircle mask.
 */
export async function applyMacMask(sourcePng, outputPath, size = DEFAULT_SIZE) {
  const metadata = await sharp(sourcePng).metadata();
  if (metadata.width !== metadata.height) {
    throw new Error(`Icon must be square, got ${metadata.width}x${metadata.height}`);
  }

  // Drop any existing alpha and resize to the target size, producing raw RGB.
  const rgb = await sharp(sourcePng)
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const mask = macosSquircleAlphaMask(size);

  // Join the single-channel mask as the alpha channel of the RGB image.
  await sharp(rgb, { raw: { width: size, height: size, channels: 3 } })
    .joinChannel(mask, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toFile(outputPath);
}
