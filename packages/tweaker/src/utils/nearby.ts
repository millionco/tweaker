import { DOM_TREE_MAX_NODES, TEXT_PREVIEW_MAX_LENGTH } from "../constants";
import { getSelector, getTextPreview } from "./dom";

export interface SpacingInfo {
  method: "gap" | "margin" | "padding" | "none";
  value: number;
  cssProperty: string;
  isUniform: boolean;
}

export interface TreeNode {
  selector: string;
  componentName: string | null;
  textPreview: string;
  positionY: number;
  height: number;
  isSelf: boolean;
  children: TreeNode[];
  layout: string | null;
  spacingMechanism: SpacingInfo | null;
  childIndex: number;
}

export interface SiblingInfo {
  selector: string;
  componentName: string | null;
  textPreview: string;
}

export interface RepositionContext {
  originalPositionY: number;
  newPositionY: number;
  translateX: number;
  translateY: number;
  tree: TreeNode;
  elementHeight: number;
  parentSelector: string;
  parentLayout: string | null;
  parentSpacing: SpacingInfo | null;
  originalChildIndex: number;
  targetChildIndex: number;
  previousSibling: SiblingInfo | null;
  nextSibling: SiblingInfo | null;
  targetGapAbove: number;
  targetGapBelow: number;
}

