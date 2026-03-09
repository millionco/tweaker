import type { DraggedElement } from "../types";
import type { ParentLayoutInfo, RepositionContext } from "./nearby";

const describeDraggedElement = (draggedElement: DraggedElement): string => {
  const nameParts = [draggedElement.selector];
  if (draggedElement.componentName) nameParts.unshift(`<${draggedElement.componentName}>`);
  if (draggedElement.textPreview) nameParts.push(`("${draggedElement.textPreview}")`);
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

const formatSpacingInstruction = (
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

const formatFallbackInstruction = (draggedElement: DraggedElement): string[] => {
  const description = describeDraggedElement(draggedElement);
  const lines = [`- ${description}`];

  if (draggedElement.sourceFile) {
    lines.push(`  Source: ${draggedElement.sourceFile}`);
  }

  lines.push(
    `  Match the dragged preview without CSS transforms (preview offset: x=${draggedElement.translateX}px, y=${draggedElement.translateY}px).`,
  );

  return lines;
};

const formatRepositionInstruction = (
  draggedElement: DraggedElement,
  context: RepositionContext,
): string[] => {
  const description = describeDraggedElement(draggedElement);
  const lines: string[] = [];

  lines.push(`- ${description}`);
  if (draggedElement.sourceFile) lines.push(`  Source: ${draggedElement.sourceFile}`);

  const parentLabel = context.parentComponentName
    ? `<${context.parentComponentName}> ${context.parentDescription}`
    : context.parentDescription;
  lines.push(`  Parent: ${parentLabel} (${formatParentLayout(context.parentLayout)})`);
  lines.push(`  Drag preview: x=${draggedElement.translateX}px, y=${draggedElement.translateY}px`);

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
      lines.push(`    Left:  ${context.previousSibling.description} — ${context.gapBefore}px gap`);
    }
    if (context.nextSibling) {
      lines.push(`    Right: ${context.nextSibling.description} — ${context.gapAfter}px gap`);
    }
  } else {
    lines.push("  Neighbors at target position:");
    if (context.previousSibling) {
      lines.push(`    Above: ${context.previousSibling.description} — ${context.gapBefore}px gap`);
    }
    if (context.nextSibling) {
      lines.push(`    Below: ${context.nextSibling.description} — ${context.gapAfter}px gap`);
    }
  }

  if (!context.previousSibling && !context.nextSibling) {
    lines.push("    (no siblings)");
  }

  lines.push("");

  if (isHorizontal) {
    lines.push(
      `  Current element margins: left=${context.existingMarginBefore}px, right=${context.existingMarginAfter}px`,
    );
  } else {
    lines.push(
      `  Current element margins: top=${context.existingMarginBefore}px, bottom=${context.existingMarginAfter}px`,
    );
  }

  lines.push("");

  const instructions: string[] = [];

  if (didIndexChange) {
    instructions.push(`Re-order this element in the JSX to be child #${toIndex} of its parent.`);
  }

  const parentGap = context.parentLayout.gap;

  if (isHorizontal) {
    const leftComparison = context.previousSibling
      ? formatSpacingInstruction(context.gapBefore, parentGap, "left")
      : null;
    const rightComparison = context.nextSibling
      ? formatSpacingInstruction(context.gapAfter, parentGap, "right")
      : null;

    if (leftComparison) instructions.push(leftComparison);
    if (rightComparison) instructions.push(rightComparison);

    if (!leftComparison && !rightComparison && parentGap > 0) {
      instructions.push(
        `The gaps match the parent's gap (${parentGap}px) — no extra margins needed.`,
      );
    }

    if (parentGap <= 0 && (context.gapBefore !== 0 || context.gapAfter !== 0)) {
      if (context.previousSibling && context.gapBefore !== 0) {
        instructions.push(
          `Set margin-left: ${context.gapBefore}px for the ${context.gapBefore}px gap to the left.`,
        );
      }
      if (context.nextSibling && context.gapAfter !== 0) {
        instructions.push(
          `Set margin-right: ${context.gapAfter}px for the ${context.gapAfter}px gap to the right.`,
        );
      }
    }
  } else {
    const aboveComparison = context.previousSibling
      ? formatSpacingInstruction(context.gapBefore, parentGap, "above")
      : null;
    const belowComparison = context.nextSibling
      ? formatSpacingInstruction(context.gapAfter, parentGap, "below")
      : null;

    if (aboveComparison) instructions.push(aboveComparison);
    if (belowComparison) instructions.push(belowComparison);

    if (!aboveComparison && !belowComparison && parentGap > 0) {
      instructions.push(
        `The gaps match the parent's gap (${parentGap}px) — no extra margins needed.`,
      );
    }

    if (parentGap <= 0 && (context.gapBefore !== 0 || context.gapAfter !== 0)) {
      if (context.previousSibling && context.gapBefore !== 0) {
        instructions.push(
          `Set margin-top: ${context.gapBefore}px for the ${context.gapBefore}px gap above.`,
        );
      }
      if (context.nextSibling && context.gapAfter !== 0) {
        instructions.push(
          `Set margin-bottom: ${context.gapAfter}px for the ${context.gapAfter}px gap below.`,
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
  draggedElements: DraggedElement[],
  repositionContexts?: Map<number, RepositionContext>,
): string => {
  if (draggedElements.length === 0) return "";

  const positionLines: string[] = [];

  draggedElements.forEach((draggedElement, index) => {
    const context = repositionContexts?.get(index);
    if (context) {
      positionLines.push(...formatRepositionInstruction(draggedElement, context));
      return;
    }

    positionLines.push(...formatFallbackInstruction(draggedElement));
  });

  if (positionLines.length === 0) return "";

  return [
    "Reposition the following dragged elements within their current parent in the DOM.",
    "Do not use CSS transforms in the final implementation — reorder the JSX and adjust spacing instead.",
    "",
    ...positionLines,
  ].join("\n");
};
