/**
 * Scene-color resolver — Remotion side helper.
 *
 * Mirrors `app/nodes/agents/palette/generator.py` outputs. Given:
 *   - the global ColorPalette (existing schema)
 *   - the optional new fields (paletteMeta + sceneColorVariants)
 *
 * returns a frame-stable `SceneColors` object plus a CSS-vars helper to
 * splat onto a wrapper element.
 *
 * NON-BREAKING: if the new fields are missing (legacy jobs), it synthesizes
 * safe defaults from `colorPalette` so existing scenes keep rendering.
 */

import type { CSSProperties } from "react";

// ── Types ─────────────────────────────────────────────────────────────

export interface ColorPalette {
  primary: string;
  secondary: string;
  background: string;
  text: string;
}

export interface PaletteMeta {
  accent: string;
  themeName: string;
  mood: string;
  backgroundPreset: string;
  harmony: string; // "analogous" | "complementary" | "triadic" | "split_complementary"
}

export interface SceneColorVariant {
  sceneIndex: number;
  background: string;
  accent: string;
  overlay: string;
  intensity: number; // 0..1
  role: string;
}

export interface SceneColors {
  background: string;
  accent: string;
  overlay: string;
  text: string;
  intensity: number;
  role: string;
}

// ── Hex math (subset mirroring color_math.py) ─────────────────────────

const HEX_RE = /^#?([0-9a-f]{6})$/i;

function hexToRgb(hex: string): [number, number, number] {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const h = m[1];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

function adjustLightness(hex: string, delta: number): string {
  const [r, g, b] = hexToRgb(hex);
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rN) h = (gN - bN) / d + (gN < bN ? 6 : 0);
    else if (max === gN) h = (bN - rN) / d + 2;
    else h = (rN - gN) / d + 4;
    h /= 6;
  }
  const newL = Math.max(0, Math.min(1, l + delta));
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = newL < 0.5 ? newL * (1 + s) : newL + s - newL * s;
  const p = 2 * newL - q;
  return rgbToHex(
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  );
}

// ── Role rules (mirrors generator.py _ROLE_RULES) ─────────────────────

type AccentRole = "primary" | "secondary" | "accent";
type RoleRule = {
  intensity: number;
  lightnessShift: number;
  accentRole: AccentRole;
};

const ROLE_RULES: Record<string, RoleRule> = {
  hook: { intensity: 1.0, lightnessShift: 0.04, accentRole: "primary" },
  explain: { intensity: 0.75, lightnessShift: 0.0, accentRole: "primary" },
  list_steps: { intensity: 0.8, lightnessShift: 0.02, accentRole: "secondary" },
  data_visual: { intensity: 0.95, lightnessShift: 0.03, accentRole: "accent" },
  compare: { intensity: 0.9, lightnessShift: 0.01, accentRole: "accent" },
  conclude: { intensity: 0.65, lightnessShift: -0.03, accentRole: "secondary" },
};

const DEFAULT_RULE: RoleRule = ROLE_RULES.explain;

// ── Public API ────────────────────────────────────────────────────────

export function getSceneColors(
  sceneIndex: number,
  role: string | undefined,
  palette: ColorPalette,
  meta?: PaletteMeta,
  variants?: readonly SceneColorVariant[],
): SceneColors {
  const direct = variants?.find((v) => v.sceneIndex === sceneIndex);
  if (direct) {
    return {
      background: direct.background,
      accent: direct.accent,
      overlay: direct.overlay,
      text: palette.text,
      intensity: direct.intensity,
      role: direct.role,
    };
  }

  const rule: RoleRule =
    (role ? ROLE_RULES[role] : undefined) ?? DEFAULT_RULE;
  const accentMap: Record<AccentRole, string> = {
    primary: palette.primary,
    secondary: palette.secondary,
    accent: meta?.accent ?? palette.primary,
  };
  const accent = accentMap[rule.accentRole];
  const background = adjustLightness(palette.background, rule.lightnessShift);
  const overlay = mix(background, accent, 0.18);
  return {
    background,
    accent,
    overlay,
    text: palette.text,
    intensity: rule.intensity,
    role: role ?? "explain",
  };
}

export function sceneColorsToCssVars(colors: SceneColors): CSSProperties {
  return {
    ...({
      "--scene-bg": colors.background,
      "--scene-accent": colors.accent,
      "--scene-overlay": colors.overlay,
      "--scene-text": colors.text,
      "--scene-intensity": String(colors.intensity),
    } as Record<string, string>),
  } as CSSProperties;
}

export function interpolateSceneColors(
  from: SceneColors,
  to: SceneColors,
  t: number,
): SceneColors {
  const k = Math.max(0, Math.min(1, t));
  return {
    background: mix(from.background, to.background, k),
    accent: mix(from.accent, to.accent, k),
    overlay: mix(from.overlay, to.overlay, k),
    text: mix(from.text, to.text, k),
    intensity: from.intensity + (to.intensity - from.intensity) * k,
    role: k < 0.5 ? from.role : to.role,
  };
}

export function bindSceneColors(input: {
  colorPalette: ColorPalette;
  paletteMeta?: PaletteMeta;
  sceneColorVariants?: readonly SceneColorVariant[];
}) {
  return (sceneIndex: number, role?: string): SceneColors =>
    getSceneColors(
      sceneIndex,
      role,
      input.colorPalette,
      input.paletteMeta,
      input.sceneColorVariants,
    );
}
