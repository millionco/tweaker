import type { ElementRectSnapshot } from "../types";
import { DOM_TREE_MAX_NODES } from "../constants";
import { getSelector, getTextPreview } from "./dom";

export interface ElementSummary {
  selector: string;
  componentName: string | null;
  textPreview: string;
}

export interface MeasuredRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface ParentLayoutInfo {
  display: string;
  flowAxis: "vertical" | "horizontal";
  flexDirection: string | null;
  gap: number;
  crossGap: number;
}

export interface ParentSpacingInfo {
  method: "gap" | "margin" | "padding" | "none";
  cssProperty: string;
  value: number;
  isUniform: boolean;
}

export interface SiblingInfo extends ElementSummary {
  childIndex: number;
}

export interface TreeNode {
  selector: string;
  componentName: string | null;
  textPreview: string;
  childIndex: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  isSelf: boolean;
  layout: string | null;
  spacing: string | null;
  children: TreeNode[];
}

export interface RepositionContext {
  originalRect: MeasuredRect;
  targetRect: MeasuredRect;
  translateX: number;
  translateY: number;
  originalParent: ElementSummary | null;
  targetParent: ElementSummary;
  didChangeParent: boolean;
  originalChildIndex: number;
  targetChildIndex: number;
  targetSiblingCount: number;
  previousSibling: SiblingInfo | null;
  nextSibling: SiblingInfo | null;
  gapBefore: number;
  gapAfter: number;
  crossAxisInsetStart: number;
  crossAxisInsetEnd: number;
  parentLayout: ParentLayoutInfo;
  parentSpacing: ParentSpacingInfo | null;
  parentContentRect: MeasuredRect;
  tree: TreeNode;
}

interface ChildEntry {
  element: HTMLElement;
  rect: MeasuredRect;
  childIndex: number;
}

interface ParentCandidate {
  element: HTMLElement;
  contentRect: MeasuredRect;
  childEntries: ChildEntry[];
  targetChildIndex: number;
  previousSiblingEntry: ChildEntry | null;
  nextSiblingEntry: ChildEntry | null;
  gapBefore: number;
  gapAfter: number;
  crossAxisInsetStart: number;
  crossAxisInsetEnd: number;
  score: number;
  parentLayout: ParentLayoutInfo;
  parentSpacing: ParentSpacingInfo | null;
}

const parsePixelValue = (value: string): number => {
  const parsedValue = Number.parseFloat(value);
  return Number.isNaN(parsedValue) ? 0 : parsedValue;
};

const createMeasuredRect = (
  left: number,
  top: number,
  width: number,
  height: number,
): MeasuredRect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  centerX: left + width / 2,
  centerY: top + height / 2,
});

const getAbsoluteRect = (element: HTMLElement): MeasuredRect => {
  const elementRect = element.getBoundingClientRect();
  return createMeasuredRect(
    elementRect.left + window.scrollX,
    elementRect.top + window.scrollY,
    elementRect.width,
    elementRect.height,
  );
};

const translateRect = (
  originalRect: ElementRectSnapshot,
  translateX: number,
  translateY: number,
): MeasuredRect =>
  createMeasuredRect(
    originalRect.left + translateX,
    originalRect.top + translateY,
    originalRect.width,
    originalRect.height,
  );

const getReactComponentName = (element: HTMLElement): string | null => {
  const fiberKey = Object.keys(element).find(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"),
  );
  if (!fiberKey) return null;

  let currentFiber: unknown = Reflect.get(element, fiberKey);

  for (let depth = 0; depth < 20; depth++) {
    if (!currentFiber || typeof currentFiber !== "object") return null;

    const fiberType = Reflect.get(currentFiber, "type");
    if (typeof fiberType === "function") {
      const displayNameValue = Reflect.get(fiberType, "displayName");
      const functionNameValue = Reflect.get(fiberType, "name");
      const componentName =
        typeof displayNameValue === "string"
          ? displayNameValue
          : typeof functionNameValue === "string"
            ? functionNameValue
            : null;
      if (componentName && /^[A-Z]/.test(componentName)) return componentName;
    }

    currentFiber = Reflect.get(currentFiber, "return");
  }

  return null;
};

const buildElementSummary = (element: HTMLElement): ElementSummary => ({
  selector: getSelector(element),
  componentName: getReactComponentName(element),
  textPreview: getTextPreview(element),
});

