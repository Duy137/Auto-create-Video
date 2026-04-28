// remotion/src/lib/fonts.ts
/**
 * Font registration for Remotion rendering.
 * Uses @remotion/google-fonts to ensure Vietnamese diacritics render correctly
 * in headless Chromium during CLI rendering.
 *
 * Be Vietnam Pro — a sans-serif font optimized for Vietnamese text.
 * Only load weights/subsets we actually use to reduce network requests.
 */

import { loadFont } from "@remotion/google-fonts/BeVietnamPro";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700", "800"],
  subsets: ["vietnamese", "latin"],
});

export { fontFamily };
