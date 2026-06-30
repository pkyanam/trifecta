#!/usr/bin/env python3
"""Apply a macOS-style squircle alpha mask to a square app icon PNG."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


def macos_squircle_alpha(size: int, exponent: float = 5.0) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    pixels = mask.load()
    cx = cy = (size - 1) / 2.0
    radius = size / 2.0

    for y in range(size):
        for x in range(size):
            nx = abs(x - cx) / radius
            ny = abs(y - cy) / radius
            if nx**exponent + ny**exponent <= 1.0:
                pixels[x, y] = 255

    return mask


def apply_mask(input_path: Path, output_path: Path, size: int = 1024) -> None:
    image = Image.open(input_path).convert("RGBA")

    if image.width != image.height:
        raise SystemExit(f"Icon must be square, got {image.width}x{image.height}")

    if image.width != size:
        image = image.resize((size, size), Image.Resampling.LANCZOS)

    mask = macos_squircle_alpha(size)
    image.putalpha(mask)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, "PNG")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: macos-icon-mask.py <input.png> <output.png>")

    apply_mask(Path(sys.argv[1]), Path(sys.argv[2]))


if __name__ == "__main__":
    main()