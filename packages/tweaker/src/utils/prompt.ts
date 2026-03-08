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
  const weightLines: string[] = [];

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

    const originalWeight = modification.originalInlineFontWeight
      || getComputedStyle(modification.element).fontWeight;
    const newWeight = Math.round(modification.fontWeight);
    if (String(newWeight) !== originalWeight) {
      weightLines.push(`- font-weight of ${description} → ${newWeight}`);
      if (modification.sourceFile) weightLines.push(`  Source: ${modification.sourceFile}`);
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

  if (weightLines.length > 0) {
    if (sections.length > 0) sections.push("");
    sections.push("Change the following font weights:", "", ...weightLines);
  }

  return sections.join("\n");
};
