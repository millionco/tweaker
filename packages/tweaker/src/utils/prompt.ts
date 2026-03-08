import type { GrayScale, Modification } from "../types";
import { formatOklch, getColorAtPosition, getClosestShadeLabel } from "./color";

export const generatePrompt = (
  modifications: Modification[],
  scales: Record<string, GrayScale>,
  scaleKey: string,
): string => {
  if (modifications.length === 0) return "";

  const scaleName = scales[scaleKey]?.label || scaleKey;
  const colorLines: string[] = [];
  const sizeLines: string[] = [];
  const paddingLines: string[] = [];

  modifications.forEach((modification) => {
    const nameParts = [modification.selector];
    if (modification.componentName) nameParts.unshift(`<${modification.componentName}>`);
    if (modification.textPreview) nameParts.push(`("${modification.textPreview}")`);
    const description = nameParts.join(" ");

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

    const originalSize = modification.originalInlineFontSize
      || getComputedStyle(modification.element).fontSize;
    const newSize = Math.round(modification.fontSize);
    if (`${newSize}px` !== originalSize) {
      sizeLines.push(`- font-size of ${description} → ${newSize}px`);
      if (modification.sourceFile) sizeLines.push(`  Source: ${modification.sourceFile}`);
    }

    const originalPaddingY = parseFloat(getComputedStyle(modification.element).paddingTop) || 0;
    const originalPaddingX = parseFloat(getComputedStyle(modification.element).paddingLeft) || 0;
    const newPaddingY = Math.round(modification.paddingY);
    const newPaddingX = Math.round(modification.paddingX);
    if (newPaddingY !== Math.round(originalPaddingY) || newPaddingX !== Math.round(originalPaddingX)) {
      paddingLines.push(`- padding of ${description} → ${newPaddingY}px ${newPaddingX}px`);
      if (modification.sourceFile) paddingLines.push(`  Source: ${modification.sourceFile}`);
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

  return sections.join("\n");
};
