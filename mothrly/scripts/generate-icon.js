#!/usr/bin/env node
'use strict';

/**
 * Rasterizes Mothrly's character into the app icon.
 *
 *     npm run generate:icon
 *
 * A build-time tool, not part of the app. Nothing under `scripts/` is reachable
 * from `expo-router/entry`, so Metro never sees this file and `sharp` — a native
 * Node module that could not run on a phone anyway — stays a devDependency.
 *
 * The shape is read from `data/characterShape.json` and the colours from
 * `lib/theme.ts`, the same two sources `components/Character.tsx` renders from.
 * That is the point of the script: the icon is derived from the character rather
 * than drawn alongside it, so the two cannot drift. Re-run it after editing
 * either.
 *
 * Output is a 1024x1024 PNG with no alpha channel and square corners. iOS
 * rejects icons with transparency, and both platforms apply their own corner mask
 * — baking rounded corners in here would show up as dark fringing inside the
 * platform's own radius.
 *
 * Only `assets/icon.png` is generated. The Android adaptive icon layers
 * (`android-icon-foreground.png` and friends, wired up under `android.adaptiveIcon`
 * in app.json) are separate artwork with their own safe-zone rules and deliberately
 * *do* need transparency, so they are left alone.
 */

const fs = require('node:fs');
const path = require('node:path');

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** Both store listings and Expo's own tooling expect a 1024px master icon. */
const CANVAS = 1024;

/**
 * Share of the canvas the character's longest side takes up.
 *
 * Measured against the blob's true silhouette, not its viewBox — see
 * {@link pathBoundingBox}. The viewBox has slack around the shape, so scaling that
 * to 60% would leave the character noticeably smaller than asked for.
 */
const COVERAGE = 0.6;

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SHAPE_FILE = path.join(PROJECT_ROOT, 'data', 'characterShape.json');
const THEME_FILE = path.join(PROJECT_ROOT, 'lib', 'theme.ts');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'assets', 'icon.png');

/* -------------------------------------------------------------------------- */
/* Reading the sources                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Pulls hex values out of `lib/theme.ts`.
 *
 * Parsed as text rather than imported because `theme.ts` is TypeScript and this
 * script runs on bare Node with no transpiler. Scraping is acceptable here in a
 * way it would not be in app code: the alternative is duplicating the palette,
 * and a missing token throws immediately with the key name rather than silently
 * rendering the wrong colour.
 */
function readThemeColors(names) {
  const source = fs.readFileSync(THEME_FILE, 'utf8');
  const colors = {};

  for (const name of names) {
    const match = new RegExp(`\\b${name}\\s*:\\s*'(#[0-9a-fA-F]{3,8})'`).exec(source);
    if (!match) {
      throw new Error(
        `Could not find colour "${name}" in lib/theme.ts. If it was renamed, ` +
          'update the names requested in scripts/generate-icon.js.',
      );
    }
    colors[name] = match[1];
  }

  return colors;
}

function readShape() {
  const shape = JSON.parse(fs.readFileSync(SHAPE_FILE, 'utf8'));

  if (typeof shape.body !== 'string' || !shape.viewBox) {
    throw new Error('data/characterShape.json is missing "body" or "viewBox".');
  }

  return shape;
}

/* -------------------------------------------------------------------------- */
/* Measuring the silhouette                                                   */
/* -------------------------------------------------------------------------- */

/** Value of one axis of a cubic Bézier at `t`. */
function cubicAt(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/**
 * Parameters in (0, 1) where one axis of a cubic Bézier turns around.
 *
 * The curve's extremes are at its endpoints and wherever the derivative crosses
 * zero. Differentiating the cubic and dividing by 3 gives the quadratic
 * `a·t² + b·t + c` solved below. Control points are *not* usable as bounds here —
 * they sit outside the curve, and using them would under-scale the character.
 */
function cubicTurningPoints(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;

  const roots = [];

  if (Math.abs(a) < 1e-12) {
    // Degenerates to linear: at most one turning point.
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      roots.push((-b + root) / (2 * a), (-b - root) / (2 * a));
    }
  }

  return roots.filter((t) => t > 0 && t < 1);
}

/**
 * Tight bounding box of a path built from absolute `M`, `C` and `Z` commands.
 *
 * Throws on anything else rather than guessing. The body path is the silhouette,
 * and silently mis-measuring it would scale the icon wrongly with no visible
 * error — so an unsupported command is worth stopping for.
 */
