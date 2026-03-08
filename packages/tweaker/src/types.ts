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
  property: "bg" | "text" | "border";
  position: number;
}

export interface TweakerProps {
  scales?: Record<string, GrayScale>;
  activeScale?: string;
}
