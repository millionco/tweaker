export type OKLCH = [number, number, number];

export interface GrayScale {
  label: string;
  shades: Record<string, string>;
}

export interface ElementRectSnapshot {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Modification {
  element: HTMLElement;
  selector: string;
  componentName: string | null;
  sourceFile: string | null;
  textPreview: string;
  originalInlineBg: string;
  originalInlineColor: string;
  originalInlineBorderColor: string;
  originalInlineFontSize: string;
  originalInlinePaddingTop: string;
  originalInlinePaddingBottom: string;
  originalInlineMarginTop: string;
  originalInlineMarginBottom: string;
  property: "bg" | "text" | "border";
  position: number;
  fontSize: number;
  paddingY: number;
  translateX: number;
  translateY: number;
  originalInlineTransform: string;
  dragOriginRect: ElementRectSnapshot;
}

export interface TweakerProps {
  scales?: Record<string, GrayScale>;
  activeScale?: string;
}