function pathBoundingBox(d) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? [];

  let index = 0;
  const nextNumber = () => {
    const value = Number(tokens[index++]);
    if (!Number.isFinite(value)) throw new Error(`Malformed number in path near token ${index}.`);
    return value;
  };
  const nextIsNumber = () => index < tokens.length && !/[A-Za-z]/.test(tokens[index]);

  const xs = [];
  const ys = [];
  let current = null;
  let subpathStart = null;

  while (index < tokens.length) {
    const command = tokens[index++];

    if (command === 'M') {
      const x = nextNumber();
      const y = nextNumber();
      current = { x, y };
      subpathStart = { x, y };
      xs.push(x);
      ys.push(y);
      continue;
    }

    if (command === 'C') {
      // A run of curves may follow one `C`, with the command letter implied.
      do {
        if (!current) throw new Error('Path starts with a curve before any moveto.');

        const x1 = nextNumber();
        const y1 = nextNumber();
        const x2 = nextNumber();
        const y2 = nextNumber();
        const x = nextNumber();
        const y = nextNumber();

        xs.push(x);
        ys.push(y);

        for (const t of cubicTurningPoints(current.x, x1, x2, x)) {
          xs.push(cubicAt(current.x, x1, x2, x, t));
        }
        for (const t of cubicTurningPoints(current.y, y1, y2, y)) {
          ys.push(cubicAt(current.y, y1, y2, y, t));
        }

        current = { x, y };
      } while (nextIsNumber());
      continue;
    }

    if (command === 'Z' || command === 'z') {
      // Closing draws a straight line back to the start, which is already counted.
      current = subpathStart ? { ...subpathStart } : null;
      continue;
    }

    throw new Error(
      `Unsupported path command "${command}" in data/characterShape.json. ` +
        'scripts/generate-icon.js measures absolute M, C and Z only — extend ' +
        'pathBoundingBox() if the shape needs more.',
    );
  }

  if (xs.length === 0) throw new Error('Path contained no drawable points.');

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/* -------------------------------------------------------------------------- */
/* Building the SVG                                                           */
/* -------------------------------------------------------------------------- */

function buildSvg(shape, colors) {
  const box = pathBoundingBox(shape.body);

  // Fit the longer side to the coverage target so the character keeps its
  // proportions, then centre the box — not the viewBox — on the canvas.
  const scale = (CANVAS * COVERAGE) / Math.max(box.width, box.height);
  const offsetX = (CANVAS - box.width * scale) / 2;
  const offsetY = (CANVAS - box.height * scale) / 2;

  // Read right to left: move the box's own origin to 0,0, scale it up, then move
  // it into place. The stroke width scales with the group, so the smile keeps its
  // weight relative to the face.
  const transform =
    `translate(${offsetX.toFixed(4)} ${offsetY.toFixed(4)}) ` +
    `scale(${scale.toFixed(6)}) ` +
    `translate(${(-box.minX).toFixed(4)} ${(-box.minY).toFixed(4)})`;

  const eyes = (shape.eyes ?? [])
    .map((eye) => `<circle cx="${eye.cx}" cy="${eye.cy}" r="${eye.r}" fill="${colors.text}"/>`)
    .join('');

  const smile = shape.smile
    ? `<path d="${shape.smile.d}" stroke="${colors.text}" stroke-width="${shape.smile.strokeWidth}" stroke-linecap="round" fill="none"/>`
    : '';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" ` +
    `viewBox="0 0 ${CANVAS} ${CANVAS}">` +
    // Full-bleed background. Square on purpose: the platforms mask their own
    // corners, and rounding here would leave dark fringes inside their radius.
    `<rect width="${CANVAS}" height="${CANVAS}" fill="${colors.background}"/>` +
    `<g transform="${transform}">` +
    `<path d="${shape.body}" fill="${colors.primary}"/>` +
    eyes +
    smile +
    `</g>` +
    `</svg>`;

  return { svg, box, scale };
}

/* -------------------------------------------------------------------------- */

function loadSharp() {
  try {
    return require('sharp');
  } catch (error) {
    throw new Error(
      'sharp is not installed. Run `npx expo install --dev sharp` and try again.\n' +
        `Underlying error: ${error.message}`,
    );
  }
}

async function main() {
  const sharp = loadSharp();

  const shape = readShape();
  // `background` is the cream canvas, `primary` the coral body, `text` the face.
  const colors = readThemeColors(['background', 'primary', 'text']);

  const { svg, box, scale } = buildSvg(shape, colors);

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

  await sharp(Buffer.from(svg))
    // Composites onto the cream and drops the alpha channel outright. Without
    // this the PNG keeps a fully-opaque alpha channel, which iOS still rejects.
    .flatten({ background: colors.background })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(OUTPUT_FILE);

  // Verify rather than assume: a silently transparent or mis-sized icon is
  // rejected at submission time, long after this script has run.
  const meta = await sharp(OUTPUT_FILE).metadata();
  const problems = [];
  if (meta.width !== CANVAS || meta.height !== CANVAS) {
    problems.push(`expected ${CANVAS}x${CANVAS}, produced ${meta.width}x${meta.height}`);
  }
  if (meta.hasAlpha) problems.push('output still has an alpha channel');
  if (problems.length > 0) throw new Error(`Icon failed verification: ${problems.join('; ')}.`);

  const coverage = ((Math.max(box.width, box.height) * scale) / CANVAS) * 100;
  const relative = path.relative(PROJECT_ROOT, OUTPUT_FILE).replace(/\\/g, '/');

  console.log(`Wrote ${relative}`);
  console.log(`  ${meta.width}x${meta.height} ${meta.space}, ${meta.channels} channels, no alpha`);
  console.log(
    `  silhouette ${box.width.toFixed(1)}x${box.height.toFixed(1)} in viewBox units, ` +
      `scaled ${scale.toFixed(3)}x to ${coverage.toFixed(1)}% of the canvas`,
  );
  console.log(`  background ${colors.background}, body ${colors.primary}, face ${colors.text}`);
}

main().catch((error) => {
  console.error(`\ngenerate-icon failed: ${error.message}\n`);
  process.exitCode = 1;
});