const getVisibleChildren = (parent: HTMLElement): HTMLElement[] =>
  Array.from(parent.children).filter((child): child is HTMLElement => {
    if (!(child instanceof HTMLElement)) return false;
    if (child.dataset.tweaker !== undefined) return false;
    const computedStyle = getComputedStyle(child);
    return computedStyle.display !== "none" && computedStyle.visibility !== "hidden";
  });

const detectParentLayout = (parent: HTMLElement): ParentLayoutInfo => {
  const computedStyle = getComputedStyle(parent);
  const displayValue = computedStyle.display;
  const flexDirection =
    displayValue === "flex" || displayValue === "inline-flex" ? computedStyle.flexDirection : null;

  if (displayValue === "flex" || displayValue === "inline-flex") {
    const isHorizontalFlow = flexDirection === "row" || flexDirection === "row-reverse";
    return {
      display: "flex",
      flowAxis: isHorizontalFlow ? "horizontal" : "vertical",
      flexDirection,
      gap:
        parsePixelValue(isHorizontalFlow ? computedStyle.columnGap : computedStyle.rowGap) ||
        parsePixelValue(computedStyle.gap),
      crossGap: parsePixelValue(isHorizontalFlow ? computedStyle.rowGap : computedStyle.columnGap),
    };
  }

  if (displayValue === "grid" || displayValue === "inline-grid") {
    const gridAutoFlow = computedStyle.gridAutoFlow;
    const isHorizontalFlow = gridAutoFlow.includes("column");
    return {
      display: "grid",
      flowAxis: isHorizontalFlow ? "horizontal" : "vertical",
      flexDirection: null,
      gap:
        parsePixelValue(isHorizontalFlow ? computedStyle.columnGap : computedStyle.rowGap) ||
        parsePixelValue(computedStyle.gap),
      crossGap: parsePixelValue(isHorizontalFlow ? computedStyle.rowGap : computedStyle.columnGap),
    };
  }

  return {
    display: displayValue === "flow-root" ? "flow-root" : "block",
    flowAxis: "vertical",
    flexDirection: null,
    gap: 0,
    crossGap: 0,
  };
};

const getParentContentRect = (parent: HTMLElement): MeasuredRect => {
  const borderBoxRect = getAbsoluteRect(parent);
  const computedStyle = getComputedStyle(parent);

  const insetLeft =
    parsePixelValue(computedStyle.borderLeftWidth) + parsePixelValue(computedStyle.paddingLeft);
  const insetTop =
    parsePixelValue(computedStyle.borderTopWidth) + parsePixelValue(computedStyle.paddingTop);
  const insetRight =
    parsePixelValue(computedStyle.borderRightWidth) + parsePixelValue(computedStyle.paddingRight);
  const insetBottom =
    parsePixelValue(computedStyle.borderBottomWidth) + parsePixelValue(computedStyle.paddingBottom);

  return createMeasuredRect(
    borderBoxRect.left + insetLeft,
    borderBoxRect.top + insetTop,
    Math.max(0, borderBoxRect.width - insetLeft - insetRight),
    Math.max(0, borderBoxRect.height - insetTop - insetBottom),
  );
};

const getMainAxisStart = (rect: MeasuredRect, flowAxis: "vertical" | "horizontal"): number =>
  flowAxis === "vertical" ? rect.top : rect.left;

const getMainAxisEnd = (rect: MeasuredRect, flowAxis: "vertical" | "horizontal"): number =>
  flowAxis === "vertical" ? rect.bottom : rect.right;

const getMainAxisCenter = (rect: MeasuredRect, flowAxis: "vertical" | "horizontal"): number =>
  flowAxis === "vertical" ? rect.centerY : rect.centerX;

const getCrossAxisStart = (rect: MeasuredRect, flowAxis: "vertical" | "horizontal"): number =>
  flowAxis === "vertical" ? rect.left : rect.top;

const getCrossAxisEnd = (rect: MeasuredRect, flowAxis: "vertical" | "horizontal"): number =>
  flowAxis === "vertical" ? rect.right : rect.bottom;

const getCrossAxisCenter = (rect: MeasuredRect, flowAxis: "vertical" | "horizontal"): number =>
  flowAxis === "vertical" ? rect.centerX : rect.centerY;

const getOverlapSize = (
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): number => Math.max(0, Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart));

const computeOverlapArea = (firstRect: MeasuredRect, secondRect: MeasuredRect): number =>
  getOverlapSize(firstRect.left, firstRect.right, secondRect.left, secondRect.right) *
  getOverlapSize(firstRect.top, firstRect.bottom, secondRect.top, secondRect.bottom);

