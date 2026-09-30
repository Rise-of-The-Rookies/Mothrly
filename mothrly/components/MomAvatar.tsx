import Svg, { Circle, Path } from 'react-native-svg';

import shape from '@/data/characterShape.json';
import { colors } from '@/lib/theme';
import type { PersonaId } from '@/data/personas';

/**
 * A compact mom avatar for the tab bar.
 *
 * Unlike {@link Character}, this is a static SVG with no animation — the tab bar
 * redraws it on persona change, and a breathing loop at 24pt would be noise. The
 * expression (smile shape) changes per persona so the active mood is visible at a
 * glance, even in the bottom nav.
 *
 * Persona → expression mapping:
 * - **strict**: flat mouth (—)
 * - **gentle**: soft smile (default)
 * - **funny**: wide grin (D)
 * - **motivational**: confident smirk (slight uptick)
 */

const VIEW_BOX = `0 0 ${shape.viewBox.width} ${shape.viewBox.height}`;

/** Smile path data per persona. All drawn within the character's coordinate space. */
const EXPRESSIONS: Record<PersonaId, string> = {
  strict: 'M78 128 L122 128',
  gentle: 'M80 124 Q100 142 120 124',
  funny: 'M75 120 Q100 150 125 120',
  motivational: 'M82 126 Q100 138 118 122',
};

export type MomAvatarProps = {
  /** Rendered width and height in points. */
  size?: number;
  /** Body fill colour — typically the persona's accent. */
  color?: string;
  /** Which persona's expression to show. */
  personaId?: PersonaId;
};

export default function MomAvatar({
  size = 28,
  color = colors.primary,
  personaId = 'gentle',
}: MomAvatarProps) {
  const smilePath = EXPRESSIONS[personaId] ?? EXPRESSIONS.gentle;

  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path d={shape.body} fill={color} />
      {shape.eyes.map((eye: { cx: number; cy: number; r: number }) => (
        <Circle
          key={`${eye.cx},${eye.cy}`}
          cx={eye.cx}
          cy={eye.cy}
          r={eye.r}
          fill={colors.text}
        />
      ))}
      <Path
        d={smilePath}
        stroke={colors.text}
        strokeWidth={shape.smile.strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
