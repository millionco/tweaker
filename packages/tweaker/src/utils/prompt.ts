import type { GrayScale, Modification } from "../types";
import type { RepositionContext, TreeNode } from "./nearby";
import { formatOklch, getColorAtPosition, getClosestShadeLabel } from "./color";

const describeModification = (modification: Modification): string => {
  const nameParts = [modification.selector];
  if (modification.componentName) nameParts.unshift(`<${modification.componentName}>`);
  if (modification.textPreview) nameParts.push(`("${modification.textPreview}")`);
  return nameParts.join(" ");
};

const describeTreeNode = (node: TreeNode): string => {
  const parts: string[] = [];
  if (node.componentName) parts.push(`<${node.componentName}>`);
  parts.push(node.selector);
  if (node.textPreview && node.children.length === 0) {
    parts.push(`("${node.textPreview}")`);
  }
  return parts.join(" ");
};

const formatTreeNode = (node: TreeNode, indent: number, newPositionY: number): string[] => {
  const prefix = "    " + "  ".repeat(indent);
  const description = describeTreeNode(node);
  const marker = node.isSelf ? "★ " : "";
  const dragSuffix = node.isSelf ? ` → DRAGGED TO Y=${newPositionY}` : "";

  const lines: string[] = [];
  lines.push(`${prefix}${marker}${description} — Y=${node.positionY}${dragSuffix}`);

  for (const child of node.children) {
    lines.push(...formatTreeNode(child, indent + 1, newPositionY));
  }

  return lines;
};

const findInsertionParent = (node: TreeNode, newY: number): TreeNode | null => {
  for (const child of node.children) {
    if (child.children.length > 0) {
      const deeper = findInsertionParent(child, newY);
      if (deeper) return deeper;
    }
  }
  if (node.children.length > 0 && newY >= node.positionY && newY <= node.positionY + node.height) {
    return node;
  }
  return null;
};

const computeSpacingLines = (
  tree: TreeNode,
  newY: number,
  elementHeight: number,
): string[] => {
  const lines: string[] = [];
  const parent = findInsertionParent(tree, newY);
  if (!parent) return lines;

  const siblings = parent.children.filter((child) => !child.isSelf);

  let prevSibling: TreeNode | null = null;
  let nextSibling: TreeNode | null = null;
  for (let index = 0; index < siblings.length; index++) {
    if (newY < siblings[index].positionY) {
      nextSibling = siblings[index];
      break;
    }
    prevSibling = siblings[index];
  }

  lines.push("");
  lines.push("  Spacing at target position:");
  lines.push(`    Element height: ${elementHeight}px`);

  if (prevSibling) {
    const prevBottom = prevSibling.positionY + prevSibling.height;
    const gap = newY - prevBottom;
    lines.push(`    Gap above: ${gap}px (from ${describeTreeNode(prevSibling)} bottom at Y=${prevBottom})`);
  } else {
    const gap = newY - parent.positionY;
    lines.push(`    Gap above: ${gap}px (from parent ${describeTreeNode(parent)} top at Y=${parent.positionY})`);
  }

  if (nextSibling) {
    const elementBottom = newY + elementHeight;
    const gap = nextSibling.positionY - elementBottom;
    lines.push(`    Gap below: ${gap}px (to ${describeTreeNode(nextSibling)} top at Y=${nextSibling.positionY})`);
  }

  if (parent.layout) {
    lines.push(`    Parent layout: ${parent.layout}`);
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
    colorLines.push(`- ${property} of ${description} → ${scaleName} ${shade} (${formatOklch(oklch)})`);
    if (modification.sourceFile) colorLines.push(`  Source: ${modification.sourceFile}`);

    sizeLines.push(`- font-size of ${description} → ${modification.fontSize}px`);
    if (modification.sourceFile) sizeLines.push(`  Source: ${modification.sourceFile}`);

    paddingLines.push(`- vertical padding of ${description} → ${Math.round(modification.paddingY)}px`);
    if (modification.sourceFile) paddingLines.push(`  Source: ${modification.sourceFile}`);

    const context = repositionContexts?.get(index);
    if (context && (modification.translateX !== 0 || modification.translateY !== 0)) {
      positionLines.push(`- ${description}`);
      if (modification.sourceFile) positionLines.push(`  Source: ${modification.sourceFile}`);
      positionLines.push(`  Dragged from Y=${context.originalPositionY} to Y=${context.newPositionY} (offset: ${context.translateX}px horizontal, ${context.translateY}px vertical)`);
      positionLines.push("");
      positionLines.push(`  Page structure (Y = absolute position from document top):`);
      positionLines.push(...formatTreeNode(context.tree, 0, context.newPositionY));
      positionLines.push(...computeSpacingLines(context.tree, context.newPositionY, context.elementHeight));
      positionLines.push("");
      positionLines.push(`  → Move this element to its new position in the JSX and adjust margin/padding to match the target spacing. Do NOT use CSS transforms.`);
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
      "Reposition the following element in the source code (do NOT use CSS transforms — re-order the JSX):",
      "",
      ...positionLines,
    );
  }

  return sections.join("\n");
};
