import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { colors } from '@/lib/theme';

/**
 * The handful of line icons the app needs, drawn inline.
 *
 * Small enough that a whole icon-font dependency would cost more than it saves,
 * and being plain SVG they pick up theme colours directly. All share a 24x24
 * viewBox and a 2pt stroke so they sit together evenly.
 */

export type IconProps = {
  /** Rendered width and height in points. */
  size?: number;
  /** Stroke colour. Defaults to body text. */
  color?: string;
};

const STROKE_WIDTH = 2;

/** Horizontal sliders — the entry point to Settings. */
export function SettingsIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line
        x1="4"
        y1="8"
        x2="20"
        y2="8"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
      <Line
        x1="4"
        y1="16"
        x2="20"
        y2="16"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
      {/* Filled with the screen background so the knobs read as sitting on the
          rails rather than being crossed out by them. */}
      <Circle
        cx="10"
        cy="8"
        r="2.75"
        fill={colors.background}
        stroke={color}
        strokeWidth={STROKE_WIDTH}
      />
      <Circle
        cx="15"
        cy="16"
        r="2.75"
        fill={colors.background}
        stroke={color}
        strokeWidth={STROKE_WIDTH}
      />
    </Svg>
  );
}

/** Water droplet — hydration. */
export function DropletIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3 C12 3 5 10.5 5 14.5 A7 7 0 0 0 19 14.5 C19 10.5 12 3 12 3 Z"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Crescent moon — sleep. */
export function MoonIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20.5 15.2 A8.6 8.6 0 1 1 9.2 3.6 A6.7 6.7 0 0 0 20.5 15.2 Z"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Concentric target — focus. */
export function TargetIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Circle cx="12" cy="12" r="1.25" fill={color} />
    </Svg>
  );
}

/** Closed padlock — a persona that needs the premium entitlement. */
export function LockIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Shackle drawn first so the body overlaps its feet cleanly. */}
      <Path
        d="M8 10.5 V7.75 A4 4 0 0 1 16 7.75 V10.5"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
      <Rect
        x="4.75"
        y="10.5"
        width="14.5"
        height="9.25"
        rx="2.5"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
      />
      <Circle cx="12" cy="15.125" r="1.4" fill={color} />
    </Svg>
  );
}

/** Tick — an item included in a plan. */
export function CheckIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12.75 L9.75 17.5 L19 7.5"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Cross — dismisses a modal that has no navigation header of its own. */
export function CloseIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line
        x1="6.5"
        y1="6.5"
        x2="17.5"
        y2="17.5"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
      <Line
        x1="17.5"
        y1="6.5"
        x2="6.5"
        y2="17.5"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
    </Svg>
  );
}
