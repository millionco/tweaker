import { STYLE_VALUE_COMPARISON_EPSILON } from "../constants";
import type { GrayScale, Modification } from "../types";
import { getColorAtPosition, oklchToCssString } from "./color";
import { getResolvedSpacingState } from "./spacing";

const hasStyleValueChanged = (beforeValue: number, afterValue: number): boolean =>
  Math.abs(beforeValue - afterValue) > STYLE_VALUE_COMPARISON_EPSILON;

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
  modification.element.style.fontSize = hasStyleValueChanged(
    modification.originalComputedFontSize,
    modification.fontSize,
  )
    ? `${modification.fontSize}px`
    : modification.originalInlineFontSize;

  const resolvedSpacingState = getResolvedSpacingState(modification);

  modification.element.style.paddingTop = hasStyleValueChanged(
    modification.originalComputedPadding.top,
    resolvedSpacingState.padding.top,
  )
    ? `${resolvedSpacingState.padding.top}px`
    : modification.originalInlinePaddingTop;
  modification.element.style.paddingRight = hasStyleValueChanged(
    modification.originalComputedPadding.right,
    resolvedSpacingState.padding.right,
  )
    ? `${resolvedSpacingState.padding.right}px`
    : modification.originalInlinePaddingRight;
  modification.element.style.paddingBottom = hasStyleValueChanged(
    modification.originalComputedPadding.bottom,
    resolvedSpacingState.padding.bottom,
  )
    ? `${resolvedSpacingState.padding.bottom}px`
    : modification.originalInlinePaddingBottom;
  modification.element.style.paddingLeft = hasStyleValueChanged(
    modification.originalComputedPadding.left,
    resolvedSpacingState.padding.left,
  )
    ? `${resolvedSpacingState.padding.left}px`
    : modification.originalInlinePaddingLeft;

  modification.element.style.marginTop = hasStyleValueChanged(
    modification.originalComputedMargin.top,
    resolvedSpacingState.margin.top,
  )
    ? `${resolvedSpacingState.margin.top}px`
    : modification.originalInlineMarginTop;
  modification.element.style.marginRight = hasStyleValueChanged(
    modification.originalComputedMargin.right,
    resolvedSpacingState.margin.right,
  )
    ? `${resolvedSpacingState.margin.right}px`
    : modification.originalInlineMarginRight;
  modification.element.style.marginBottom = hasStyleValueChanged(
    modification.originalComputedMargin.bottom,
    resolvedSpacingState.margin.bottom,
  )
    ? `${resolvedSpacingState.margin.bottom}px`
    : modification.originalInlineMarginBottom;
  modification.element.style.marginLeft = hasStyleValueChanged(
    modification.originalComputedMargin.left,
    resolvedSpacingState.margin.left,
  )
    ? `${resolvedSpacingState.margin.left}px`
    : modification.originalInlineMarginLeft;
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

export const roundToHalf = (value: number): number => Math.round(value * 2) / 2;