const isPointInsideRect = (rect: MeasuredRect, x: number, y: number): boolean =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

const getCrossAxisOverflow = (
  targetRect: MeasuredRect,
  contentRect: MeasuredRect,
  flowAxis: "vertical" | "horizontal",
): number => {
  const crossAxisStartOverflow = Math.max(
    0,
    getCrossAxisStart(contentRect, flowAxis) - getCrossAxisStart(targetRect, flowAxis),
  );
  const crossAxisEndOverflow = Math.max(
    0,
    getCrossAxisEnd(targetRect, flowAxis) - getCrossAxisEnd(contentRect, flowAxis),
  );
  return crossAxisStartOverflow + crossAxisEndOverflow;
};

const buildTreeNode = (
  element: HTMLElement,
  selfElement: HTMLElement,
  depthRemaining: number,
  nodeCount: { current: number },
  childIndex: number,
): TreeNode | null => {
  if (nodeCount.current >= DOM_TREE_MAX_NODES) return null;
  nodeCount.current += 1;

  const rect = getAbsoluteRect(element);
  const visibleChildren = getVisibleChildren(element);
  const parentLayout = visibleChildren.length > 0 ? detectParentLayout(element) : null;
  const parentSpacing =
    visibleChildren.length > 1 && parentLayout
      ? detectParentSpacing(element, visibleChildren, parentLayout)
      : null;

  const children: TreeNode[] = [];

  if (depthRemaining > 0) {
    for (let index = 0; index < visibleChildren.length; index++) {
      if (nodeCount.current >= DOM_TREE_MAX_NODES) break;
      const childTreeNode = buildTreeNode(
        visibleChildren[index],
        selfElement,
        depthRemaining - 1,
        nodeCount,
        index,
      );
      if (childTreeNode) children.push(childTreeNode);
    }
  }

  return {
    selector: getSelector(element),
    componentName: getReactComponentName(element),
    textPreview: getTextPreview(element),
    childIndex,
    positionX: Math.round(rect.left),
    positionY: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    isSelf: element === selfElement,
    layout: parentLayout
      ? `${parentLayout.display}${parentLayout.flexDirection ? `-${parentLayout.flowAxis}` : ""}`
      : null,
    spacing: parentSpacing
      ? `${parentSpacing.method}:${parentSpacing.cssProperty}:${Math.round(parentSpacing.value)}px`
      : null,
    children,
  };
};

const detectParentSpacing = (
  parent: HTMLElement,
  childElements: HTMLElement[],
  parentLayout: ParentLayoutInfo,
): ParentSpacingInfo | null => {
  if (parentLayout.gap > 0) {
    return {
      method: "gap",
      cssProperty: parentLayout.flowAxis === "vertical" ? "row-gap" : "column-gap",
      value: Math.round(parentLayout.gap),
      isUniform: true,
    };
  }

  if (childElements.length < 2) {
    const computedStyle = getComputedStyle(parent);
    const hasPadding =
      parentLayout.flowAxis === "vertical"
        ? parsePixelValue(computedStyle.paddingTop) > 0 ||
          parsePixelValue(computedStyle.paddingBottom) > 0
        : parsePixelValue(computedStyle.paddingLeft) > 0 ||
          parsePixelValue(computedStyle.paddingRight) > 0;
    if (!hasPadding) return null;
    return {
      method: "padding",
      cssProperty: "padding",
      value: 0,
      isUniform: false,
    };
  }

  const mainAxisGapValues: number[] = [];
  let hasMainAxisMargins = false;

  for (let index = 0; index < childElements.length - 1; index++) {
    const currentChild = childElements[index];
    const nextChild = childElements[index + 1];
    const currentRect = getAbsoluteRect(currentChild);
    const nextRect = getAbsoluteRect(nextChild);

    const mainAxisGap =
      getMainAxisStart(nextRect, parentLayout.flowAxis) -
      getMainAxisEnd(currentRect, parentLayout.flowAxis);
    mainAxisGapValues.push(Math.round(mainAxisGap));

    const currentStyle = getComputedStyle(currentChild);
    const nextStyle = getComputedStyle(nextChild);

    if (parentLayout.flowAxis === "vertical") {
      hasMainAxisMargins =
        hasMainAxisMargins ||
        parsePixelValue(currentStyle.marginBottom) > 0 ||
        parsePixelValue(nextStyle.marginTop) > 0;
    } else {
      hasMainAxisMargins =
        hasMainAxisMargins ||
        parsePixelValue(currentStyle.marginRight) > 0 ||
        parsePixelValue(nextStyle.marginLeft) > 0;
    }
  }

  if (mainAxisGapValues.length > 0 && hasMainAxisMargins) {
    const firstGapValue = mainAxisGapValues[0];
    const isUniform = mainAxisGapValues.every((gapValue) => gapValue === firstGapValue);
    return {
      method: "margin",
      cssProperty:
        parentLayout.flowAxis === "vertical"
          ? "margin-top / margin-bottom"
          : "margin-left / margin-right",
      value: firstGapValue,
      isUniform,
    };
  }

  const computedStyle = getComputedStyle(parent);
  const hasPadding =
    parentLayout.flowAxis === "vertical"
      ? parsePixelValue(computedStyle.paddingTop) > 0 ||
        parsePixelValue(computedStyle.paddingBottom) > 0
      : parsePixelValue(computedStyle.paddingLeft) > 0 ||
        parsePixelValue(computedStyle.paddingRight) > 0;

  if (hasPadding) {
    return {
      method: "padding",
      cssProperty: "padding",
      value: 0,
      isUniform: false,
    };
  }

  if (mainAxisGapValues.length === 0) return null;

  const firstGapValue = mainAxisGapValues[0];
  return {
    method: "none",
    cssProperty: "none",
    value: firstGapValue,
    isUniform: mainAxisGapValues.every((gapValue) => gapValue === firstGapValue),
  };
};

