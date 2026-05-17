"""Color math utilities — HSL/RGB conversion, harmony, WCAG contrast.

Pure functions, zero dependencies. Used by `generator.py` to build per-scene
color variants on top of a global palette without breaking visual coherence.

Conventions:
- Hex strings are always 7 chars: "#RRGGBB" (uppercase preferred on output).
- HSL: h ∈ [0, 360), s ∈ [0, 1], l ∈ [0, 1].
- All inputs are validated; invalid hex falls back to "#000000".
"""

from __future__ import annotations

import colorsys
import re
from dataclasses import dataclass

_HEX_RE = re.compile(r"^#?([0-9a-fA-F]{6})$")


# ── Conversion ─────────────────────────────────────────────────────────


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """'#FF6B35' → (255, 107, 53). Returns (0,0,0) on invalid input."""
    m = _HEX_RE.match(hex_color.strip())
    if not m:
        return (0, 0, 0)
    h = m.group(1)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(r: int, g: int, b: int) -> str:
    """(255, 107, 53) → '#FF6B35'. Clamps inputs to [0, 255]."""
    r = max(0, min(255, int(round(r))))
    g = max(0, min(255, int(round(g))))
    b = max(0, min(255, int(round(b))))
    return f"#{r:02X}{g:02X}{b:02X}"


def hex_to_hsl(hex_color: str) -> tuple[float, float, float]:
    """'#FF6B35' → (h°, s, l). Uses Python's colorsys (HLS)."""
    r, g, b = hex_to_rgb(hex_color)
    h, l, s = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
    return (h * 360.0, s, l)


def hsl_to_hex(h: float, s: float, l: float) -> str:
    """(h°, s, l) → '#RRGGBB'. Wraps h, clamps s and l."""
    h = (h % 360) / 360.0
    s = max(0.0, min(1.0, s))
    l = max(0.0, min(1.0, l))
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return rgb_to_hex(r * 255, g * 255, b * 255)


# ── HSL transforms ─────────────────────────────────────────────────────


def shift_hue(hex_color: str, degrees: float) -> str:
    h, s, l = hex_to_hsl(hex_color)
    return hsl_to_hex(h + degrees, s, l)


def adjust_lightness(hex_color: str, delta: float) -> str:
    """delta ∈ [-1, 1]. Negative darkens, positive lightens."""
    h, s, l = hex_to_hsl(hex_color)
    return hsl_to_hex(h, s, l + delta)


def adjust_saturation(hex_color: str, delta: float) -> str:
    """delta ∈ [-1, 1]. Negative desaturates."""
    h, s, l = hex_to_hsl(hex_color)
    return hsl_to_hex(h, s + delta, l)


def mix(hex_a: str, hex_b: str, t: float) -> str:
    """Linear RGB mix. t=0 → a, t=1 → b."""
    t = max(0.0, min(1.0, t))
    ar, ag, ab = hex_to_rgb(hex_a)
    br, bg, bb = hex_to_rgb(hex_b)
    return rgb_to_hex(
        ar + (br - ar) * t,
        ag + (bg - ag) * t,
        ab + (bb - ab) * t,
    )


# ── Harmony schemes ────────────────────────────────────────────────────


@dataclass(frozen=True)
class Harmony:
    """A small set of harmonious colors derived from one base hue."""

    primary: str
    secondary: str
    accent: str


def analogous(base_hex: str, spread: float = 30.0) -> Harmony:
    """Same family, adjacent hues. Calm, cohesive — good for explainers."""
    return Harmony(
        primary=base_hex,
        secondary=shift_hue(base_hex, spread),
        accent=shift_hue(base_hex, -spread),
    )


def complementary(base_hex: str) -> Harmony:
    """Opposite hue. High contrast — good for compare/data scenes."""
    h, s, l = hex_to_hsl(base_hex)
    comp = shift_hue(base_hex, 180)
    accent = adjust_lightness(shift_hue(base_hex, 180), 0.15)
    return Harmony(primary=base_hex, secondary=comp, accent=accent)


def triadic(base_hex: str) -> Harmony:
    """Three evenly spaced hues. Bold, varied — good for playful content."""
    return Harmony(
        primary=base_hex,
        secondary=shift_hue(base_hex, 120),
        accent=shift_hue(base_hex, 240),
    )


def split_complementary(base_hex: str, spread: float = 30.0) -> Harmony:
    """Base + two near-opposite hues. Vibrant but more balanced than triadic."""
    return Harmony(
        primary=base_hex,
        secondary=shift_hue(base_hex, 180 - spread),
        accent=shift_hue(base_hex, 180 + spread),
    )


HARMONY_FNS = {
    "analogous": analogous,
    "complementary": complementary,
    "triadic": triadic,
    "split_complementary": split_complementary,
}


# ── WCAG contrast ──────────────────────────────────────────────────────


def relative_luminance(hex_color: str) -> float:
    """sRGB relative luminance per WCAG 2.1 (0=black, 1=white)."""
    r, g, b = hex_to_rgb(hex_color)

    def _lin(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4

    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast_ratio(fg_hex: str, bg_hex: str) -> float:
    """WCAG contrast ratio in [1, 21]. ≥4.5 = AA for normal text."""
    l1 = relative_luminance(fg_hex)
    l2 = relative_luminance(bg_hex)
    light, dark = max(l1, l2), min(l1, l2)
    return (light + 0.05) / (dark + 0.05)


def ensure_contrast(
    fg_hex: str,
    bg_hex: str,
    target: float = 4.5,
    max_iters: int = 20,
) -> str:
    """Adjust fg lightness until contrast ≥ target. Returns adjusted fg.

    Walks fg toward white (if bg is dark) or black (if bg is bright), in 5%
    lightness increments. If still failing after max_iters, returns the best
    candidate found.
    """
    if contrast_ratio(fg_hex, bg_hex) >= target:
        return fg_hex

    bg_lum = relative_luminance(bg_hex)
    direction = 0.05 if bg_lum < 0.5 else -0.05  # lighten on dark bg, darken on bright bg

    h, s, l = hex_to_hsl(fg_hex)
    best = fg_hex
    best_ratio = contrast_ratio(fg_hex, bg_hex)
    for _ in range(max_iters):
        l = max(0.0, min(1.0, l + direction))
        candidate = hsl_to_hex(h, s, l)
        ratio = contrast_ratio(candidate, bg_hex)
        if ratio > best_ratio:
            best, best_ratio = candidate, ratio
        if ratio >= target:
            return candidate
    return best


__all__ = [
    "Harmony",
    "adjust_lightness",
    "adjust_saturation",
    "analogous",
    "complementary",
    "contrast_ratio",
    "ensure_contrast",
    "hex_to_hsl",
    "hex_to_rgb",
    "hsl_to_hex",
    "mix",
    "relative_luminance",
    "rgb_to_hex",
    "shift_hue",
    "split_complementary",
    "triadic",
    "HARMONY_FNS",
]
