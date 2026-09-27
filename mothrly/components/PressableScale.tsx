import { useState } from 'react';
import {
  type GestureResponderEvent,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion, softInOut, softOut } from '@/lib/motion';

/**
 * A `Pressable` that sinks slightly while held.
 *
 * The app's single press affordance. Use it for anything tappable that draws its
 * own surface — cards, buttons, list rows — in place of the
 * `pressed && styles.pressed` opacity dip that used to be repeated in every
 * stylesheet. Opacity says "this is disabled"; scale says "I felt that", which is
 * the thing a press wants to communicate.
 *
 * Built on `createAnimatedComponent(Pressable)` rather than a `Pressable`
 * wrapping an `Animated.View`, so the transform and the layout styles land on the
 * same node. With a wrapper, a card styled `width: '48%'` would resolve that
 * percentage against an auto-width parent and collapse.
 *
 * The scale runs on the UI thread, so it stays smooth while JS is busy — which is
 * exactly when a press happens, since the handler usually kicks off work.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  /**
   * Style for the surface itself. Plain style rather than Pressable's
   * `({ pressed }) => …` form: the press state is expressed by the scale, and
   * anything that also needs to change colour uses {@link pressedStyle}.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Extra style applied while held, for surfaces that want a colour change on top
   * of the scale. Costs a re-render per press, so only pass it when it earns one.
   */
  pressedStyle?: StyleProp<ViewStyle>;
  /** Scale at the bottom of the press. Defaults to {@link motion.press.scale}. */
  scaleTo?: number;
  children?: React.ReactNode;
};

export default function PressableScale({
  style,
  pressedStyle,
  scaleTo = motion.press.scale,
  disabled = false,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  // An idle control that flinches when touched is the kind of motion this setting
  // exists to switch off. The press still works, it just doesn't move.
  const reducedMotion = useReducedMotion();

  // Only tracked when a caller actually wants a pressed style — otherwise the
  // scale is the whole affordance and a re-render per press would buy nothing.
  const tracksPressed = pressedStyle != null;
  const [pressed, setPressed] = useState(false);

  const scale = useSharedValue(1);

  /*
   * Both handlers are plain function declarations sitting *above*
   * `useAnimatedStyle`, rather than inline arrows on the JSX below it. The
   * React Compiler lint rules treat a shared value as immutable once a hook in
   * the same component body has captured it, so writing `scale.value` after the
   * `useAnimatedStyle` call is reported as mutating frozen state. Declaring the
   * writers first is the same workaround `SuperviseNudgeAlert` uses for its
   * dismiss animation.
   */
  function handlePressIn(event: GestureResponderEvent) {
    // A disabled Pressable shouldn't emit this at all, but the guard keeps a
    // disabled card from sinking if a platform ever disagrees.
    if (!disabled) {
      if (tracksPressed) setPressed(true);
      if (!reducedMotion) {
        scale.value = withTiming(scaleTo, { duration: motion.press.in, easing: softOut });
      }
    }
    onPressIn?.(event);
  }

  function handlePressOut(event: GestureResponderEvent) {
    if (tracksPressed) setPressed(false);
    if (!reducedMotion) {
      scale.value = withTiming(1, { duration: motion.press.out, easing: softInOut });
    }
    onPressOut?.(event);
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, pressed ? pressedStyle : null, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
