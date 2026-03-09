export interface DraggedElement {
  element: HTMLElement;
  selector: string;
  componentName: string | null;
  sourceFile: string | null;
  textPreview: string;
  originalInlineTranslate: string;
  translateX: number;
  translateY: number;
}

export interface ElementSourceMetadata {
  componentName: string | null;
  sourceFile: string | null;
}

export interface TweakerProps {}
