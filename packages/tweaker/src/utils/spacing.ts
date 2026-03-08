import { STYLE_VALUE_COMPARISON_EPSILON } from "../constants";
import type { Modification, ResolvedSpacingState, SpacingEdges } from "../types";

const mapSpacingEdges = (
  spacingEdges: SpacingEdges,
  getNextValue: (value: number, edge: keyof SpacingEdges) => number,
): SpacingEdges => ({
  top: getNextValue(spacingEdges.top, "top"),
  right: getNextValue(spacingEdges.right, "right"),
  bottom: getNextValue(spacingEdges.bottom, "bottom"),
  left: getNextValue(spacingEdges.left, "left"),
});

export const getResolvedSpacingState = (modification: Modification): ResolvedSpacingState => {
  const paddingDeltaY = modification.paddingY - modification.originalComputedPadding.top;
  const paddingDeltaX = modification.paddingX - modification.originalComputedPadding.left;

  const targetPadding: SpacingEdges = {
    top: modification.paddingY,
    right: modification.originalComputedPadding.right + paddingDeltaX,
    bottom: modification.originalComputedPadding.bottom + paddingDeltaY,
    left: modification.paddingX,
  };

  const padding = mapSpacingEdges(targetPadding, (value) => Math.max(0, value));
  const margin = mapSpacingEdges(
    targetPadding,
    (value, edge) => modification.originalComputedMargin[edge] + Math.min(0, value),
  );

  return {
    targetPadding,
    padding,
    margin,
  };
};

export const hasSpacingValueChanged = (beforeValue: number, afterValue: number): boolean =>
  Math.abs(beforeValue - afterValue) > STYLE_VALUE_COMPARISON_EPSILON;
