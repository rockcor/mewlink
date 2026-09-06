#!/usr/bin/env python3
"""Generate motion-compensated RGBA in-betweens for Aseprite source frames."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def load_rgba(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        return np.asarray(image.convert("RGBA"), dtype=np.uint8)


def flow_gray(rgba: np.ndarray) -> np.ndarray:
    alpha = rgba[:, :, 3:4].astype(np.float32) / 255.0
    premultiplied = rgba[:, :, :3].astype(np.float32) * alpha
    return cv2.cvtColor(premultiplied.astype(np.uint8), cv2.COLOR_RGB2GRAY)


def warp(rgba: np.ndarray, flow: np.ndarray, amount: float) -> np.ndarray:
    height, width = flow.shape[:2]
    x, y = np.meshgrid(np.arange(width, dtype=np.float32), np.arange(height, dtype=np.float32))
    map_x = x - flow[:, :, 0] * amount
    map_y = y - flow[:, :, 1] * amount
    return cv2.remap(
        rgba,
        map_x,
        map_y,
        cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )


def midpoint(first: np.ndarray, second: np.ndarray) -> np.ndarray:
    first_gray, second_gray = flow_gray(first), flow_gray(second)
    settings = dict(pyr_scale=0.5, levels=4, winsize=19, iterations=4, poly_n=7, poly_sigma=1.4, flags=0)
    forward = cv2.calcOpticalFlowFarneback(first_gray, second_gray, None, **settings)
    backward = cv2.calcOpticalFlowFarneback(second_gray, first_gray, None, **settings)
    first_warped = warp(first, forward, 0.5).astype(np.float32)
    second_warped = warp(second, backward, 0.5).astype(np.float32)

    first_alpha = first_warped[:, :, 3:4] / 255.0
    second_alpha = second_warped[:, :, 3:4] / 255.0
    output_alpha = (first_alpha + second_alpha) / 2.0
    output_rgb = (
        first_warped[:, :, :3] * first_alpha + second_warped[:, :, :3] * second_alpha
    ) / np.maximum(first_alpha + second_alpha, 1e-6)
    return np.concatenate(
        [np.clip(output_rgb, 0, 255), np.clip(output_alpha * 255, 0, 255)], axis=2
    ).astype(np.uint8)


def generate(manifest_path: Path) -> int:
    count = 0
    for line in manifest_path.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        first_path, second_path, output_path = map(Path, line.split("\t"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        result = midpoint(load_rgba(first_path), load_rgba(second_path))
        # Keep generated motion frames crisp and compact. Authored frames stay
        # untouched; only the interpolated midpoint uses the reduced palette.
        image = Image.fromarray(result).quantize(
            colors=64,
            method=Image.Quantize.FASTOCTREE,
            dither=Image.Dither.NONE,
        ).convert("RGBA")
        image.putalpha(image.getchannel("A").point(lambda value: 255 if value >= 96 else 0))
        image.save(output_path, optimize=True)
        count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    args = parser.parse_args()
    print(f"Generated {generate(args.manifest)} motion-compensated in-between frames")


if __name__ == "__main__":
    main()
