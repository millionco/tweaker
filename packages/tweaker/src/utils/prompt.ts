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

    sizeLines.push(`- font-size of ${description} → ${modification.fontSize}px`);
    if (modification.sourceFile) sizeLines.push(`  Source: ${modification.sourceFile}`);

    paddingLines.push(`- padding of ${description} → ${Math.round(modification.paddingY)}px ${Math.round(modification.paddingX)}px`);
    if (modification.sourceFile) paddingLines.push(`  Source: ${modification.sourceFile}`);
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
