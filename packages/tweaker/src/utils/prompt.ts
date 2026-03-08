import type { GrayScale, Modification } from "../types";
import type {
  ElementSummary,
  ParentLayoutInfo,
  ParentSpacingInfo,
  RepositionContext,
  TreeNode,
} from "./nearby";
import { formatOklch, getColorAtPosition, getClosestShadeLabel } from "./color";

const describeModification = (modification: Modification): string => {
  const nameParts = [modification.selector];
  if (modification.componentName) nameParts.unshift(`<${modification.componentName}>`);
  if (modification.textPreview) nameParts.push(`("${modification.textPreview}")`);
  return nameParts.join(" ");
};

const describeElementSummary = (summary: ElementSummary | null): string => {
  if (!summary) return "unknown parent";

  const summaryParts = [summary.selector];
  if (summary.componentName) summaryParts.unshift(`<${summary.componentName}>`);
  if (summary.textPreview) summaryParts.push(`("${summary.textPreview}")`);
  return summaryParts.join(" ");
};

const describeTreeNode = (node: TreeNode): string => {
  return describeElementSummary({
    selector: node.selector,
    componentName: node.componentName,
    textPreview: node.textPreview,
  });
};

const formatParentLayout = (
  parentLayout: ParentLayoutInfo,
  parentSpacing: ParentSpacingInfo | null,
): string => {
  const layoutParts = [parentLayout.display];
  if (parentLayout.flexDirection) layoutParts.push(parentLayout.flexDirection);
  if (parentSpacing?.method === "gap" && parentSpacing.value > 0) {
    layoutParts.push(`${parentSpacing.cssProperty}: ${parentSpacing.value}px`);
  }
  return layoutParts.join(", ");
};

const formatTreeNode = (node: TreeNode, indent: number): string[] => {
  const prefix = "    " + "  ".repeat(indent);
  const description = describeTreeNode(node);
  const marker = node.isSelf ? "★ " : "";
  const layoutSuffix = node.layout
    ? ` [${node.layout}${node.spacing ? `, ${node.spacing}` : ""}]`
    : "";

  const lines: string[] = [];
  lines.push(`${prefix}${marker}${description} — child ${node.childIndex + 1}${layoutSuffix}`);

  for (const child of node.children) {
    lines.push(...formatTreeNode(child, indent + 1));
  }

  return lines;
};

const formatSpacingGuidance = (context: RepositionContext): string[] => {
  const lines: string[] = [];
  const isHorizontalFlow = context.parentLayout.flowAxis === "horizontal";

  if (!context.parentSpacing || context.parentSpacing.method === "none") {
    lines.push(
      `  → Match the measured ${isHorizontalFlow ? "left/right" : "top/bottom"} gaps with margin${isHorizontalFlow ? "-left / margin-right" : "-top / margin-bottom"} if the parent does not already provide spacing.`,
    );
    return lines;
  }

  if (context.parentSpacing.method === "gap") {
    const spacingDirection = isHorizontalFlow ? "column-gap" : "row-gap";
    const matchingGaps =
      context.gapBefore === context.parentSpacing.value &&
      context.gapAfter === context.parentSpacing.value;
    if (matchingGaps) {
      lines.push(
        `  → Re-order the JSX only. The parent already provides ${spacingDirection}: ${context.parentSpacing.value}px.`,
      );
    } else {
      lines.push(
        `  → Re-order the JSX, keep the parent ${spacingDirection}: ${context.parentSpacing.value}px, and add margins only if needed to reach the measured target gaps.`,
      );
    }
    return lines;
  }

  if (context.parentSpacing.method === "margin") {
    lines.push(
      `  → Re-order the JSX and follow the existing sibling margin pattern (${context.parentSpacing.cssProperty}: ${context.parentSpacing.value}px${context.parentSpacing.isUniform ? "" : ", varying"}).`,
    );
    return lines;
  }

  if (context.parentSpacing.method === "padding") {
    lines.push(
      "  → Re-order the JSX and preserve the parent's internal padding. Use margins only if the measured target gaps differ from that padded layout.",
    );
  }

  return lines;
};