const buildCandidateParents = (
  element: HTMLElement,
  originalParent: HTMLElement,
  targetRect: MeasuredRect,
): HTMLElement[] => {
  const candidateElements: HTMLElement[] = [];
  const seenCandidates = new Set<HTMLElement>();

  const addCandidateElement = (candidateElement: HTMLElement | null) => {
    let currentElement = candidateElement;
    while (currentElement && !seenCandidates.has(currentElement)) {
      if (!currentElement.closest("[data-tweaker]")) {
        seenCandidates.add(currentElement);
        candidateElements.push(currentElement);
      }
      currentElement = currentElement.parentElement;
    }
  };

  const viewportPointX = Math.max(
    0,
    Math.min(window.innerWidth - 1, Math.round(targetRect.centerX - window.scrollX)),
  );
  const viewportPointY = Math.max(
    0,
    Math.min(window.innerHeight - 1, Math.round(targetRect.centerY - window.scrollY)),
  );

  for (const stackedElement of document.elementsFromPoint(viewportPointX, viewportPointY)) {
    if (!(stackedElement instanceof HTMLElement)) continue;
    if (stackedElement === element) continue;
    if (element.contains(stackedElement)) continue;
    addCandidateElement(stackedElement);
  }

  addCandidateElement(originalParent);

  return candidateElements.filter((candidateElement) => {
    if (candidateElement === element) return false;
    if (element.contains(candidateElement)) return false;
    if (candidateElement.closest("[data-tweaker]")) return false;
    return candidateElement.childElementCount > 0 || candidateElement === originalParent;
  });
};

const getDomDepth = (element: HTMLElement): number => {
  let depth = 0;
  let currentElement: HTMLElement | null = element;
  while (currentElement) {
    depth += 1;
    currentElement = currentElement.parentElement;
  }
  return depth;
};

