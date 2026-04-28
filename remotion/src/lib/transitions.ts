// remotion/src/lib/transitions.ts
/**
 * Transition helper — maps transition names from Director agent
 * to Remotion TransitionPresentation objects.
 *
 * Used by AutoClipVideo.tsx when building TransitionSeries.
 */

import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { iris } from "@remotion/transitions/iris";
import { none } from "@remotion/transitions/none";
import type { TransitionPresentation } from "@remotion/transitions";

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

/**
 * Map a transition name to a Remotion TransitionPresentation.
 *
 * @param name - Transition name from Director agent
 * @returns TransitionPresentation for use with TransitionSeries.Transition
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTransition(name: string): TransitionPresentation<any> {
  switch (name) {
    case "slide":
      return slide();
    case "wipe":
      return wipe();
    case "fade":
      return fade();
    case "flip":
      return flip({ direction: "from-right" });
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
