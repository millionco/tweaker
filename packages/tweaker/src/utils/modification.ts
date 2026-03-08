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
  modification.element.style.fontSize = `${modification.fontSize}px`;

  const paddingY = Math.round(modification.paddingY);
  const paddingX = Math.round(modification.paddingX);

  modification.element.style.paddingTop = `${Math.max(0, paddingY)}px`;
  modification.element.style.paddingBottom = `${Math.max(0, paddingY)}px`;
  modification.element.style.paddingLeft = `${Math.max(0, paddingX)}px`;
  modification.element.style.paddingRight = `${Math.max(0, paddingX)}px`;

  modification.element.style.marginTop = paddingY < 0 ? `${paddingY}px` : modification.originalInlineMarginTop;
  modification.element.style.marginBottom = paddingY < 0 ? `${paddingY}px` : modification.originalInlineMarginBottom;
  modification.element.style.marginLeft = paddingX < 0 ? `${paddingX}px` : modification.originalInlineMarginLeft;
  modification.element.style.marginRight = paddingX < 0 ? `${paddingX}px` : modification.originalInlineMarginRight;
};

export const restoreModification = (modification: Modification) => {
  modification.element.style.backgroundColor = modification.originalInlineBg;
  modification.element.style.color = modification.originalInlineColor;
  modification.element.style.borderColor = modification.originalInlineBorderColor;
  modification.element.style.fontSize = modification.originalInlineFontSize;
  modification.element.style.paddingTop = modification.originalInlinePaddingTop;
  modification.element.style.paddingBottom = modification.originalInlinePaddingBottom;
  modification.element.style.paddingLeft = modification.originalInlinePaddingLeft;
  modification.element.style.paddingRight = modification.originalInlinePaddingRight;
  modification.element.style.marginTop = modification.originalInlineMarginTop;
  modification.element.style.marginBottom = modification.originalInlineMarginBottom;
  modification.element.style.marginLeft = modification.originalInlineMarginLeft;
  modification.element.style.marginRight = modification.originalInlineMarginRight;
};

export const roundToStep = (value: number): number =>
  parseFloat((Math.round(value * 10) / 10).toFixed(1));

export const roundToHalf = (value: number): number =>
  Math.round(value * 2) / 2;