export const measureInsertionIndex = (
  targetRect: MeasuredRect,
  contentRect: MeasuredRect,
  childRects: MeasuredRect[],
  flowAxis: "vertical" | "horizontal",
): number => {
  const targetMainAxisCenter = getMainAxisCenter(targetRect, flowAxis);
  const targetCrossAxisCenter = getCrossAxisCenter(targetRect, flowAxis);
  const contentCrossAxisStart = getCrossAxisStart(contentRect, flowAxis);
  const contentCrossAxisEnd = getCrossAxisEnd(contentRect, flowAxis);
  const contentCrossAxisCenter = (contentCrossAxisStart + contentCrossAxisEnd) / 2;

  let bestSlotIndex = 0;
  let bestSlotScore = Number.POSITIVE_INFINITY;

  for (let slotIndex = 0; slotIndex <= childRects.length; slotIndex++) {
    const previousSiblingRect = slotIndex > 0 ? childRects[slotIndex - 1] : null;
    const nextSiblingRect = slotIndex < childRects.length ? childRects[slotIndex] : null;

    const slotMainAxisStart = previousSiblingRect
      ? getMainAxisEnd(previousSiblingRect, flowAxis)
      : getMainAxisStart(contentRect, flowAxis);
    const slotMainAxisEnd = nextSiblingRect
      ? getMainAxisStart(nextSiblingRect, flowAxis)
      : getMainAxisEnd(contentRect, flowAxis);
    const slotMainAxisCenter = (slotMainAxisStart + slotMainAxisEnd) / 2;

    const crossAxisDistanceFromBounds =
      targetCrossAxisCenter < contentCrossAxisStart
        ? contentCrossAxisStart - targetCrossAxisCenter
        : targetCrossAxisCenter > contentCrossAxisEnd
          ? targetCrossAxisCenter - contentCrossAxisEnd
          : 0;

    const slotScore =
      Math.abs(targetMainAxisCenter - slotMainAxisCenter) +
      crossAxisDistanceFromBounds * 2 +
      Math.abs(targetCrossAxisCenter - contentCrossAxisCenter) / 8;

    if (slotScore < bestSlotScore) {
      bestSlotScore = slotScore;
      bestSlotIndex = slotIndex;
    }
  }

  return bestSlotIndex;
};

const measureInsertionSlot = (
  targetRect: MeasuredRect,
  contentRect: MeasuredRect,
  childEntries: ChildEntry[],
  flowAxis: "vertical" | "horizontal",
): {
  targetChildIndex: number;
  previousSiblingEntry: ChildEntry | null;
  nextSiblingEntry: ChildEntry | null;
  score: number;
} => {
  const bestSlotIndex = measureInsertionIndex(
    targetRect,
    contentRect,
    childEntries.map((childEntry) => childEntry.rect),
    flowAxis,
  );
  const previousSiblingEntry = bestSlotIndex > 0 ? childEntries[bestSlotIndex - 1] : null;
  const nextSiblingEntry = bestSlotIndex < childEntries.length ? childEntries[bestSlotIndex] : null;
  const slotMainAxisStart = previousSiblingEntry
    ? getMainAxisEnd(previousSiblingEntry.rect, flowAxis)
    : getMainAxisStart(contentRect, flowAxis);
  const slotMainAxisEnd = nextSiblingEntry
    ? getMainAxisStart(nextSiblingEntry.rect, flowAxis)
    : getMainAxisEnd(contentRect, flowAxis);

  return {
    targetChildIndex: bestSlotIndex,
    previousSiblingEntry,
    nextSiblingEntry,
    score: Math.abs(
      getMainAxisCenter(targetRect, flowAxis) - (slotMainAxisStart + slotMainAxisEnd) / 2,
    ),
  };
};

const buildParentCandidate = (
  candidateParent: HTMLElement,
  draggedElement: HTMLElement,
  originalParent: HTMLElement,
  targetRect: MeasuredRect,
): ParentCandidate | null => {
  const parentLayout = detectParentLayout(candidateParent);
  const contentRect = getParentContentRect(candidateParent);
  if (contentRect.width <= 0 || contentRect.height <= 0) return null;

  const visibleChildElements = getVisibleChildren(candidateParent).filter(
    (childElement) => childElement !== draggedElement,
  );
  const childEntries = visibleChildElements.map((childElement, childIndex) => ({
    element: childElement,
    rect: getAbsoluteRect(childElement),
    childIndex,
  }));

  const {
    targetChildIndex,
    previousSiblingEntry,
    nextSiblingEntry,
    score: insertionScore,
  } = measureInsertionSlot(targetRect, contentRect, childEntries, parentLayout.flowAxis);

  const gapBefore = Math.round(
    getMainAxisStart(targetRect, parentLayout.flowAxis) -
      (previousSiblingEntry
        ? getMainAxisEnd(previousSiblingEntry.rect, parentLayout.flowAxis)
        : getMainAxisStart(contentRect, parentLayout.flowAxis)),
  );
  const gapAfter = Math.round(
    (nextSiblingEntry
      ? getMainAxisStart(nextSiblingEntry.rect, parentLayout.flowAxis)
      : getMainAxisEnd(contentRect, parentLayout.flowAxis)) -
      getMainAxisEnd(targetRect, parentLayout.flowAxis),
  );

  const crossAxisInsetStart = Math.round(
    getCrossAxisStart(targetRect, parentLayout.flowAxis) -
      getCrossAxisStart(contentRect, parentLayout.flowAxis),
  );
  const crossAxisInsetEnd = Math.round(
    getCrossAxisEnd(contentRect, parentLayout.flowAxis) -
      getCrossAxisEnd(targetRect, parentLayout.flowAxis),
  );

  const overlapArea = computeOverlapArea(contentRect, targetRect);
  const containsTargetCenter = isPointInsideRect(
    contentRect,
    targetRect.centerX,
    targetRect.centerY,
  );
  const crossAxisOverflow = getCrossAxisOverflow(targetRect, contentRect, parentLayout.flowAxis);
  const depthScore = getDomDepth(candidateParent);
  const childCountScore = Math.min(visibleChildElements.length, 6) * 8;
  const sameParentBonus = candidateParent === originalParent ? 30 : 0;
  const centeredBonus = containsTargetCenter ? 500 : 0;

  const parentSpacing =
    visibleChildElements.length > 0
      ? detectParentSpacing(candidateParent, visibleChildElements, parentLayout)
      : detectParentSpacing(candidateParent, [], parentLayout);

  return {
    element: candidateParent,
    contentRect,
    childEntries,
    targetChildIndex,
    previousSiblingEntry,
    nextSiblingEntry,
    gapBefore,
    gapAfter,
    crossAxisInsetStart,
    crossAxisInsetEnd,
    score:
      centeredBonus +
      overlapArea / 100 +
      depthScore +
      childCountScore +
      sameParentBonus -
      insertionScore -
      crossAxisOverflow * 3,
    parentLayout,
    parentSpacing,
  };
};

