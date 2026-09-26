import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/lib/theme';

/**
 * Mothrly's character: an organic coral blob with dot eyes and a soft smile.
 *
 * Drawn as vectors rather than a bitmap so it stays crisp at any size and can be
 * re-tinted from the theme. The breathing animation scales the whole thing on
 * the UI thread, so it keeps ticking smoothly while JS is busy.
 */

/**
 * Half of the breathing cycle. The animation reverses rather than restarting,
 * so the full inhale-exhale loop is twice this.
 */
const BREATH_HALF_CYCLE_MS = 1500;

/** How much the blob grows at the top of a breath. Subtle on purpose. */
const BREATH_SCALE = 1.04;

export type CharacterProps = {
  /** Rendered width and height in points. */
  size?: number;
  /**
   * Body fill. Defaults to the theme's coral.
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
   * paying for four loops to say the same thing.
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

  useEffect(() => {
    if (reducedMotion || !animated) {
      breath.value = 1;
      return;
    }

    breath.value = withRepeat(
      withTiming(BREATH_SCALE, {
        duration: BREATH_HALF_CYCLE_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1, // forever
      true, // reverse, so it exhales back down instead of snapping
    );
  }, [animated, breath, reducedMotion]);

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
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
      <Svg width={size} height={size} viewBox="0 0 200 200">
        {/* Irregular radii keep the silhouette hand-drawn rather than circular. */}
        <Path
          d="M100 16 C138 14 178 42 182 88 C186 134 156 178 106 183 C64 187 24 158 18 112 C12 66 46 18 100 16 Z"
          fill={color}
        />
        <Circle cx="78" cy="94" r="7.5" fill={colors.text} />
        <Circle cx="122" cy="94" r="7.5" fill={colors.text} />
        <Path
          d="M80 124 Q100 142 120 124"
          stroke={colors.text}
          strokeWidth={5}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}
