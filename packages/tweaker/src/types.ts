export type OKLCH = [number, number, number];

export interface GrayScale {
  label: string;
  shades: Record<string, string>;
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
  originalInlinePaddingLeft: string;
  originalInlinePaddingRight: string;
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
