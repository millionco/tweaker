export type OKLCH = [number, number, number];

export interface GrayScale {
  label: string;
  shades: Record<string, string>;
}

export interface CssRuleMatch {
  selector: string;
  declaration: string;
}

export interface Modification {
  element: HTMLElement;
  selector: string;
  componentName: string | null;
  sourceFile: string | null;
  sourceLineNumber: number | null;
  textPreview: string;
  fullClassName: string;
  tailwindPaddingClasses: string[];
  matchedCssRule: CssRuleMatch | null;
  originalInlineBg: string;
  originalInlineColor: string;
  originalInlineBorderColor: string;
  originalInlineFontSize: string;
  originalInlinePaddingTop: string;
  originalInlinePaddingBottom: string;
  originalInlinePaddingLeft: string;
  originalInlinePaddingRight: string;
  originalInlineMarginTop: string;
  originalInlineMarginBottom: string;
  originalInlineMarginLeft: string;
  originalInlineMarginRight: string;
  originalPaddingTop: number;
  originalPaddingRight: number;
  originalPaddingBottom: number;
  originalPaddingLeft: number;
  property: "bg" | "text" | "border";
  position: number;
  fontSize: number;
  paddingX: number;
  paddingY: number;
}

export interface TweakerProps {
  scales?: Record<string, GrayScale>;
  activeScale?: string;
}
