import type { GrayScale, Modification } from "../types";
import type { RepositionContext, ParentLayoutInfo } from "./nearby";
import { formatOklch, getColorAtPosition, getClosestShadeLabel } from "./color";

const describeModification = (modification: Modification): string => {
  const nameParts = [modification.selector];
  if (modification.componentName) nameParts.unshift(`<${modification.componentName}>`);
  if (modification.textPreview) nameParts.push(`("${modification.textPreview}")`);
  return nameParts.join(" ");
};

const formatParentLayout = (layout: ParentLayoutInfo): string => {
  const parts = [layout.display];
  if (layout.flexDirection) {
    parts.push(layout.flowAxis === "horizontal" ? "row" : "column");
  }
  if (layout.gap > 0) {
    parts.push(`gap: ${layout.gap}px`);
  }
  return parts.join(", ");
};

const formatGapComparison = (
  targetGap: number,
  parentGap: number,
  direction: string,
): string | null => {
  if (parentGap <= 0) return null;
  const difference = targetGap - parentGap;
  if (Math.abs(difference) < 1) return null;

  const marginProperty =
    direction === "above"
      ? "margin-top"
      : direction === "below"
        ? "margin-bottom"
        : direction === "left"
          ? "margin-left"
          : "margin-right";

  if (difference > 0) {
    return `The ${targetGap}px gap ${direction} exceeds the parent gap (${parentGap}px) by ${difference}px — add ${marginProperty}: ${difference}px.`;
  }
  return `The ${targetGap}px gap ${direction} is ${Math.abs(difference)}px less than the parent gap (${parentGap}px) — add ${marginProperty}: ${difference}px.`;
};

const formatRepositionInstruction = (
  modification: Modification,
  context: RepositionContext,
): string[] => {
  const description = describeModification(modification);
  const lines: string[] = [];

  lines.push(`- ${description}`);
  if (modification.sourceFile) lines.push(`  Source: ${modification.sourceFile}`);

  const parentDescription = context.tree.selector;
  const parentComponentName = context.tree.componentName;
  const parentLabel = parentComponentName
    ? `<${parentComponentName}> ${parentDescription}`
    : parentDescription;
  lines.push(`  Parent: ${parentLabel} (${formatParentLayout(context.parentLayout)})`);

  const fromIndex = context.originalChildIndex + 1;
  const toIndex = context.insertionIndex + 1;
  const totalChildren = context.siblingCount + 1;
  const didIndexChange = context.originalChildIndex !== context.insertionIndex;

  if (didIndexChange) {
    lines.push(`  Move from child #${fromIndex} to child #${toIndex} (of ${totalChildren})`);
  } else {
    lines.push(`  Stays at child #${fromIndex} (of ${totalChildren}) — adjust spacing only`);
  }

  lines.push("");

  const isHorizontal = context.parentLayout.flowAxis === "horizontal";

  if (isHorizontal) {
    lines.push("  Neighbors at target position:");
    if (context.previousSibling) {
      lines.push(`    Left:  ${context.previousSibling.description} — ${context.gapLeft}px gap`);
    }
    if (context.nextSibling) {
      lines.push(`    Right: ${context.nextSibling.description} — ${context.gapRight}px gap`);
    }
  } else {
    lines.push("  Neighbors at target position:");
    if (context.previousSibling) {
      lines.push(`    Above: ${context.previousSibling.description} — ${context.gapAbove}px gap`);
    }
    if (context.nextSibling) {
      lines.push(`    Below: ${context.nextSibling.description} — ${context.gapBelow}px gap`);
    }
  }

  if (!context.previousSibling && !context.nextSibling) {
    lines.push("    (no siblings)");
  }

  lines.push("");

  const margin = context.existingMargin;
  if (isHorizontal) {
    lines.push(`  Current element margins: left=${margin.left}px, right=${margin.right}px`);
  } else {
    lines.push(`  Current element margins: top=${margin.top}px, bottom=${margin.bottom}px`);
  }

  lines.push("");

  const instructions: string[] = [];

  if (didIndexChange) {
    instructions.push(`Re-order this element in the JSX to be child #${toIndex} of its parent.`);
  }

  const parentGap = context.parentLayout.gap;

  if (isHorizontal) {
    const leftComparison = context.previousSibling
      ? formatGapComparison(context.gapLeft, parentGap, "left")
      : null;
    const rightComparison = context.nextSibling
      ? formatGapComparison(context.gapRight, parentGap, "right")
      : null;

    if (leftComparison) instructions.push(leftComparison);
    if (rightComparison) instructions.push(rightComparison);

    if (!leftComparison && !rightComparison && parentGap > 0) {
      instructions.push(
        `The gaps match the parent's gap (${parentGap}px) — no extra margins needed.`,
      );
    }

    if (parentGap <= 0 && (context.gapLeft !== 0 || context.gapRight !== 0)) {
      if (context.previousSibling && context.gapLeft !== 0) {
        instructions.push(
          `Set margin-left: ${context.gapLeft}px for the ${context.gapLeft}px gap to the left.`,
        );
      }
      if (context.nextSibling && context.gapRight !== 0) {
        instructions.push(
          `Set margin-right: ${context.gapRight}px for the ${context.gapRight}px gap to the right.`,
        );
      }
    }
  } else {
    const aboveComparison = context.previousSibling
      ? formatGapComparison(context.gapAbove, parentGap, "above")
      : null;
    const belowComparison = context.nextSibling
      ? formatGapComparison(context.gapBelow, parentGap, "below")
      : null;

    if (aboveComparison) instructions.push(aboveComparison);
    if (belowComparison) instructions.push(belowComparison);

    if (!aboveComparison && !belowComparison && parentGap > 0) {
      instructions.push(
        `The gaps match the parent's gap (${parentGap}px) — no extra margins needed.`,
      );
    }

    if (parentGap <= 0 && (context.gapAbove !== 0 || context.gapBelow !== 0)) {
      if (context.previousSibling && context.gapAbove !== 0) {
        instructions.push(
          `Set margin-top: ${context.gapAbove}px for the ${context.gapAbove}px gap above.`,
        );
      }
      if (context.nextSibling && context.gapBelow !== 0) {
        instructions.push(
          `Set margin-bottom: ${context.gapBelow}px for the ${context.gapBelow}px gap below.`,
        );
      }
    }
  }

  if (instructions.length === 0 && !didIndexChange) {
    instructions.push("No spacing changes needed.");
  }

  for (const instruction of instructions) {
    lines.push(`  → ${instruction}`);
  }

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
      "Reposition the following element (do NOT use CSS transforms — re-order the JSX and adjust spacing):",
      "",
      ...positionLines,
    );
  }

  return sections.join("\n");
};
