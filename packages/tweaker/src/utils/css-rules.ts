import type { CssRuleMatch } from "../types";

const PADDING_PROPERTIES = [
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "padding-block",
  "padding-inline",
] as const;

const hasPaddingDeclaration = (style: CSSStyleDeclaration): boolean =>
  PADDING_PROPERTIES.some((property) => style.getPropertyValue(property) !== "");

const buildPaddingDeclaration = (style: CSSStyleDeclaration): string => {
  const shorthand = style.getPropertyValue("padding");
  if (shorthand) return `padding: ${shorthand}`;

  const parts: string[] = [];
  for (const property of PADDING_PROPERTIES) {
    const value = style.getPropertyValue(property);
    if (value) parts.push(`${property}: ${value}`);
  }
  return parts.join("; ");
};

export const getMatchedPaddingRule = (element: HTMLElement): CssRuleMatch | null => {
  let bestMatch: CssRuleMatch | null = null;

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;

      try {
        if (!element.matches(rule.selectorText)) continue;
      } catch {
        continue;
      }

      if (!hasPaddingDeclaration(rule.style)) continue;

      bestMatch = {
        selector: rule.selectorText,
        declaration: buildPaddingDeclaration(rule.style),
      };
    }
  }

  return bestMatch;
};
