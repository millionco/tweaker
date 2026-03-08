import type { OKLCH } from "../types";
import { SHADE_KEYS, SLIDER_MAX } from "../constants";
import type { GrayScale } from "../types";

export const parseOklch = (oklchStr: string): OKLCH => {
  const match = oklchStr.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

export const lerpOklch = (colorA: OKLCH, colorB: OKLCH, interpolation: number): OKLCH => [
  colorA[0] + (colorB[0] - colorA[0]) * interpolation,
  colorA[1] + (colorB[1] - colorA[1]) * interpolation,
  colorA[2] + (colorB[2] - colorA[2]) * interpolation,
];

export const formatOklch = (oklch: OKLCH): string =>
  `oklch(${oklch[0].toFixed(3)} ${oklch[1].toFixed(3)} ${oklch[2].toFixed(1)})`;

export const oklchToCssString = (oklch: OKLCH): string =>
  `oklch(${oklch[0]} ${oklch[1]} ${oklch[2]})`;

export const getColorAtPosition = (scales: Record<string, GrayScale>, scaleKey: string, position: number): OKLCH => {
  const scale = scales[scaleKey];
  if (!scale) return [0.5, 0, 0];

  const inverted = SLIDER_MAX - position;
  const segment = (inverted / SLIDER_MAX) * (SHADE_KEYS.length - 1);
  const index = Math.min(Math.floor(segment), SHADE_KEYS.length - 2);
  const interpolation = segment - index;

  const lower = parseOklch(scale.shades[SHADE_KEYS[index]]);
  const upper = parseOklch(scale.shades[SHADE_KEYS[index + 1]]);

  return lerpOklch(lower, upper, interpolation);
};

export const getClosestShadeLabel = (position: number): string => {
  const inverted = SLIDER_MAX - position;
  const segment = (inverted / SLIDER_MAX) * (SHADE_KEYS.length - 1);
  const index = Math.round(segment);
  return SHADE_KEYS[Math.min(index, SHADE_KEYS.length - 1)];
};

export const parseRgb = (color: string): [number, number, number, number] => {
  const match = color.match(
    /rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/
  );
  if (!match) return [0, 0, 0, 0];
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    match[4] !== undefined ? Number(match[4]) : 1,
  ];
};

export const rgbToOklch = (red: number, green: number, blue: number): OKLCH => {
  const linearize = (channel: number): number => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  const linearRed = linearize(red);
  const linearGreen = linearize(green);
  const linearBlue = linearize(blue);

  const lmsL = Math.cbrt(0.4122214708 * linearRed + 0.5363325363 * linearGreen + 0.0514459929 * linearBlue);
  const lmsM = Math.cbrt(0.2119034982 * linearRed + 0.6806995451 * linearGreen + 0.1073969566 * linearBlue);
  const lmsS = Math.cbrt(0.0883024619 * linearRed + 0.2817188376 * linearGreen + 0.6299787005 * linearBlue);

  const lightness = 0.2104542553 * lmsL + 0.793617785 * lmsM - 0.0040720468 * lmsS;
  const labA = 1.9779984951 * lmsL - 2.428592205 * lmsM + 0.4505937099 * lmsS;
  const labB = 0.0259040371 * lmsL + 0.7827717662 * lmsM - 0.808675766 * lmsS;

  const chroma = Math.sqrt(labA * labA + labB * labB);
  const hue = Math.atan2(labB, labA) * (180 / Math.PI);

  return [lightness, chroma, hue < 0 ? hue + 360 : hue];
};

export const findClosestPosition = (scales: Record<string, GrayScale>, scaleKey: string, targetOklch: OKLCH): number => {
  let bestPosition = 0;
  let bestDistance = Infinity;

  for (let position = 0; position <= SLIDER_MAX; position++) {
    const color = getColorAtPosition(scales, scaleKey, position);
    const distance =
      (color[0] - targetOklch[0]) ** 2 +
      (color[1] - targetOklch[1]) ** 2 +
      ((color[2] - targetOklch[2]) / 360) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPosition = position;
    }
  }

  return bestPosition;
};