const formatRepositionInstruction = (
  modification: Modification,
  context: RepositionContext,
): string[] => {
  const description = describeModification(modification);
  const lines: string[] = [];

  const targetParentDescription = describeElementSummary(context.targetParent);
  const originalParentDescription = describeElementSummary(context.originalParent);
  const isHorizontalFlow = context.parentLayout.flowAxis === "horizontal";
  const flowStartLabel = isHorizontalFlow ? "left" : "above";
  const flowEndLabel = isHorizontalFlow ? "right" : "below";
  const firstChildInstruction = isHorizontalFlow
    ? "Place as the first child in that row."
    : "Place as the first child in that stack.";
  const lastChildInstruction = isHorizontalFlow
    ? "Place as the last child in that row."
    : "Place as the last child in that stack.";

  lines.push(`- ${description}`);
  if (modification.sourceFile) lines.push(`  Source: ${modification.sourceFile}`);
  lines.push(
    `  Target parent: ${targetParentDescription} (${formatParentLayout(context.parentLayout, context.parentSpacing)})`,
  );

  if (context.didChangeParent) {
    lines.push(
      `  Move this element out of ${originalParentDescription} child ${context.originalChildIndex + 1} and into ${targetParentDescription} as child ${context.targetChildIndex + 1}.`,
    );
  } else {
    lines.push(
      `  Move from child ${context.originalChildIndex + 1} to child ${context.targetChildIndex + 1} inside the same parent.`,
    );
  }

  if (context.previousSibling) {
    lines.push(`  Place after: ${describeElementSummary(context.previousSibling)}`);
  } else {
    lines.push(`  ${firstChildInstruction}`);
  }

  if (context.nextSibling) {
    lines.push(`  Place before: ${describeElementSummary(context.nextSibling)}`);
  } else {
    lines.push(`  ${lastChildInstruction}`);
  }

  lines.push("");
  lines.push(
    `  Target box: left=${Math.round(context.targetRect.left)} top=${Math.round(context.targetRect.top)} right=${Math.round(context.targetRect.right)} bottom=${Math.round(context.targetRect.bottom)} (${Math.round(context.targetRect.width)}×${Math.round(context.targetRect.height)}px)`,
  );
  lines.push(
    `  Original box: left=${Math.round(context.originalRect.left)} top=${Math.round(context.originalRect.top)} → translated by ${Math.round(context.translateX)}px x, ${Math.round(context.translateY)}px y`,
  );

  lines.push("");
  lines.push(`  Target spacing inside the parent content box:`);
  lines.push(`    Gap ${flowStartLabel}: ${context.gapBefore}px`);
  lines.push(`    Gap ${flowEndLabel}: ${context.gapAfter}px`);
  lines.push(
    `    Cross-axis insets: start ${context.crossAxisInsetStart}px, end ${context.crossAxisInsetEnd}px`,
  );

  lines.push("");
  lines.push(...formatSpacingGuidance(context));

  lines.push("");
  lines.push(`  Parent neighborhood:`);
  lines.push(...formatTreeNode(context.tree, 0));
  lines.push("");
  lines.push(
    "  → Do NOT use CSS transforms. Prefer JSX order + the parent's existing layout spacing. Only add margin/padding when needed to match these measured gaps.",
  );

  return lines;
};

export const generatePrompt = (
  modifications: Modification[],
  scales: Record<string, GrayScale>,
  scaleKey: string,
  repositionContexts?: Map<number, RepositionContext>,
): string => {
  if (modifications.length === 0) return "";

  const scaleName = scales[scaleKey]?.label || scaleKey;
  const colorLines: string[] = [];
  const sizeLines: string[] = [];
  const paddingLines: string[] = [];
  const positionLines: string[] = [];

  modifications.forEach((modification, index) => {
    const description = describeModification(modification);

    const shade = getClosestShadeLabel(modification.position);
    const oklch = getColorAtPosition(scales, scaleKey, modification.position);
    const property =
      modification.property === "bg"
        ? "background color"
        : modification.property === "text"
          ? "text color"
          : "border color";
    colorLines.push(
      `- ${property} of ${description} → ${scaleName} ${shade} (${formatOklch(oklch)})`,
    );
    if (modification.sourceFile) colorLines.push(`  Source: ${modification.sourceFile}`);

    sizeLines.push(`- font-size of ${description} → ${modification.fontSize}px`);
    if (modification.sourceFile) sizeLines.push(`  Source: ${modification.sourceFile}`);

    paddingLines.push(
      `- vertical padding of ${description} → ${Math.round(modification.paddingY)}px`,
    );
    if (modification.sourceFile) paddingLines.push(`  Source: ${modification.sourceFile}`);

    const context = repositionContexts?.get(index);
    if (context && (modification.translateX !== 0 || modification.translateY !== 0)) {
      positionLines.push(...formatRepositionInstruction(modification, context));
    }
  });

  const sections: string[] = [];

  if (colorLines.length > 0) {
    sections.push(
      "Change the following colors using the design system's gray scale:",
      "",
      ...colorLines,
    );
  }

  if (sizeLines.length > 0) {
    if (sections.length > 0) sections.push("");
    sections.push("Change the following font sizes:", "", ...sizeLines);
  }

  if (paddingLines.length > 0) {
    if (sections.length > 0) sections.push("");
    sections.push("Change the following padding:", "", ...paddingLines);
  }

  if (positionLines.length > 0) {
    if (sections.length > 0) sections.push("");
    sections.push(
      "Reposition the following element in the source code (do NOT use CSS transforms):",
      "",
      ...positionLines,
    );
  }

  return sections.join("\n");
};
