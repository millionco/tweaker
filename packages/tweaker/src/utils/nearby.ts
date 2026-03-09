import { DOM_TREE_MAX_NODES } from "../constants";
import { getSelector, getTextPreview } from "./dom";

export interface TreeNode {
  selector: string;
  componentName: string | null;
  textPreview: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  isSelf: boolean;
  children: TreeNode[];
  layout: string | null;
}

export interface SiblingInfo {
  description: string;
  edgePosition: number;
}

export interface ParentLayoutInfo {
  display: string;
  flowAxis: "vertical" | "horizontal";
  flexDirection: string | null;
  gap: number;
  crossGap: number;
}

interface ElementRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface RepositionContext {
  originalPositionX: number;
  originalPositionY: number;
  newPositionX: number;
  newPositionY: number;
  translateX: number;
  translateY: number;
  elementWidth: number;
  elementHeight: number;
  originalChildIndex: number;
  insertionIndex: number;
  siblingCount: number;
  previousSibling: SiblingInfo | null;
  nextSibling: SiblingInfo | null;
  gapAbove: number;
  gapBelow: number;
  gapLeft: number;
  gapRight: number;
  existingMargin: { top: number; bottom: number; left: number; right: number };
  parentLayout: ParentLayoutInfo;
  tree: TreeNode;
}

const parsePxValue = (value: string): number => {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
};

const getOriginalRect = (
  element: HTMLElement,
  translateX: number,
  translateY: number,
): { original: ElementRect; translated: ElementRect } => {
  const currentRect = element.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  const translatedLeft = currentRect.left + scrollX;
  const translatedTop = currentRect.top + scrollY;

  const originalLeft = translatedLeft - translateX;
  const originalTop = translatedTop - translateY;

  return {
    original: {
      left: originalLeft,
      top: originalTop,
      right: originalLeft + currentRect.width,
      bottom: originalTop + currentRect.height,
      width: currentRect.width,
      height: currentRect.height,
    },
    translated: {
      left: translatedLeft,
      top: translatedTop,
      right: translatedLeft + currentRect.width,
      bottom: translatedTop + currentRect.height,
      width: currentRect.width,
      height: currentRect.height,
    },
  };
};

const detectParentLayout = (parent: HTMLElement): ParentLayoutInfo => {
  const computed = getComputedStyle(parent);
  const display = computed.display;
  const flexDirection = computed.flexDirection || null;

  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid" || display === "inline-grid";

  let flowAxis: "vertical" | "horizontal" = "vertical";
  if (isFlex) {
    const isRow = flexDirection === "row" || flexDirection === "row-reverse";
    flowAxis = isRow ? "horizontal" : "vertical";
  } else if (isGrid) {
    const autoFlow = computed.gridAutoFlow || "";
    flowAxis = autoFlow.includes("column") ? "horizontal" : "vertical";
  }

  const rowGap = parsePxValue(computed.rowGap);
  const columnGap = parsePxValue(computed.columnGap);

  const gap = flowAxis === "vertical" ? rowGap : columnGap;
  const crossGap = flowAxis === "vertical" ? columnGap : rowGap;

  const displayLabel = isFlex ? "flex" : isGrid ? "grid" : "block";

  return {
    display: displayLabel,
    flowAxis,
    flexDirection: isFlex ? flexDirection : null,
    gap,
    crossGap,
  };
};

const getReactComponentName = (element: HTMLElement): string | null => {
  const keys = Object.keys(element);
  const fiberKey = keys.find(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"),
  );
  if (!fiberKey) return null;

  let fiber = (element as unknown as Record<string, unknown>)[fiberKey] as
    | { return?: unknown; type?: unknown }
    | undefined;

  const maxDepth = 20;
  for (let depth = 0; depth < maxDepth && fiber; depth++) {
    const fiberType = fiber.type;
    if (typeof fiberType === "function") {
      const name =
        (fiberType as { displayName?: string }).displayName ||
        (fiberType as { name?: string }).name;
      if (name && /^[A-Z]/.test(name)) return name;
    }
    fiber = fiber.return as typeof fiber | undefined;
  }

  return null;
};