export const gatherRepositionContext = (
  element: HTMLElement,
  originalRect: ElementRectSnapshot,
  translateX: number,
  translateY: number,
): RepositionContext | null => {
  const originalParent = element.parentElement;
  if (!originalParent) return null;

  const targetRect = translateRect(originalRect, translateX, translateY);
  const originalMeasuredRect = translateRect(originalRect, 0, 0);

  const candidateParents = buildCandidateParents(element, originalParent, targetRect);
  let bestParentCandidate: ParentCandidate | null = null;

  for (const candidateParent of candidateParents) {
    const parentCandidate = buildParentCandidate(
      candidateParent,
      element,
      originalParent,
      targetRect,
    );
    if (!parentCandidate) continue;
    if (!bestParentCandidate || parentCandidate.score > bestParentCandidate.score) {
      bestParentCandidate = parentCandidate;
    }
  }

  if (!bestParentCandidate) return null;

  const originalVisibleSiblings = getVisibleChildren(originalParent);
  const originalChildIndex = originalVisibleSiblings.findIndex(
    (siblingElement) => siblingElement === element,
  );

  const previousSibling = bestParentCandidate.previousSiblingEntry
    ? {
        ...buildElementSummary(bestParentCandidate.previousSiblingEntry.element),
        childIndex: bestParentCandidate.previousSiblingEntry.childIndex,
      }
    : null;

  const nextSibling = bestParentCandidate.nextSiblingEntry
    ? {
        ...buildElementSummary(bestParentCandidate.nextSiblingEntry.element),
        childIndex: bestParentCandidate.nextSiblingEntry.childIndex,
      }
    : null;

  const treeNodeCount = { current: 0 };
  const tree = buildTreeNode(bestParentCandidate.element, element, 2, treeNodeCount, 0);
  if (!tree) return null;

  return {
    originalRect: originalMeasuredRect,
    targetRect,
    translateX,
    translateY,
    originalParent: buildElementSummary(originalParent),
    targetParent: buildElementSummary(bestParentCandidate.element),
    didChangeParent: bestParentCandidate.element !== originalParent,
    originalChildIndex,
    targetChildIndex: bestParentCandidate.targetChildIndex,
    targetSiblingCount: bestParentCandidate.childEntries.length,
    previousSibling,
    nextSibling,
    gapBefore: bestParentCandidate.gapBefore,
    gapAfter: bestParentCandidate.gapAfter,
    crossAxisInsetStart: bestParentCandidate.crossAxisInsetStart,
    crossAxisInsetEnd: bestParentCandidate.crossAxisInsetEnd,
    parentLayout: bestParentCandidate.parentLayout,
    parentSpacing: bestParentCandidate.parentSpacing,
    parentContentRect: bestParentCandidate.contentRect,
    tree,
  };
};
