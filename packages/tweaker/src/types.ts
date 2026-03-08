export type OKLCH = [number, number, number];

export interface GrayScale {
  label: string;
  shades: Record<string, string>;
}

export interface SpacingEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PromptSignal {
  label: string;
  value: string;
}

export interface ResolvedSpacingState {
  targetPadding: SpacingEdges;
  padding: SpacingEdges;
  margin: SpacingEdges;
}

export interface Modification {
  element: HTMLElement;
  selector: string;
  componentName: string | null;
  sourceFile: string | null;
  textPreview: string;
  promptSignals: PromptSignal[];
  contextHint: string | null;
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
  originalComputedBg: string;
  originalComputedColor: string;
  originalComputedBorderColor: string;
  originalComputedFontSize: number;
  originalComputedPadding: SpacingEdges;
  originalComputedMargin: SpacingEdges;
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
