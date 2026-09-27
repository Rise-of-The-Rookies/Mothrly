import { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { motion, softInOut } from '@/lib/motion';

/**
 * Fades a card in while it rises a few points into place.
 *
 * Wrap the cards on a screen and give each one its `index` to get a cascade
 * rather than everything appearing at once:
 *
 * ```tsx
 * {items.map((item, i) => (
 *   <FadeSlideIn key={item.id} index={i}>
 *     <Card item={item} />
 *   </FadeSlideIn>
 * ))}
 * ```
 *
 * Written as a shared value driven from an effect rather than with Reanimated's
 * `entering={FadeInDown}` layout animations, for two reasons: layout animations
 * don't expose a stagger without building a custom animation, and they are the
 * part of Reanimated most likely to misbehave on Android when a screen remounts.
 * A plain timing animation on mount does the same job with no surprises.
 *
 * Only for content that is already on screen at mount. Something that appears in
 * response to a tap wants its own transition, not an entrance.
 */

export type FadeSlideInProps = {
  /**
   * Position in the group, counted from 0. Multiplied by
   * {@link motion.entrance.stagger} to get this card's delay.
   */
  index?: number;
  /** Extra delay in ms, added on top of the one derived from `index`. */
  delay?: number;
  /** How far the card rises, in points. Defaults to {@link motion.entrance.travel}. */
  travel?: number;
  /**
   * Style for the wrapper. This element becomes the flex child in place of what
   * it wraps, so layout that used to sit on the child — `flex: 1`, a percentage
   * width — belongs here instead.
   */
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export default function FadeSlideIn({
  index = 0,
  delay = 0,
  travel = motion.entrance.travel,
  style,
  children,
}: FadeSlideInProps) {
  const reducedMotion = useReducedMotion();

  // Starts settled when motion is reduced, so the card is simply there on the
  // first frame. Decided at initialisation rather than in the effect below, which
  // would render one invisible frame before correcting itself.
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;

    progress.value = withDelay(
      index * motion.entrance.stagger + delay,
      withTiming(1, { duration: motion.entrance.duration, easing: softInOut }),
    );
  }, [delay, index, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    // Interpolated by hand rather than with `interpolate`: one multiply is
    // cheaper than a call, and `travel → 0` needs nothing cleverer.
    transform: [{ translateY: (1 - progress.value) * travel }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
