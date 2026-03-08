import type { GrayScale, Modification } from "../types";
import type { RepositionContext, SiblingInfo, SpacingInfo, TreeNode } from "./nearby";
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

const describeSibling = (sibling: SiblingInfo): string => {
  const parts: string[] = [];
  if (sibling.componentName) parts.push(`<${sibling.componentName}>`);
  parts.push(sibling.selector);
  if (sibling.textPreview) parts.push(`("${sibling.textPreview}")`);
  return parts.join(" ");
};

const formatLayoutLabel = (layout: string | null): string => {
  if (!layout) return "block";
  return layout;
};

const formatSpacingLabel = (spacing: SpacingInfo | null): string => {
  if (!spacing) return "no detected spacing";
  if (spacing.method === "gap") return `${spacing.cssProperty}: ${spacing.value}px`;
  if (spacing.method === "margin") return `${spacing.cssProperty}: ${spacing.value}px on children`;
  if (spacing.method === "padding") return `padding on parent`;
  return "no consistent spacing";
};

const formatTreeNode = (node: TreeNode, indent: number, selfTargetIndex: number | null): string[] => {
  const prefix = "    " + "  ".repeat(indent);
  const description = describeTreeNode(node);
  const marker = node.isSelf ? "★ " : "";

  const layoutSuffix = node.children.length > 0 && node.layout
    ? ` [${formatLayoutLabel(node.layout)}${node.spacingMechanism ? `, ${formatSpacingLabel(node.spacingMechanism)}` : ""}]`
    : "";

  const indexLabel = selfTargetIndex !== null && node.isSelf
    ? ` — MOVE TO child ${selfTargetIndex}`
    : ` — child ${node.childIndex}`;

  const lines: string[] = [];
  lines.push(`${prefix}${marker}${description}${indexLabel}${layoutSuffix}`);

  for (const child of node.children) {
    lines.push(...formatTreeNode(child, indent + 1, selfTargetIndex));
  }

  return lines;
};

const formatRelationalPosition = (context: RepositionContext, description: string): string[] => {
  const lines: string[] = [];

  lines.push(`- ${description}`);

  lines.push(`  Relational position:`);
  lines.push(`    Move from child ${context.originalChildIndex} → child ${context.targetChildIndex} inside ${context.parentSelector}`);

  if (context.previousSibling) {
    lines.push(`    Place after: ${describeSibling(context.previousSibling)}`);
  } else {
    lines.push(`    Place as first child`);
  }

  if (context.nextSibling) {
    lines.push(`    Place before: ${describeSibling(context.nextSibling)}`);
  }

  return lines;
};

const formatSpacingInstruction = (context: RepositionContext): string[] => {
  const lines: string[] = [];
  const spacing = context.parentSpacing;
  const layout = context.parentLayout;

  lines.push("");
  lines.push(`  Parent layout: ${formatLayoutLabel(layout)}`);

  if (spacing && spacing.method === "gap") {
    lines.push(`  Parent spacing: ${spacing.cssProperty}: ${spacing.value}px`);
    if (context.targetGapAbove === spacing.value && context.targetGapBelow === spacing.value) {
      lines.push(`  → Reorder the JSX only. The parent's ${spacing.cssProperty} property handles spacing automatically.`);
    } else {
      lines.push(`  → Reorder the JSX. Parent uses ${spacing.cssProperty}: ${spacing.value}px for base spacing.`);
      if (context.targetGapAbove !== spacing.value) {
        const extraMargin = context.targetGapAbove - spacing.value;
        if (extraMargin > 0) {
          lines.push(`  → Add margin-top: ${extraMargin}px to achieve ${context.targetGapAbove}px total gap above.`);
        } else if (context.targetGapAbove >= 0 && context.targetGapAbove < spacing.value) {
          lines.push(`  → Add margin-top: ${extraMargin}px (negative) to reduce gap above to ${context.targetGapAbove}px.`);
        }
      }
    }
  } else if (spacing && spacing.method === "margin") {
    lines.push(`  Sibling spacing: ${spacing.cssProperty}: ${spacing.value}px${spacing.isUniform ? " (uniform)" : " (varies)"}`);
    if (spacing.isUniform && context.targetGapAbove === spacing.value) {
      lines.push(`  → Reorder the JSX. Existing ${spacing.cssProperty}: ${spacing.value}px on siblings provides correct spacing.`);
    } else {
      lines.push(`  → Reorder the JSX and set margin-top: ${Math.max(0, context.targetGapAbove)}px on this element for the ${context.targetGapAbove}px gap above.`);
      if (context.nextSibling && context.targetGapBelow >= 0) {
        lines.push(`  → Set margin-bottom: ${context.targetGapBelow}px for the ${context.targetGapBelow}px gap below.`);
      }
    }
  } else {
    lines.push(`  No consistent spacing mechanism detected.`);
    lines.push(`  → Reorder the JSX and set margin-top: ${Math.max(0, context.targetGapAbove)}px for the gap above.`);
    if (context.nextSibling && context.targetGapBelow >= 0) {
      lines.push(`  → Set margin-bottom: ${context.targetGapBelow}px for the gap below.`);
    }
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
      if (modification.sourceFile) {
        positionLines.push(...formatRelationalPosition(context, description));
        positionLines.push(`  Source: ${modification.sourceFile}`);
      } else {
        positionLines.push(...formatRelationalPosition(context, description));
      }

      positionLines.push(...formatSpacingInstruction(context));

      positionLines.push("");
      positionLines.push(`  Page structure:`);
      positionLines.push(...formatTreeNode(context.tree, 0, context.targetChildIndex));
      positionLines.push("");
      positionLines.push(`  Do NOT use CSS transforms. Re-order the JSX and adjust margin/padding as described above.`);
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
      "Reposition the following element in the source code:",
      "",
      ...positionLines,
    );
  }

  return sections.join("\n");
};