const describeElement = (element: HTMLElement): string => {
  const parts: string[] = [];
  const componentName = getReactComponentName(element);
  if (componentName) parts.push(`<${componentName}>`);
  parts.push(getSelector(element));
  const textPreview = getTextPreview(element);
  if (textPreview && element.children.length === 0) {
    parts.push(`("${textPreview}")`);
  }
  return parts.join(" ");
};

const getAbsoluteRect = (element: HTMLElement): ElementRect => {
  const domRect = element.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  return {
    left: domRect.left + scrollX,
    top: domRect.top + scrollY,
    right: domRect.right + scrollX,
    bottom: domRect.bottom + scrollY,
    width: domRect.width,
    height: domRect.height,
  };
};

const getParentContentEdges = (parent: HTMLElement): ElementRect => {
  const parentRect = getAbsoluteRect(parent);
  const computed = getComputedStyle(parent);
  const paddingTop = parsePxValue(computed.paddingTop);
  const paddingBottom = parsePxValue(computed.paddingBottom);
  const paddingLeft = parsePxValue(computed.paddingLeft);
  const paddingRight = parsePxValue(computed.paddingRight);
  return {
    left: parentRect.left + paddingLeft,
    top: parentRect.top + paddingTop,
    right: parentRect.right - paddingRight,
    bottom: parentRect.bottom - paddingBottom,
    width: parentRect.width - paddingLeft - paddingRight,
    height: parentRect.height - paddingTop - paddingBottom,
  };
};

interface SiblingEntry {
  element: HTMLElement;
  rect: ElementRect;
  isSelf: boolean;
}

const buildTreeNode = (
  element: HTMLElement,
  selfElement: HTMLElement,
  depth: number,
  nodeCount: { current: number },
): TreeNode | null => {
  if (nodeCount.current >= DOM_TREE_MAX_NODES) return null;
  nodeCount.current++;

  const rect = getAbsoluteRect(element);
  const children: TreeNode[] = [];

  if (depth < 3) {
    for (const child of Array.from(element.children)) {
      if (nodeCount.current >= DOM_TREE_MAX_NODES) break;
      const childNode = buildTreeNode(child as HTMLElement, selfElement, depth + 1, nodeCount);
      if (childNode) children.push(childNode);
    }
  }

  const layoutInfo = children.length > 0 ? detectParentLayout(element) : null;

  return {
    selector: getSelector(element),
    componentName: getReactComponentName(element),
    textPreview: getTextPreview(element),
    positionX: Math.round(rect.left),
    positionY: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    isSelf: element === selfElement,
    children,
    layout: layoutInfo
      ? `${layoutInfo.display}${layoutInfo.flexDirection ? `-${layoutInfo.flowAxis === "horizontal" ? "row" : "column"}` : ""}`
      : null,
  };
};

const findInsertionIndex = (
  siblings: SiblingEntry[],
  newRect: ElementRect,
  flowAxis: "vertical" | "horizontal",
): {
  insertionIndex: number;
  previousSibling: SiblingEntry | null;
  nextSibling: SiblingEntry | null;
} => {
  const otherSiblings = siblings.filter((sibling) => !sibling.isSelf);
  const newCenter =
    flowAxis === "vertical" ? newRect.top + newRect.height / 2 : newRect.left + newRect.width / 2;

  let insertionIndex = otherSiblings.length;
  let previousSibling: SiblingEntry | null = null;
  let nextSibling: SiblingEntry | null = null;

  for (let index = 0; index < otherSiblings.length; index++) {
    const siblingRect = otherSiblings[index].rect;
    const siblingCenter =
      flowAxis === "vertical"
        ? siblingRect.top + siblingRect.height / 2
        : siblingRect.left + siblingRect.width / 2;

    if (newCenter < siblingCenter) {
      insertionIndex = index;
      nextSibling = otherSiblings[index];
      previousSibling = index > 0 ? otherSiblings[index - 1] : null;
      break;
    }
  }

  if (insertionIndex === otherSiblings.length && otherSiblings.length > 0) {
    previousSibling = otherSiblings[otherSiblings.length - 1];
    nextSibling = null;
  }

  return { insertionIndex, previousSibling, nextSibling };
};

