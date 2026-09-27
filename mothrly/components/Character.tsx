import { useEffect } from 'react';
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import shape from '@/data/characterShape.json';
import { motion, softInOut } from '@/lib/motion';
import { colors } from '@/lib/theme';

/**
 * Mothrly's character: an organic coral blob with dot eyes and a soft smile.
 *
 * Drawn as vectors rather than a bitmap so it stays crisp at any size and can be
 * re-tinted from the theme. Both of her animations — the breath and the colour
 * crossfade — run on the UI thread, so they keep ticking smoothly while JS is
 * busy, and both use {@link softInOut} rather than a linear curve. That matters
 * most for the breath: at constant velocity the turn at each end of the loop
 * becomes a visible kink, and the whole thing reads as a pulsing indicator rather
 * than something alive.
 */

/** The blob's body, with an animatable `fill`. */
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Geometry comes from `data/characterShape.json` rather than being inlined here,
 * so that `scripts/generate-icon.js` can rasterize the same silhouette into the
 * app icon. Edit the shape there and both follow.
 */
const VIEW_BOX = `0 0 ${shape.viewBox.width} ${shape.viewBox.height}`;

export type CharacterProps = {
  /** Rendered width and height in points. */
  size?: number;
  /**
   * Body fill. Defaults to the theme's coral.
   *
   * Changing it crossfades rather than cutting, so switching persona reads as one
   * character changing mood instead of a different character being swapped in.
   *
   * The face is always drawn in `colors.text`, which reads against every accent
   * in the palette, so only the blob is re-tinted.
   */
  color?: string;
  /**
   * Whether to run the breathing loop. Defaults to `true`.
   *
   * Pass `false` where several characters share a screen — a grid of blobs all
   * breathing at once reads as restless rather than alive, and there is no point
   * paying for four loops to say the same thing. The colour crossfade is
   * unaffected: it is a response to a change, not idle motion.
   */
  animated?: boolean;
  /**
   * Hides the character from screen readers. Use when an enclosing control
   * already names it, so it isn't announced twice.
   */
  decorative?: boolean;
};

export default function Character({
  size = 168,
  color = colors.primary,
  animated = true,
  decorative = false,
}: CharacterProps) {
  // Respects the OS "reduce motion" setting: an idle looping animation is
  // exactly the kind of thing that setting exists to stop.
  const reducedMotion = useReducedMotion();

  const breath = useSharedValue(1);

  // The crossfade is held as a pair of endpoints plus a 0→1 progress, rather than
  // by animating a colour-valued shared value directly. Being explicit about where
  // the fade starts is what lets a persona change that interrupts a previous one
  // pick up from the colour currently on screen instead of snapping back.
  const fadeFrom = useSharedValue(color);
  const fadeTo = useSharedValue(color);
  const fadeProgress = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion || !animated) {
      breath.value = 1;
      return;
    }

    breath.value = withRepeat(
      withTiming(motion.breath.scale, {
        duration: motion.breath.halfCycle,
        easing: softInOut,
      }),
      -1, // forever
      true, // reverse, so it exhales back down instead of snapping
    );
  }, [animated, breath, reducedMotion]);

  useEffect(() => {
    if (fadeTo.value === color) return;

    if (reducedMotion) {
      fadeFrom.value = color;
      fadeTo.value = color;
      fadeProgress.value = 1;
      return;
    }

    // Start from whatever is actually on screen, which for an interrupted fade is
    // somewhere between the last two colours. `interpolateColor` is an ordinary
    // function as well as a worklet, so it can be called here on the JS thread.
    fadeFrom.value = interpolateColor(
      fadeProgress.value,
      [0, 1],
      [fadeFrom.value, fadeTo.value],
    ) as string;
    fadeTo.value = color;
    fadeProgress.value = 0;
    fadeProgress.value = withTiming(1, {
      duration: motion.color.duration,
      easing: softInOut,
    });
  }, [color, fadeFrom, fadeProgress, fadeTo, reducedMotion]);

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));

  const bodyProps = useAnimatedProps(() => ({
    fill: interpolateColor(fadeProgress.value, [0, 1], [fadeFrom.value, fadeTo.value]),
  }));

  return (
    <Animated.View
      accessible={!decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : 'Mothrly, smiling'}
      style={breathStyle}
    >
      <Svg width={size} height={size} viewBox={VIEW_BOX}>
        {/* Irregular radii keep the silhouette hand-drawn rather than circular. */}
        <AnimatedPath d={shape.body} animatedProps={bodyProps} />
        {shape.eyes.map((eye) => (
          <Circle
            key={`${eye.cx},${eye.cy}`}
            cx={eye.cx}
            cy={eye.cy}
            r={eye.r}
            fill={colors.text}
          />
        ))}
        <Path
          d={shape.smile.d}
          stroke={colors.text}
          strokeWidth={shape.smile.strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}
