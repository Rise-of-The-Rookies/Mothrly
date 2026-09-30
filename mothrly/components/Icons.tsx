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

/** Play button — for text-to-speech. */
export function PlayIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M8 5 V19 L19 12 Z" />
    </Svg>
  );
}

/** House — Home tab. */
export function HomeIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10.5 L12 3 L21 10.5 V20 A1 1 0 0 1 20 21 H15 V14 H9 V21 H4 A1 1 0 0 1 3 20 Z"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 2×2 app grid — Supervise tab. Represents monitored apps. */
export function AppGridIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Rect x="13" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Rect x="3" y="13" width="8" height="8" rx="2" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Rect x="13" y="13" width="8" height="8" rx="2" stroke={color} strokeWidth={STROKE_WIDTH} />
    </Svg>
  );
}

/** Flame — Streak counter. */
export function FlameIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8.5 14.5 C8.5 16.4 10.1 18 12 18 C13.9 18 15.5 16.4 15.5 14.5 C15.5 11 12 9 12 9 C12 9 8.5 11 8.5 14.5 Z"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 22 C17 22 20 18.5 20 14.5 C20 9 15 5 13 3 C13 3 13 6 11 7 C9 8 4 11 4 15.5 C4 19 7 22 12 22 Z"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Mood: Terrible */
export function MoodTerribleIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={STROKE_WIDTH} />
      {/* Closed squeezed eyes */}
      <Path d="M7 9 L10 11 M7 11 L10 9" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M14 9 L17 11 M14 11 L17 9" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      {/* Wailing mouth */}
      <Path d="M9 16 Q12 13 15 16 Z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" fill={color} />
    </Svg>
  );
}

/** Mood: Bad */
export function MoodBadIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Circle cx="8.5" cy="9.5" r="1.5" fill={color} />
      <Circle cx="15.5" cy="9.5" r="1.5" fill={color} />
      {/* Frown */}
      <Path d="M8 16 Q12 13 16 16" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

/** Mood: Okay */
export function MoodOkayIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Circle cx="8.5" cy="9.5" r="1.5" fill={color} />
      <Circle cx="15.5" cy="9.5" r="1.5" fill={color} />
      {/* Straight mouth */}
      <Line x1="8" y1="15" x2="16" y2="15" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

/** Mood: Good */
export function MoodGoodIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Circle cx="8.5" cy="9.5" r="1.5" fill={color} />
      <Circle cx="15.5" cy="9.5" r="1.5" fill={color} />
      {/* Smile */}
      <Path d="M8 14 Q12 17 16 14" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

/** Mood: Great */
export function MoodGreatIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={STROKE_WIDTH} />
      {/* Happy curved eyes */}
      <Path d="M7 10 Q8.5 8 10 10" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M14 10 Q15.5 8 17 10" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      {/* Wide open smile */}
      <Path d="M8 14 Q12 20 16 14 Z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" fill={color} />
    </Svg>
  );
}

/** Two-faced mask — Personas tab. Represents switching moods. */
export function MasksIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Happy face */}
      <Circle cx="10" cy="10" r="7" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Circle cx="8" cy="9" r="1" fill={color} />
      <Circle cx="12" cy="9" r="1" fill={color} />
      <Path
        d="M7.5 12 Q10 14.5 12.5 12"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
      {/* Sad face, offset */}
      <Path
        d="M15 11 A7 7 0 1 1 13 17.5"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="16" cy="15" r="1" fill={color} />
      <Circle cx="20" cy="15" r="1" fill={color} />
      <Path
        d="M15.5 18.5 Q18 17 20.5 18.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

