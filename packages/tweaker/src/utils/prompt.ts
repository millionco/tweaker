import { STYLE_VALUE_COMPARISON_EPSILON, STYLE_VALUE_MAX_FRACTION_DIGITS } from "../constants";
import type { GrayScale, Modification, SpacingEdges } from "../types";
import { formatOklch, getColorAtPosition, getClosestShadeLabel } from "./color";
import { getResolvedSpacingState } from "./spacing";

const formatPixelValue = (value: number): string => {
  const roundedValue = Number(value.toFixed(STYLE_VALUE_MAX_FRACTION_DIGITS));
  return `${roundedValue}px`;
};

const hasStyleValueChanged = (beforeValue: number, afterValue: number): boolean =>
  Math.abs(beforeValue - afterValue) > STYLE_VALUE_COMPARISON_EPSILON;

const getColorPropertyName = (property: Modification["property"]): string =>
  property === "bg" ? "background-color" : property === "text" ? "color" : "border-color";

const getOriginalColorValue = (modification: Modification): string =>
  modification.property === "bg"
    ? modification.originalComputedBg
    : modification.property === "text"
      ? modification.originalComputedColor
      : modification.originalComputedBorderColor;

const appendSpacingDiffLines = (
  lines: string[],
  propertyPrefix: "padding" | "margin",
  beforeEdges: SpacingEdges,
  afterEdges: SpacingEdges,
) => {
  const edgeOrder: Array<keyof SpacingEdges> = ["top", "right", "bottom", "left"];

  edgeOrder.forEach((edge) => {
    if (!hasStyleValueChanged(beforeEdges[edge], afterEdges[edge])) return;
    lines.push(
      `- ${propertyPrefix}-${edge}: ${formatPixelValue(beforeEdges[edge])} -> ${formatPixelValue(afterEdges[edge])}`,
    );
  });
};

const getElementPromptLines = (
  modification: Modification,
  scaleName: string,
  scales: Record<string, GrayScale>,
  scaleKey: string,
  index: number,
): string[] => {
  const shade = getClosestShadeLabel(modification.position);
  const oklch = getColorAtPosition(scales, scaleKey, modification.position);
  const resolvedSpacingState = getResolvedSpacingState(modification);
  const changeLines: string[] = [];

  changeLines.push(
    `- ${getColorPropertyName(modification.property)}: ${getOriginalColorValue(modification)} -> ${scaleName} ${shade} (${formatOklch(oklch)})`,
  );

  if (hasStyleValueChanged(modification.originalComputedFontSize, modification.fontSize)) {
    changeLines.push(
      `- font-size: ${formatPixelValue(modification.originalComputedFontSize)} -> ${formatPixelValue(modification.fontSize)}`,
    );
  }

  appendSpacingDiffLines(
    changeLines,
    "padding",
    modification.originalComputedPadding,
    resolvedSpacingState.padding,
  );
  appendSpacingDiffLines(
    changeLines,
    "margin",
    modification.originalComputedMargin,
    resolvedSpacingState.margin,
  );

  const targetLines = [`Target ${index + 1}`, `- selector: ${modification.selector}`];

  if (modification.textPreview) {
    targetLines.push(`- text: "${modification.textPreview}"`);
  }

  if (modification.contextHint) {
    targetLines.push(`- context: ${modification.contextHint}`);
  }

  if (modification.componentName) {
    targetLines.push(`- component: ${modification.componentName}`);
  }

  if (modification.sourceFile) {
    targetLines.push(`- source: ${modification.sourceFile}`);
  }

  modification.promptSignals.forEach((signal) => {
    targetLines.push(`- ${signal.label}: ${signal.value}`);
  });

  targetLines.push("", "Exact diff", ...changeLines);

  return targetLines;
};

export const generatePrompt = (
  modifications: Modification[],
  scales: Record<string, GrayScale>,
  scaleKey: string,
): string => {
  if (modifications.length === 0) return "";

  const scaleName = scales[scaleKey]?.label || scaleKey;
  const promptLines = [
    "Make the smallest possible code edit for each target below.",
    "Use the real DOM signals to find the element and edit the existing local declaration or utility class nearest that element.",
    "Do not refactor unrelated code.",
  ];

  modifications.forEach((modification, index) => {
    promptLines.push(
      "",
      ...getElementPromptLines(modification, scaleName, scales, scaleKey, index),
    );
  });

  return promptLines.join("\n");
};
