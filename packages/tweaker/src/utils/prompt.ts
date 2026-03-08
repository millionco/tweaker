import type { GrayScale, Modification } from "../types";
import { formatOklch, getColorAtPosition, getClosestShadeLabel } from "./color";
import {
  parseTailwindPaddingClasses,
  computeNewPaddingClasses,
  replacePaddingClasses,
} from "./tailwind";

const buildDescription = (modification: Modification): string => {
  const nameParts = [modification.selector];
  if (modification.componentName) nameParts.unshift(`<${modification.componentName}>`);
  if (modification.textPreview) nameParts.push(`("${modification.textPreview}")`);
  return nameParts.join(" ");
};

const buildLocationHeader = (modification: Modification): string | null => {
  const parts: string[] = [];

  if (modification.sourceFile) {
    const filePath = modification.sourceFile;
    const lineInfo = modification.sourceLineNumber
      ? ` (line ${modification.sourceLineNumber})`
      : "";
    parts.push(`${filePath}${lineInfo}`);
  }

  if (modification.componentName) {
    parts.push(`<${modification.componentName}>`);
  }

  if (parts.length === 0) return null;
  return `In ${parts.join(", ")}`;
};

const didPaddingChange = (modification: Modification): boolean => {
  const newY = Math.round(modification.paddingY);
  const newX = Math.round(modification.paddingX);
  const topChanged = newY !== Math.round(modification.originalPaddingTop);
  const bottomChanged = newY !== Math.round(modification.originalPaddingBottom);
  const leftChanged = newX !== Math.round(modification.originalPaddingLeft);
  const rightChanged = newX !== Math.round(modification.originalPaddingRight);
  return topChanged || bottomChanged || leftChanged || rightChanged;
};

const generateTailwindPaddingBlock = (modification: Modification): string[] => {
  const parsedClasses = parseTailwindPaddingClasses(modification.fullClassName);
  if (parsedClasses.length === 0) return [];

  const newClassNames = computeNewPaddingClasses(
    parsedClasses,
    Math.round(modification.paddingY),
    Math.round(modification.paddingX),
    {
      top: modification.originalPaddingTop,
      right: modification.originalPaddingRight,
      bottom: modification.originalPaddingBottom,
      left: modification.originalPaddingLeft,
    },
  );

  const didAnyClassChange = parsedClasses.some(
    (parsed, index) => parsed.original !== newClassNames[index],
  );
  if (!didAnyClassChange) return [];

  const newFullClassName = replacePaddingClasses(
    modification.fullClassName,
    parsedClasses,
    newClassNames,
  );

  const lines: string[] = [];
  const locationHeader = buildLocationHeader(modification);
  if (locationHeader) lines.push(`${locationHeader}:`);

  lines.push(`Find:    className="${modification.fullClassName}"`);
  lines.push(`Replace: className="${newFullClassName}"`);

  const changeDetails = parsedClasses
    .map((parsed, index) => {
      if (parsed.original === newClassNames[index]) return null;
      return `${parsed.original} → ${newClassNames[index]}`;
    })
    .filter(Boolean);

  if (changeDetails.length > 0) {
    lines.push(`Changes: ${changeDetails.join(", ")}`);
  }

  return lines;
};

const generateCssRulePaddingBlock = (modification: Modification): string[] => {
  if (!modification.matchedCssRule) return [];

  const lines: string[] = [];
  const locationHeader = buildLocationHeader(modification);
  if (locationHeader) lines.push(`${locationHeader}:`);

  const newY = Math.round(modification.paddingY);
  const newX = Math.round(modification.paddingX);

  const declaration = modification.matchedCssRule.declaration;
  const unit = declaration.includes("rem") ? "rem" : declaration.includes("em") ? "em" : "px";

  const toCssValue = (px: number): string => {
    if (unit === "rem")
      return `${(px / 16).toFixed(px % 16 === 0 ? 0 : 3).replace(/\.?0+$/, "")}rem`;
    if (unit === "em") return `${(px / 16).toFixed(px % 16 === 0 ? 0 : 3).replace(/\.?0+$/, "")}em`;
    return `${px}px`;
  };

  const newDeclaration =
    newY === newX
      ? `padding: ${toCssValue(newY)}`
      : `padding: ${toCssValue(newY)} ${toCssValue(newX)}`;

  lines.push(`In CSS rule "${modification.matchedCssRule.selector}":`);
  lines.push(`Find:    ${modification.matchedCssRule.declaration}`);
  lines.push(`Replace: ${newDeclaration}`);

  return lines;
};

const generateFallbackPaddingBlock = (modification: Modification): string[] => {
  const lines: string[] = [];
  const locationHeader = buildLocationHeader(modification);
  const description = buildDescription(modification);

  if (locationHeader) {
    lines.push(`${locationHeader}:`);
    lines.push(`On ${description}:`);
  } else {
    lines.push(`On ${description}:`);
  }

  const newY = Math.round(modification.paddingY);
  const newX = Math.round(modification.paddingX);
  const originalTop = Math.round(modification.originalPaddingTop);
  const originalBottom = Math.round(modification.originalPaddingBottom);
  const originalLeft = Math.round(modification.originalPaddingLeft);
  const originalRight = Math.round(modification.originalPaddingRight);

  if (newY !== originalTop) {
    lines.push(`padding-top: ${originalTop}px → ${newY}px`);
  }
  if (newY !== originalBottom) {
    lines.push(`padding-bottom: ${originalBottom}px → ${newY}px`);
  }
  if (newX !== originalLeft) {
    lines.push(`padding-left: ${originalLeft}px → ${newX}px`);
  }
  if (newX !== originalRight) {
    lines.push(`padding-right: ${originalRight}px → ${newX}px`);
  }

  return lines;
};

const generatePaddingBlock = (modification: Modification): string[] => {
  if (!didPaddingChange(modification)) return [];

  const tailwindBlock = generateTailwindPaddingBlock(modification);
  if (tailwindBlock.length > 0) return tailwindBlock;

  const cssRuleBlock = generateCssRulePaddingBlock(modification);
  if (cssRuleBlock.length > 0) return cssRuleBlock;

  return generateFallbackPaddingBlock(modification);
};

export const generatePrompt = (
  modifications: Modification[],
  scales: Record<string, GrayScale>,
  scaleKey: string,
): string => {
  if (modifications.length === 0) return "";

  const scaleName = scales[scaleKey]?.label || scaleKey;
  const colorLines: string[] = [];
  const sizeLines: string[] = [];
  const paddingBlocks: string[][] = [];

  modifications.forEach((modification) => {
    const description = buildDescription(modification);

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

    const paddingBlock = generatePaddingBlock(modification);
    if (paddingBlock.length > 0) paddingBlocks.push(paddingBlock);
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

  if (paddingBlocks.length > 0) {
    if (sections.length > 0) sections.push("");
    sections.push("Change the following padding:");
    paddingBlocks.forEach((block) => {
      sections.push("", ...block);
    });
  }

  return sections.join("\n");
};