const getComponentName = (element: HTMLElement): string | null => {
  const fiberKey = Object.keys(element).find(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"),
  );
  if (!fiberKey) return null;

  let fiber = (element as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | null;
  while (fiber) {
    const fiberType = fiber.type;
    if (typeof fiberType === "function" && typeof fiberType === "function") {
      const name = (fiberType as { displayName?: string; name?: string }).displayName
        ?? (fiberType as { name?: string }).name
        ?? null;
      if (name && /^[A-Z]/.test(name)) return name;
    }
    fiber = fiber.return as Record<string, unknown> | null;
  }
  return null;
};

const detectLayout = (element: HTMLElement): string | null => {
  const computed = getComputedStyle(element);
  const display = computed.display;

  if (display.includes("flex")) {
    const direction = computed.flexDirection;
    return direction === "row" || direction === "row-reverse" ? "flex-row" : "flex-column";
  }
  if (display.includes("grid")) return "grid";
  if (display === "block" || display === "flow-root") return "block";
  return null;
};

const parsePixelValue = (value: string): number => {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
};

const detectSpacing = (parent: HTMLElement, children: HTMLElement[]): SpacingInfo | null => {
  if (children.length < 2) return null;

  const parentComputed = getComputedStyle(parent);
  const layout = detectLayout(parent);
  const isVertical = layout === "flex-column" || layout === "grid" || layout === "block";

  if (layout === "flex-column" || layout === "flex-row" || layout === "grid") {
    const gapProperty = isVertical ? "rowGap" : "columnGap";
    const gapValue = parsePixelValue(parentComputed.getPropertyValue(gapProperty === "rowGap" ? "row-gap" : "column-gap"));
    const generalGap = parsePixelValue(parentComputed.gap);
    const effectiveGap = gapValue || generalGap;

    if (effectiveGap > 0) {
      const cssPropertyName = gapValue > 0 ? (isVertical ? "row-gap" : "column-gap") : "gap";
      return {
        method: "gap",
        value: effectiveGap,
        cssProperty: cssPropertyName,
        isUniform: true,
      };
    }
  }

  const gaps: number[] = [];
  const marginProperties: string[] = [];

  for (let index = 0; index < children.length - 1; index++) {
    const currentChild = children[index];
    const nextChild = children[index + 1];
    const currentRect = currentChild.getBoundingClientRect();
    const nextRect = nextChild.getBoundingClientRect();

    if (isVertical) {
      const visualGap = nextRect.top - currentRect.bottom;
      gaps.push(Math.round(visualGap));

      const currentComputed = getComputedStyle(currentChild);
      const nextComputed = getComputedStyle(nextChild);
      const currentMarginBottom = parsePixelValue(currentComputed.marginBottom);
      const nextMarginTop = parsePixelValue(nextComputed.marginTop);

      if (currentMarginBottom > 0 && nextMarginTop > 0) {
        marginProperties.push("margin (collapsed)");
      } else if (currentMarginBottom > 0) {
        marginProperties.push("margin-bottom");
      } else if (nextMarginTop > 0) {
        marginProperties.push("margin-top");
      }
    } else {
      const visualGap = nextRect.left - currentRect.right;
      gaps.push(Math.round(visualGap));

      const currentComputed = getComputedStyle(currentChild);
      const nextComputed = getComputedStyle(nextChild);
      const currentMarginRight = parsePixelValue(currentComputed.marginRight);
      const nextMarginLeft = parsePixelValue(nextComputed.marginLeft);

      if (currentMarginRight > 0) {
        marginProperties.push("margin-right");
      } else if (nextMarginLeft > 0) {
        marginProperties.push("margin-left");
      }
    }
  }

  if (gaps.length === 0) return null;

  const allEqual = gaps.every((gap) => gap === gaps[0]);
  const dominantGap = gaps[0];

  if (marginProperties.length > 0) {
    const dominantProperty = isVertical ? "margin-bottom" : "margin-right";
    return {
      method: "margin",
      value: dominantGap,
      cssProperty: dominantProperty,
      isUniform: allEqual,
    };
  }

  const parentPaddingTop = parsePixelValue(parentComputed.paddingTop);
  const parentPaddingBottom = parsePixelValue(parentComputed.paddingBottom);
  if (parentPaddingTop > 0 || parentPaddingBottom > 0) {
    return {
      method: "padding",
      value: dominantGap,
      cssProperty: "padding",
      isUniform: allEqual,
    };
  }

  return {
    method: "none",
    value: dominantGap,
    cssProperty: "none",
    isUniform: allEqual,
  };
};

const getVisibleChildren = (parent: HTMLElement): HTMLElement[] =>
  Array.from(parent.children).filter((child): child is HTMLElement => {
    if (!(child instanceof HTMLElement)) return false;
    const computed = getComputedStyle(child);
    return computed.display !== "none" && computed.visibility !== "hidden";
  });

const buildSiblingInfo = (element: HTMLElement): SiblingInfo => ({
  selector: getSelector(element),
  componentName: getComponentName(element),
  textPreview: getTextPreview(element),
});

const buildTreeNode = (
  element: HTMLElement,
  selfElement: HTMLElement,
  depthRemaining: number,
  nodeCount: { value: number },
  childIndex: number,
): TreeNode => {
  const isSelf = element === selfElement;
  const rect = element.getBoundingClientRect();
  const positionY = Math.round(rect.top + window.scrollY);
  const height = Math.round(rect.height);
  const layout = detectLayout(element);

  const children: TreeNode[] = [];

  if (depthRemaining > 0 && nodeCount.value < DOM_TREE_MAX_NODES) {
    const visibleChildren = getVisibleChildren(element);
    for (let index = 0; index < visibleChildren.length; index++) {
      if (nodeCount.value >= DOM_TREE_MAX_NODES) break;
      nodeCount.value++;
      children.push(
        buildTreeNode(visibleChildren[index], selfElement, depthRemaining - 1, nodeCount, index),
      );
    }
  }

  const visibleChildren = getVisibleChildren(element);
  const spacingMechanism = visibleChildren.length >= 2
    ? detectSpacing(element, visibleChildren)
    : null;

  return {
    selector: getSelector(element),
    componentName: getComponentName(element),
    textPreview: getTextPreview(element),
    positionY,
    height,
    isSelf,
    children,
    layout,
    spacingMechanism,
    childIndex,
  };
};

const computeTargetChildIndex = (
  siblingRects: Array<{ top: number; bottom: number; centerY: number }>,
  originalIndex: number,
  newPositionY: number,
): number => {
  let targetIndex = 0;

  for (let index = 0; index < siblingRects.length; index++) {
    if (index === originalIndex) continue;
    if (newPositionY > siblingRects[index].centerY) {
      targetIndex = index >= originalIndex ? index : index + 1;
    }
  }

  if (newPositionY <= siblingRects[0].centerY && originalIndex !== 0) {
    targetIndex = 0;
  }

  return targetIndex;
};

export const snapToGrid = (value: number, gridSize: number): number =>
  Math.round(value / gridSize) * gridSize;

export const gatherRepositionContext = (
  element: HTMLElement,
  translateX: number,
  translateY: number,
): RepositionContext | null => {
  const parent = element.parentElement;
  if (!parent) return null;

  const savedTransform = element.style.transform;
  element.style.transform = "";

  const elementRect = element.getBoundingClientRect();
  const originalPositionY = Math.round(elementRect.top + window.scrollY);
  const elementHeight = Math.round(elementRect.height);
  const newPositionY = originalPositionY + translateY;

  element.style.transform = savedTransform;

  const parentLayout = detectLayout(parent);
  const visibleChildren = getVisibleChildren(parent);
  const parentSpacing = detectSpacing(parent, visibleChildren);
  const parentSelector = getSelector(parent);

  const originalChildIndex = visibleChildren.indexOf(element);

  const siblingRects = visibleChildren.map((child) => {
    const isTarget = child === element;
    const savedChildTransform = isTarget ? child.style.transform : "";
    if (isTarget) child.style.transform = "";

    const rect = child.getBoundingClientRect();
    const top = Math.round(rect.top + window.scrollY);
    const bottom = Math.round(rect.bottom + window.scrollY);
    const centerY = Math.round(top + (bottom - top) / 2);

    if (isTarget) child.style.transform = savedChildTransform;

    return { top, bottom, centerY };
  });

  const targetChildIndex = computeTargetChildIndex(
    siblingRects,
    originalChildIndex,
    newPositionY,
  );

  const siblingIndicesWithoutSelf = visibleChildren
    .map((child, index) => ({ child, index }))
    .filter(({ child }) => child !== element);

  let previousSibling: SiblingInfo | null = null;
  let nextSibling: SiblingInfo | null = null;

  const adjustedSiblings = siblingIndicesWithoutSelf.map(({ child }, sequenceIndex) => ({
    child,
    sequenceIndex,
  }));

  if (targetChildIndex > 0) {
    const prevIndex = Math.min(targetChildIndex - 1, adjustedSiblings.length - 1);
    if (prevIndex >= 0 && adjustedSiblings[prevIndex]) {
      previousSibling = buildSiblingInfo(adjustedSiblings[prevIndex].child);
    }
  }

  if (targetChildIndex < visibleChildren.length) {
    const nextInSequence = adjustedSiblings[targetChildIndex];
    if (nextInSequence) {
      nextSibling = buildSiblingInfo(nextInSequence.child);
    }
  }

  let targetGapAbove = 0;
  let targetGapBelow = 0;

  if (previousSibling) {
    const prevChildElement = adjustedSiblings.find(
      ({ child }) => getSelector(child) === previousSibling!.selector,
    );
    if (prevChildElement) {
      const prevRect = prevChildElement.child.getBoundingClientRect();
      const prevBottom = Math.round(prevRect.bottom + window.scrollY);
      targetGapAbove = newPositionY - prevBottom;
    }
  } else {
    const parentRect = parent.getBoundingClientRect();
    const parentTop = Math.round(parentRect.top + window.scrollY);
    const parentPaddingTop = parsePixelValue(getComputedStyle(parent).paddingTop);
    targetGapAbove = newPositionY - (parentTop + parentPaddingTop);
  }

  if (nextSibling) {
    const nextChildElement = adjustedSiblings.find(
      ({ child }) => getSelector(child) === nextSibling!.selector,
    );
    if (nextChildElement) {
      const nextRect = nextChildElement.child.getBoundingClientRect();
      const nextTop = Math.round(nextRect.top + window.scrollY);
      targetGapBelow = nextTop - (newPositionY + elementHeight);
    }
  }

  const treeRoot = parent.parentElement ?? parent;
  const nodeCount = { value: 1 };
  const treeRootIndex = treeRoot.parentElement
    ? Array.from(treeRoot.parentElement.children).indexOf(treeRoot)
    : 0;
  const tree = buildTreeNode(treeRoot, element, 3, nodeCount, treeRootIndex);

  return {
    originalPositionY,
    newPositionY,
    translateX,
    translateY,
    tree,
    elementHeight,
    parentSelector,
    parentLayout,
    parentSpacing,
    originalChildIndex,
    targetChildIndex,
    previousSibling,
    nextSibling,
    targetGapAbove,
    targetGapBelow,
  };
};
