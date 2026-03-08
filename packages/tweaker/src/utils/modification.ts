import type { GrayScale, Modification } from "../types";
import { SLIDER_MAX, FONT_WEIGHT_MIN, FONT_WEIGHT_MAX } from "../constants";
import { getColorAtPosition, oklchToCssString } from "./color";

export const positionToFontWeight = (position: number): number => {
  const weight = FONT_WEIGHT_MIN + (position / SLIDER_MAX) * (FONT_WEIGHT_MAX - FONT_WEIGHT_MIN);
  return Math.round(weight / 100) * 100;
};

export const fontWeightToPosition = (weight: number): number => {
  return ((weight - FONT_WEIGHT_MIN) / (FONT_WEIGHT_MAX - FONT_WEIGHT_MIN)) * SLIDER_MAX;
};

export const applyModification = (
  modification: Modification,
  scales: Record<string, GrayScale>,
  scaleKey: string,
) => {
  if (modification.property === "weight") {
    modification.element.style.fontWeight = String(positionToFontWeight(modification.position));
    return;
  }
  const oklch = getColorAtPosition(scales, scaleKey, modification.position);
  const colorValue = oklchToCssString(oklch);
  if (modification.property === "bg") {
    modification.element.style.backgroundColor = colorValue;
  } else if (modification.property === "text") {
    modification.element.style.color = colorValue;
  } else {
    modification.element.style.borderColor = colorValue;
  }
};

export const restoreModification = (modification: Modification) => {
  modification.element.style.backgroundColor = modification.originalInlineBg;
  modification.element.style.color = modification.originalInlineColor;
  modification.element.style.borderColor = modification.originalInlineBorderColor;
  modification.element.style.fontWeight = modification.originalInlineFontWeight;
};

export const roundToStep = (value: number): number =>
  parseFloat((Math.round(value * 10) / 10).toFixed(1));