const computeGaps = (
  newRect: ElementRect,
  parentContentEdges: ElementRect,
  previousSibling: SiblingEntry | null,
  nextSibling: SiblingEntry | null,
): { gapAbove: number; gapBelow: number; gapLeft: number; gapRight: number } => {
  const gapAbove = previousSibling
    ? Math.round(newRect.top - previousSibling.rect.bottom)
    : Math.round(newRect.top - parentContentEdges.top);

  const gapBelow = nextSibling
    ? Math.round(nextSibling.rect.top - newRect.bottom)
    : Math.round(parentContentEdges.bottom - newRect.bottom);

  const gapLeft = previousSibling
    ? Math.round(newRect.left - previousSibling.rect.right)
    : Math.round(newRect.left - parentContentEdges.left);

  const gapRight = nextSibling
    ? Math.round(nextSibling.rect.left - newRect.right)
    : Math.round(parentContentEdges.right - newRect.right);

  return { gapAbove, gapBelow, gapLeft, gapRight };
};

export const gatherRepositionContext = (
  element: HTMLElement,
  translateX: number,
  translateY: number,
): RepositionContext | null => {
  const parent = element.parentElement;
  if (!parent) return null;

  const { original: originalRect, translated: newRect } = getOriginalRect(
    element,
    translateX,
    translateY,
  );

  const parentLayout = detectParentLayout(parent);
  const parentContentEdges = getParentContentEdges(parent);

  const siblings: SiblingEntry[] = [];
  let originalChildIndex = -1;
  const directChildren = Array.from(parent.children) as HTMLElement[];

  for (let index = 0; index < directChildren.length; index++) {
    const child = directChildren[index];
    const isSelf = child === element;
    if (isSelf) originalChildIndex = index;
    siblings.push({
      element: child,
      rect: isSelf ? originalRect : getAbsoluteRect(child),
      isSelf,
    });
  }

  const { insertionIndex, previousSibling, nextSibling } = findInsertionIndex(
    siblings,
    newRect,
    parentLayout.flowAxis,
  );

  const { gapAbove, gapBelow, gapLeft, gapRight } = computeGaps(
    newRect,
    parentContentEdges,
    previousSibling,
    nextSibling,
  );

  const computed = getComputedStyle(element);
  const existingMargin = {
    top: parsePxValue(computed.marginTop),
    bottom: parsePxValue(computed.marginBottom),
    left: parsePxValue(computed.marginLeft),
    right: parsePxValue(computed.marginRight),
  };

  const previousSiblingInfo: SiblingInfo | null = previousSibling
    ? {
        description: describeElement(previousSibling.element),
        edgePosition:
          parentLayout.flowAxis === "vertical"
            ? Math.round(previousSibling.rect.bottom)
            : Math.round(previousSibling.rect.right),
      }
    : null;

  const nextSiblingInfo: SiblingInfo | null = nextSibling
    ? {
        description: describeElement(nextSibling.element),
        edgePosition:
          parentLayout.flowAxis === "vertical"
            ? Math.round(nextSibling.rect.top)
            : Math.round(nextSibling.rect.left),
      }
    : null;

  const nodeCount = { current: 0 };
  const tree = buildTreeNode(parent, element, 0, nodeCount);
  if (!tree) return null;

  return {
    originalPositionX: Math.round(originalRect.left),
    originalPositionY: Math.round(originalRect.top),
    newPositionX: Math.round(newRect.left),
    newPositionY: Math.round(newRect.top),
    translateX,
    translateY,
    elementWidth: Math.round(originalRect.width),
    elementHeight: Math.round(originalRect.height),
    originalChildIndex,
    insertionIndex,
    siblingCount: siblings.length - 1,
    previousSibling: previousSiblingInfo,
    nextSibling: nextSiblingInfo,
    gapAbove,
    gapBelow,
    gapLeft,
    gapRight,
    existingMargin,
    parentLayout,
    tree,
  };
};
