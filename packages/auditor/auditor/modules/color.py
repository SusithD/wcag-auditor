from __future__ import annotations

import re

import numpy as np

RGB = tuple[int, int, int]
_FUNC = re.compile(r"rgba?\(([^)]+)\)")


def _channel(v: float) -> float:
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def luminance(c: RGB) -> float:
    r, g, b = c
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def contrast_ratio(a: RGB, b: RGB) -> float:
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def parse_css_color(value: str | None) -> tuple[RGB, float] | None:
    """rgb()/rgba() computed colours only; anything else returns None."""
    if not value:
        return None
    m = _FUNC.search(value)
    if not m:
        return None
    parts = [p for p in re.split(r"[ ,/]+", m.group(1).strip()) if p]
    if len(parts) < 3:
        return None
    try:
        rgb = (round(float(parts[0])), round(float(parts[1])), round(float(parts[2])))
        alpha = 1.0
        if len(parts) > 3:
            alpha = float(parts[3][:-1]) / 100 if parts[3].endswith("%") else float(parts[3])
    except ValueError:
        return None
    return rgb, alpha


def blend(fg: RGB, bg: RGB, alpha: float) -> RGB:
    return (
        round(fg[0] * alpha + bg[0] * (1 - alpha)),
        round(fg[1] * alpha + bg[1] * (1 - alpha)),
        round(fg[2] * alpha + bg[2] * (1 - alpha)),
    )


def hex_of(c: RGB) -> str:
    return "#{:02X}{:02X}{:02X}".format(*c)


def mode_color(pixels: np.ndarray) -> RGB:
    flat = pixels.reshape(-1, 3)
    packed = (flat[:, 0].astype(np.int64) << 16) | (flat[:, 1].astype(np.int64) << 8) | flat[:, 2]
    values, counts = np.unique(packed, return_counts=True)
    top = int(values[np.argmax(counts)])
    return (top >> 16 & 255, top >> 8 & 255, top & 255)


def median_color(pixels: np.ndarray) -> RGB:
    flat = pixels.reshape(-1, 3)
    med = np.median(flat, axis=0)
    return (round(float(med[0])), round(float(med[1])), round(float(med[2])))


def score_from_margin(measured: float, threshold: float) -> float:
    """0.5 at the threshold, rising to 1.0 as the miss or pass margin reaches the threshold."""
    margin = min(1.0, abs(measured - threshold) / threshold)
    return round(0.5 + 0.5 * margin, 3)


def luminance_array(pixels: np.ndarray) -> np.ndarray:
    v = pixels.astype(np.float64) / 255
    lin = np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)
    return np.asarray(0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2])


def contrast_array(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Per-pixel contrast ratio between two same-shape RGB images."""
    la, lb = luminance_array(a), luminance_array(b)
    return np.asarray((np.maximum(la, lb) + 0.05) / (np.minimum(la, lb) + 0.05))
