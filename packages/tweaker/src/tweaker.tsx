import { useCallback, useEffect, useRef, useState } from "react";
import {
  TWEAKER_BUTTON_BORDER_RADIUS_PX,
  TWEAKER_BUTTON_FONT_SIZE_PX,
  TWEAKER_BUTTON_GAP_PX,
  TWEAKER_BUTTON_PADDING_X_PX,
  TWEAKER_BUTTON_PADDING_Y_PX,
  TWEAKER_DRAG_THRESHOLD_PX,
  TWEAKER_HOVER_OUTLINE_OFFSET_PX,
  TWEAKER_HOVER_OUTLINE_WIDTH_PX,
  TWEAKER_OFFSET_PX,
  TWEAKER_STATUS_FONT_SIZE_PX,
  TWEAKER_STATUS_RESET_DELAY_MS,
  TWEAKER_Z_INDEX,
} from "./constants";
import type { DraggedElement, ElementSourceMetadata, TweakerProps } from "./types";
import { getSelector, getTextPreview } from "./utils/dom";
import { getMovedDraggedElements } from "./utils/get-moved-dragged-elements";
import { gatherRepositionContext } from "./utils/nearby";
import type { RepositionContext } from "./utils/nearby";
import { generatePrompt } from "./utils/prompt";
import { applyTranslatePreview, restoreTranslatePreview } from "./utils/translate-preview";
import { upsertDraggedElement } from "./utils/upsert-dragged-element";

interface HoveredElementState {
  element: HTMLElement;
  originalInlineOutline: string;
  originalInlineOutlineOffset: string;
}

interface ActiveDragSession {
  element: HTMLElement;
  startClientX: number;
  startClientY: number;
  startingTranslateX: number;
  startingTranslateY: number;
  currentTranslateX: number;
  currentTranslateY: number;
  didCrossDragThreshold: boolean;
}

interface ReactGrabFrame {
  fileName?: string;
  functionName?: string;
}

interface ReactGrabModule {
  getStack: (element: Element) => Promise<ReactGrabFrame[]>;
}

const getEventTargetElement = (eventTarget: EventTarget | null): HTMLElement | null =>
  eventTarget instanceof HTMLElement ? eventTarget : null;

const isEditableElement = (eventTarget: EventTarget | null): boolean => {
  const targetElement = getEventTargetElement(eventTarget);
  if (!targetElement) return false;
  if (targetElement.isContentEditable) return true;

  const tagName = targetElement.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
};

const getReactGrabModule = (): ReactGrabModule | null => {
  const maybeReactGrabModule = (window as unknown as Record<string, unknown>).__REACT_GRAB_MODULE__;
  if (!maybeReactGrabModule || typeof maybeReactGrabModule !== "object") {
    return null;
  }

  const maybeGetStack = (maybeReactGrabModule as Record<string, unknown>).getStack;
  if (typeof maybeGetStack !== "function") {
    return null;
  }

  return maybeReactGrabModule as ReactGrabModule;
};

const getElementSourceMetadata = async (element: HTMLElement): Promise<ElementSourceMetadata> => {
  let componentName: string | null = null;
  let sourceFile: string | null = null;

  try {
    const reactGrabModule = getReactGrabModule();
    if (!reactGrabModule) {
      return { componentName, sourceFile };
    }

    const stack = await reactGrabModule.getStack(element);
    for (const frame of stack) {
      if (!frame.fileName || frame.fileName.includes("node_modules")) {
        continue;
      }

      sourceFile = frame.fileName;
      if (frame.functionName && /^[A-Z]/.test(frame.functionName)) {
        componentName = frame.functionName;
      }
      break;
    }
  } catch {}

  return { componentName, sourceFile };
};

const createDraggedElement = (element: HTMLElement): DraggedElement => ({
  element,
  selector: getSelector(element),
  componentName: null,
  sourceFile: null,
  textPreview: getTextPreview(element),
  originalInlineTranslate: element.style.getPropertyValue("translate"),
  translateX: 0,
  translateY: 0,
});

