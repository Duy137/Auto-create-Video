// remotion/src/lib/transitions.ts
/**
 * Transition helper — maps transition names from Director agent
 * to Remotion TransitionPresentation objects.
 *
 * Used by AutoClipVideo.tsx when building TransitionSeries.
 * Supports seed-based direction randomization (Phase 3).
 */

import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { iris } from "@remotion/transitions/iris";
import { none } from "@remotion/transitions/none";
import type { TransitionPresentation } from "@remotion/transitions";
import { seededPick } from "./seed";

export type SceneTransitionName =
  | "fade"
  | "slide"
  | "wipe"
  | "none"
  | "zoom"
  | "flip"
  | "clock-wipe"
  | "iris";

// Default video dimensions (9:16 vertical)
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;

// Direction pools for randomization
const SLIDE_DIRS = ["from-left", "from-right", "from-top", "from-bottom"] as const;
const FLIP_DIRS = ["from-left", "from-right", "from-top", "from-bottom"] as const;
const WIPE_DIRS = [
  "from-left", "from-right", "from-top", "from-bottom",
  "from-top-left", "from-top-right", "from-bottom-left", "from-bottom-right",
] as const;

/**
 * Map a transition name to a Remotion TransitionPresentation.
 *
 * @param name - Transition name from Director agent
 * @param seed - Job seed for direction randomization (0 = default directions)
 * @param sceneIndex - Scene index for unique seed key
 * @returns TransitionPresentation for use with TransitionSeries.Transition
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTransition(name: string, seed: number = 0, sceneIndex: number = 0): TransitionPresentation<any> {
  const key = sceneIndex * 100 + 80;

  switch (name) {
    case "slide":
      return slide({ direction: seededPick(seed, key, SLIDE_DIRS) });
    case "wipe":
      return wipe({ direction: seededPick(seed, key, WIPE_DIRS) });
    case "flip":
      return flip({ direction: seededPick(seed, key, FLIP_DIRS) });
    case "fade":
      return fade();
    case "clock-wipe":
      return clockWipe({ width: VIDEO_WIDTH, height: VIDEO_HEIGHT });
    case "iris":
      return iris({ width: VIDEO_WIDTH, height: VIDEO_HEIGHT });
    case "none":
      return none();
    case "zoom":
      // Zoom-in look is applied in scene wrapper; transition bridge stays fade for compatibility.
      return fade();
    default:
      return fade();
  }
}
