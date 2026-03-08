import type { GrayScale, Modification } from "../types";
import { getColorAtPosition, oklchToCssString } from "./color";

export const applyModification = (
  modification: Modification,
  scales: Record<string, GrayScale>,
  scaleKey: string,
) => {
  const oklch = getColorAtPosition(scales, scaleKey, modification.position);
  const colorValue = oklchToCssString(oklch);
  if (modification.property === "bg") {
    modification.element.style.backgroundColor = colorValue;
  } else if (modification.property === "text") {
    modification.element.style.color = colorValue;
  } else {
    modification.element.style.borderColor = colorValue;
  }
  modification.element.style.fontWeight = String(Math.round(modification.fontWeight));
};

export const restoreModification = (modification: Modification) => {
  modification.element.style.backgroundColor = modification.originalInlineBg;
  modification.element.style.color = modification.originalInlineColor;
  modification.element.style.borderColor = modification.originalInlineBorderColor;
  modification.element.style.fontWeight = modification.originalInlineFontWeight;
};

export const roundToStep = (value: number): number =>
  parseFloat((Math.round(value * 10) / 10).toFixed(1));
