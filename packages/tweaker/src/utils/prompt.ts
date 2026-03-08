import type { GrayScale, Modification } from "../types";
import { formatOklch, getColorAtPosition, getClosestShadeLabel } from "./color";

export const generatePrompt = (
  modifications: Modification[],
  scales: Record<string, GrayScale>,
  scaleKey: string,
): string => {
  if (modifications.length === 0) return "";

  const scaleName = scales[scaleKey]?.label || scaleKey;
  const lines: string[] = [];

  modifications.forEach((modification) => {
    const shade = getClosestShadeLabel(modification.position);
    const oklch = getColorAtPosition(scales, scaleKey, modification.position);
    const nameParts = [modification.selector];
    if (modification.componentName) nameParts.unshift(`<${modification.componentName}>`);
    if (modification.textPreview) nameParts.push(`("${modification.textPreview}")`);
    const description = nameParts.join(" ");
    const property =
      modification.property === "bg"
        ? "background color"
        : modification.property === "text"
          ? "text color"
          : "border color";
    lines.push(`- ${property} of ${description} → ${scaleName} ${shade} (${formatOklch(oklch)})`);
    if (modification.sourceFile) lines.push(`  Source: ${modification.sourceFile}`);
  });

  return [
    "Change the following colors using the design system's gray scale:",
    "",
    ...lines,
  ].join("\n");
};