const getStatusMessage = (
  isEnabled: boolean,
  promptStatus: string,
  movedDraggedElementCount: number,
): string => {
  if (!isEnabled) {
    return "Toggle on to drag elements and press Enter for a DOM prompt.";
  }

  if (promptStatus === "copied") {
    return "Prompt copied.";
  }

  if (promptStatus === "copy-failed") {
    return "Clipboard copy failed.";
  }

  if (promptStatus === "empty") {
    return "Drag an element before copying.";
  }

  if (movedDraggedElementCount === 0) {
    return "Drag any element. Press Enter to copy or Escape to reset.";
  }

  const draggedElementCountLabel =
    movedDraggedElementCount === 1
      ? "1 moved element"
      : `${movedDraggedElementCount} moved elements`;

  return `${draggedElementCountLabel}. Press Enter to copy or Escape to reset.`;
};

export const Tweaker = (_props: TweakerProps) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [draggedElements, setDraggedElements] = useState<DraggedElement[]>([]);
  const [promptStatus, setPromptStatus] = useState("idle");

  const draggedElementsRef = useRef(draggedElements);
  const hoveredElementRef = useRef<HoveredElementState | null>(null);
  const activeDragRef = useRef<ActiveDragSession | null>(null);
  const promptStatusTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  draggedElementsRef.current = draggedElements;

  const syncDraggedElements = useCallback(
    (getNextDraggedElements: (previousDraggedElements: DraggedElement[]) => DraggedElement[]) => {
      setDraggedElements((previousDraggedElements) => {
        const nextDraggedElements = getNextDraggedElements(previousDraggedElements);
        draggedElementsRef.current = nextDraggedElements;
        return nextDraggedElements;
      });
    },
    [],
  );

  const clearHoveredElement = useCallback(() => {
    const hoveredElement = hoveredElementRef.current;
    if (!hoveredElement) {
      return;
    }

    hoveredElement.element.style.outline = hoveredElement.originalInlineOutline;
    hoveredElement.element.style.outlineOffset = hoveredElement.originalInlineOutlineOffset;
    hoveredElementRef.current = null;
  }, []);

  const setHoveredElement = useCallback(
    (element: HTMLElement | null) => {
      const currentHoveredElement = hoveredElementRef.current?.element;
      if (currentHoveredElement === element) {
        return;
      }

      clearHoveredElement();

      if (!element) {
        return;
      }

      hoveredElementRef.current = {
        element,
        originalInlineOutline: element.style.outline,
        originalInlineOutlineOffset: element.style.outlineOffset,
      };
      element.style.outline = `${TWEAKER_HOVER_OUTLINE_WIDTH_PX}px solid rgba(59, 130, 246, 0.9)`;
      element.style.outlineOffset = `${TWEAKER_HOVER_OUTLINE_OFFSET_PX}px`;
    },
    [clearHoveredElement],
  );

  const resetPromptStatus = useCallback(() => {
    clearTimeout(promptStatusTimeoutRef.current);
    promptStatusTimeoutRef.current = setTimeout(() => {
      setPromptStatus("idle");
    }, TWEAKER_STATUS_RESET_DELAY_MS);
  }, []);

  const hydrateDraggedElementMetadata = useCallback(
    async (element: HTMLElement) => {
      const sourceMetadata = await getElementSourceMetadata(element);
      syncDraggedElements((previousDraggedElements) =>
        previousDraggedElements.map((draggedElement) =>
          draggedElement.element === element
            ? { ...draggedElement, ...sourceMetadata }
            : draggedElement,
        ),
      );
    },
    [syncDraggedElements],
  );

  const clearSession = useCallback(
    (shouldDisableTweaker: boolean) => {
      clearHoveredElement();
      draggedElementsRef.current.forEach(restoreTranslatePreview);
      activeDragRef.current = null;
      syncDraggedElements(() => []);
      clearTimeout(promptStatusTimeoutRef.current);
      setPromptStatus("idle");
      if (shouldDisableTweaker) {
        setIsEnabled(false);
      }
    },
    [clearHoveredElement, syncDraggedElements],
  );

  const copyPromptToClipboard = useCallback(async () => {
    const movedDraggedElements = getMovedDraggedElements(draggedElementsRef.current);
    if (movedDraggedElements.length === 0) {
      setPromptStatus("empty");
      resetPromptStatus();
      return;
    }

    const repositionContexts = new Map<number, RepositionContext>();
    movedDraggedElements.forEach((draggedElement, index) => {
      const repositionContext = gatherRepositionContext(
        draggedElement.element,
        draggedElement.translateX,
        draggedElement.translateY,
      );
      if (repositionContext) {
        repositionContexts.set(index, repositionContext);
      }
    });

    const prompt = generatePrompt(movedDraggedElements, repositionContexts);
    if (!prompt) {
      setPromptStatus("empty");
      resetPromptStatus();
      return;
    }

    try {
      await navigator.clipboard.writeText(prompt);
      setPromptStatus("copied");
    } catch {
      setPromptStatus("copy-failed");
    }

    resetPromptStatus();
  }, [resetPromptStatus]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) {
        return;
      }

      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        if (isEnabled) {
          clearSession(true);
          return;
        }

        setIsEnabled(true);
        return;
      }

      if (!isEnabled) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearSession(true);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void copyPromptToClipboard();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [clearSession, copyPromptToClipboard, isEnabled]);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const handleMouseOver = (event: MouseEvent) => {
      if (activeDragRef.current) {
        return;
      }

      const targetElement = getEventTargetElement(event.target);
      if (!targetElement || targetElement.closest("[data-tweaker]")) {
        return;
      }

      setHoveredElement(targetElement);
    };

    const handleMouseOut = (event: MouseEvent) => {
      if (activeDragRef.current) {
        return;
      }

      const targetElement = getEventTargetElement(event.target);
      if (!targetElement || hoveredElementRef.current?.element !== targetElement) {
        return;
      }

      clearHoveredElement();
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      const targetElement = getEventTargetElement(event.target);
      if (!targetElement || targetElement.closest("[data-tweaker]")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      clearHoveredElement();

      const existingDraggedElement = draggedElementsRef.current.find(
        (draggedElement) => draggedElement.element === targetElement,
      );
      const nextDraggedElement = existingDraggedElement ?? createDraggedElement(targetElement);

      if (!existingDraggedElement) {
        syncDraggedElements((previousDraggedElements) =>
          upsertDraggedElement(previousDraggedElements, nextDraggedElement),
        );
        void hydrateDraggedElementMetadata(targetElement);
      }

      activeDragRef.current = {
        element: targetElement,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startingTranslateX: nextDraggedElement.translateX,
        startingTranslateY: nextDraggedElement.translateY,
        currentTranslateX: nextDraggedElement.translateX,
        currentTranslateY: nextDraggedElement.translateY,
        didCrossDragThreshold: false,
      };
    };

    const handleMouseMove = (event: MouseEvent) => {
      const activeDragSession = activeDragRef.current;
      if (!activeDragSession) {
        return;
      }

      event.preventDefault();

      const movementX = event.clientX - activeDragSession.startClientX;
      const movementY = event.clientY - activeDragSession.startClientY;
      const nextTranslateX = activeDragSession.startingTranslateX + movementX;
      const nextTranslateY = activeDragSession.startingTranslateY + movementY;
      const didCrossDragThreshold =
        activeDragSession.didCrossDragThreshold ||
        Math.hypot(movementX, movementY) >= TWEAKER_DRAG_THRESHOLD_PX;

      activeDragRef.current = {
        ...activeDragSession,
        currentTranslateX: nextTranslateX,
        currentTranslateY: nextTranslateY,
        didCrossDragThreshold,
      };

      const draggedElement = draggedElementsRef.current.find(
        (innerDraggedElement) => innerDraggedElement.element === activeDragSession.element,
      );
      if (!draggedElement) {
        return;
      }

      applyTranslatePreview({
        ...draggedElement,
        translateX: nextTranslateX,
        translateY: nextTranslateY,
      });
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      const activeDragSession = activeDragRef.current;
      if (!activeDragSession) {
        return;
      }

      event.preventDefault();

      const finalTranslateX = activeDragSession.didCrossDragThreshold
        ? activeDragSession.currentTranslateX
        : activeDragSession.startingTranslateX;
      const finalTranslateY = activeDragSession.didCrossDragThreshold
        ? activeDragSession.currentTranslateY
        : activeDragSession.startingTranslateY;

      syncDraggedElements((previousDraggedElements) => {
        const draggedElement = previousDraggedElements.find(
          (innerDraggedElement) => innerDraggedElement.element === activeDragSession.element,
        );
        if (!draggedElement) {
          return previousDraggedElements;
        }

        const committedDraggedElement = {
          ...draggedElement,
          translateX: finalTranslateX,
          translateY: finalTranslateY,
        };

        if (committedDraggedElement.translateX === 0 && committedDraggedElement.translateY === 0) {
          restoreTranslatePreview(committedDraggedElement);
          return previousDraggedElements.filter(
            (innerDraggedElement) => innerDraggedElement.element !== activeDragSession.element,
          );
        }

        applyTranslatePreview(committedDraggedElement);
        return upsertDraggedElement(previousDraggedElements, committedDraggedElement);
      });

      activeDragRef.current = null;
    };

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      clearHoveredElement();
      activeDragRef.current = null;
    };
  }, [
    clearHoveredElement,
    hydrateDraggedElementMetadata,
    isEnabled,
    setHoveredElement,
    syncDraggedElements,
  ]);

  useEffect(() => {
    return () => {
      clearTimeout(promptStatusTimeoutRef.current);
      draggedElementsRef.current.forEach(restoreTranslatePreview);
      clearHoveredElement();
      activeDragRef.current = null;
    };
  }, [clearHoveredElement]);

  const movedDraggedElements = getMovedDraggedElements(draggedElements);
  const statusMessage = getStatusMessage(isEnabled, promptStatus, movedDraggedElements.length);

  return (
    <div data-tweaker style={tweakerContainerStyle}>
      <button
        type="button"
        onClick={() => {
          if (isEnabled) {
            clearSession(true);
            return;
          }

          setIsEnabled(true);
        }}
        style={{
          ...tweakerButtonStyle,
          background: isEnabled ? "rgba(59, 130, 246, 0.92)" : "rgba(15, 23, 42, 0.92)",
        }}
      >
        {isEnabled ? "Tweaker on" : "Tweaker off"}
      </button>
      <div
        style={{
          ...tweakerStatusStyle,
          opacity: isEnabled || promptStatus !== "idle" ? 1 : 0.8,
        }}
      >
        {statusMessage}
      </div>
    </div>
  );
};

const baseTextStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontWeight: 500,
  letterSpacing: "-0.03em",
  fontSynthesis: "none",
  WebkitFontSmoothing: "antialiased",
};

const tweakerContainerStyle: React.CSSProperties = {
  position: "fixed",
  left: TWEAKER_OFFSET_PX,
  bottom: TWEAKER_OFFSET_PX,
  zIndex: TWEAKER_Z_INDEX,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: TWEAKER_BUTTON_GAP_PX,
};

const tweakerButtonStyle: React.CSSProperties = {
  ...baseTextStyle,
  border: 0,
  borderRadius: TWEAKER_BUTTON_BORDER_RADIUS_PX,
  padding: `${TWEAKER_BUTTON_PADDING_Y_PX}px ${TWEAKER_BUTTON_PADDING_X_PX}px`,
  color: "white",
  fontSize: TWEAKER_BUTTON_FONT_SIZE_PX,
  cursor: "pointer",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.25)",
};

const tweakerStatusStyle: React.CSSProperties = {
  ...baseTextStyle,
  maxWidth: 320,
  padding: `${TWEAKER_BUTTON_PADDING_Y_PX}px ${TWEAKER_BUTTON_PADDING_X_PX}px`,
  borderRadius: TWEAKER_BUTTON_PADDING_X_PX,
  background: "rgba(15, 23, 42, 0.82)",
  color: "rgba(255,255,255,0.86)",
  fontSize: TWEAKER_STATUS_FONT_SIZE_PX,
  lineHeight: 1.45,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.18)",
};
