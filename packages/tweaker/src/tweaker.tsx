import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Modification, TweakerProps } from "./types";
import { GRAY_SCALES } from "./gray-scales";
import {
  SLIDER_MAX,
  TYPING_RESET_DELAY_MS,
  FONT_SIZE_MIN_PX,
  FONT_SIZE_MAX_PX,
  PADDING_MIN_PX,
  PADDING_MAX_PX,
  MOUSE_COLOR_SENSITIVITY,
  MOUSE_SIZE_SENSITIVITY,
  MOUSE_PADDING_SENSITIVITY,
  MINIMAP_WIDTH_PX,
  MINIMAP_HEIGHT_PX,
  THUMB_SIZE_PX,
  DRAG_PREVIEW_LINE_THICKNESS_PX,
  DRAG_PREVIEW_PARENT_RADIUS_PX,
  DRAG_PREVIEW_LABEL_OFFSET_PX,
} from "./constants";
import {
  getColorAtPosition,
  oklchToCssString,
  parseRgb,
  rgbToOklch,
  findClosestPosition,
} from "./utils/color";
import { getSelector, getTextPreview } from "./utils/dom";
import {
  applyModification,
  restoreModification,
  roundToStep,
  roundToHalf,
} from "./utils/modification";
import { generatePrompt } from "./utils/prompt";
import { gatherRepositionContext } from "./utils/nearby";
import type { RepositionContext } from "./utils/nearby";

const requestLock = () => {
  if (!document.pointerLockElement) {
    document.body.requestPointerLock();
  }
};

const releaseLock = () => {
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
};

const toViewportLeft = (pageLeft: number): number => pageLeft - window.scrollX;

const toViewportTop = (pageTop: number): number => pageTop - window.scrollY;

const describePreviewSibling = (description: RepositionContext["previousSibling"]): string => {
  if (!description) return "";

  const descriptionParts = [description.selector];
  if (description.componentName) descriptionParts.unshift(`<${description.componentName}>`);
  if (description.textPreview) descriptionParts.push(`"${description.textPreview}"`);
  return descriptionParts.join(" ");
};

export const Tweaker = ({ scales = GRAY_SCALES, activeScale = "neutral" }: TweakerProps) => {
  const [picking, setPicking] = useState(false);
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [inputValue, setInputValue] = useState("");
  const [shiftHeld, setShiftHeld] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [controlHeld, setControlHeld] = useState(false);
  const typingBuffer = useRef("");
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const activeMod = activeIndex >= 0 ? modifications[activeIndex] : null;
  const hasModifications = modifications.length > 0;

  const activeIndexRef = useRef(activeIndex);
  const activeScaleRef = useRef(activeScale);
  const modificationsRef = useRef(modifications);
  const scalesRef = useRef(scales);
  activeIndexRef.current = activeIndex;
  activeScaleRef.current = activeScale;
  modificationsRef.current = modifications;
  scalesRef.current = scales;

  const updateActivePosition = useCallback(
    (newPosition: number) => {
      if (activeIndex < 0) return;
      setModifications((previous) => {
        const updated = [...previous];
        updated[activeIndex] = { ...updated[activeIndex], position: newPosition };
        applyModification(updated[activeIndex], scales, activeScale);
        return updated;
      });
    },
    [activeIndex, activeScale, scales],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setShiftHeld(event.shiftKey);
      if (event.key === " ") setSpaceHeld(true);
      if (event.key === "Control") setControlHeld(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      setShiftHeld(event.shiftKey);
      if (event.key === " ") setSpaceHeld(false);
      if (event.key === "Control") setControlHeld(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!hasModifications || picking) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!document.pointerLockElement) return;
      const index = activeIndexRef.current;
      if (index < 0) return;

      setModifications((previous) => {
        const updated = [...previous];
        const current = updated[index];

        if (event.ctrlKey) {
          updated[index] = {
            ...current,
            translateX: current.translateX + event.movementX,
            translateY: current.translateY + event.movementY,
          };
        } else if (event.shiftKey) {
          const newPaddingY = Math.max(
            PADDING_MIN_PX,
            Math.min(
              PADDING_MAX_PX,
              current.paddingY - event.movementY * MOUSE_PADDING_SENSITIVITY,
            ),
          );
          updated[index] = { ...current, paddingY: Math.round(newPaddingY) };
        } else {
          const newPosition = Math.max(
            0,
            Math.min(SLIDER_MAX, current.position - event.movementY * MOUSE_COLOR_SENSITIVITY),
          );
          const newSize = Math.max(
            FONT_SIZE_MIN_PX,
            Math.min(FONT_SIZE_MAX_PX, current.fontSize + event.movementX * MOUSE_SIZE_SENSITIVITY),
          );
          updated[index] = {
            ...current,
            position: roundToStep(newPosition),
            fontSize: roundToHalf(newSize),
          };
        }

        applyModification(updated[index], scalesRef.current, activeScaleRef.current);
        setInputValue(String(updated[index].position));
        return updated;
      });
    };

    requestLock();
    document.addEventListener("mousemove", handleMouseMove, true);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove, true);
      releaseLock();
    };
  }, [hasModifications, picking]);

  const gatherRepositionContexts = async (
    modifications: Modification[],
  ): Promise<Map<number, RepositionContext>> => {
    const contextMap = new Map<number, RepositionContext>();
    for (let index = 0; index < modifications.length; index++) {
      const modification = modifications[index];
      if (modification.translateX !== 0 || modification.translateY !== 0) {
        const context = await gatherRepositionContext(
          modification.element,
          modification.dragOriginRect,
          modification.translateX,
          modification.translateY,
        );
        if (context) contextMap.set(index, context);
      }
    }
    return contextMap;
  };

  useEffect(() => {
    if (!hasModifications) return;

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        releaseLock();
        const contextMap = await gatherRepositionContexts(modificationsRef.current);
        const prompt = generatePrompt(
          modificationsRef.current,
          scalesRef.current,
          activeScaleRef.current,
          contextMap,
        );
        navigator.clipboard.writeText(prompt);
        modificationsRef.current.forEach(restoreModification);
        setModifications([]);
        setActiveIndex(-1);
        setInputValue("");
      }

      if (event.key === "Enter") {
        event.preventDefault();
        releaseLock();
        const contextMap = await gatherRepositionContexts(modificationsRef.current);
        const prompt = generatePrompt(
          modificationsRef.current,
          scalesRef.current,
          activeScaleRef.current,
          contextMap,
        );
        navigator.clipboard.writeText(prompt);
        setPicking(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hasModifications]);

  useEffect(() => {
    if (!activeMod || picking) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.key === "Escape") return;

      if ((event.key >= "0" && event.key <= "9") || event.key === ".") {
        event.preventDefault();
        const next = typingBuffer.current + event.key;

        if (event.key === "." && typingBuffer.current.includes(".")) return;

        const hasDecimal = typingBuffer.current.includes(".");
        if (hasDecimal && event.key !== "." && typingBuffer.current.split(".")[1]?.length >= 1) {
          return;
        }

        const parsed = parseFloat(next);
        if (!isNaN(parsed) && parsed > SLIDER_MAX) {
          typingBuffer.current = event.key === "." ? "." : event.key;
        } else {
          typingBuffer.current = next;
        }

        const value = parseFloat(typingBuffer.current);
        if (!isNaN(value)) {
          const clamped = Math.min(SLIDER_MAX, value);
          updateActivePosition(clamped);
          setInputValue(typingBuffer.current);
        }

        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => {
          typingBuffer.current = "";
        }, TYPING_RESET_DELAY_MS);
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        typingBuffer.current = typingBuffer.current.slice(0, -1);
        if (typingBuffer.current && typingBuffer.current !== ".") {
          const value = Math.min(SLIDER_MAX, parseFloat(typingBuffer.current));
          updateActivePosition(value);
          setInputValue(typingBuffer.current);
        }
        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => {
          typingBuffer.current = "";
        }, TYPING_RESET_DELAY_MS);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(typingTimeout.current);
    };
  }, [activeMod, picking, activeIndex, updateActivePosition]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.key === "t") {
        event.preventDefault();
        setPicking(true);
      }
      if (hasModifications && (event.key === "b" || event.key === "f" || event.key === "d")) {
        event.preventDefault();
        const property: "bg" | "text" | "border" =
          event.key === "b" ? "bg" : event.key === "f" ? "text" : "border";
        const index = activeIndexRef.current;
        if (index < 0) return;
        setModifications((previous) => {
          const updated = [...previous];
          restoreModification(updated[index]);
          updated[index] = { ...updated[index], property };
          applyModification(updated[index], scalesRef.current, activeScaleRef.current);
          return updated;
        });
      }
    };

    const handleMiddleClick = (event: MouseEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      setPicking(true);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMiddleClick, true);
    document.addEventListener("auxclick", handleMiddleClick, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMiddleClick, true);
      document.removeEventListener("auxclick", handleMiddleClick, true);
    };
  }, [hasModifications]);

  useEffect(() => {
    return () => {
      modificationsRef.current.forEach(restoreModification);
      releaseLock();
    };
  }, []);

  useEffect(() => {
    if (activeMod) {
      applyModification(activeMod, scales, activeScale);
    }
  }, [activeMod, activeScale, scales]);

  const activeRepositionContext = useMemo(() => {
    if (!activeMod || picking) return null;
    if (activeMod.translateX === 0 && activeMod.translateY === 0) return null;

    return gatherRepositionContext(
      activeMod.element,
      activeMod.dragOriginRect,
      activeMod.translateX,
      activeMod.translateY,
    );
  }, [activeMod, picking]);

  useEffect(() => {
    if (!picking) return;

    let hoveredElement: HTMLElement | null = null;

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-tweaker]")) return;
      hoveredElement = target;
      target.style.outline = "2px solid #3b82f6";
      target.style.outlineOffset = "2px";
    };

    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      target.style.outline = "";
      target.style.outlineOffset = "";
      if (hoveredElement === target) hoveredElement = null;
    };

    const handleClick = async (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target as HTMLElement;
      if (target.closest("[data-tweaker]")) return;

      target.style.outline = "";
      target.style.outlineOffset = "";

      const computed = getComputedStyle(target);
      const [bgRed, bgGreen, bgBlue, bgAlpha] = parseRgb(computed.backgroundColor);
      const [textRed, textGreen, textBlue] = parseRgb(computed.color);
      const [borderRed, borderGreen, borderBlue, borderAlpha] = parseRgb(computed.borderColor);
      const hasBorder = borderAlpha > 0 && parseFloat(computed.borderWidth) > 0;

      const hasBackground = bgAlpha > 0;
      const defaultProperty: "bg" | "text" | "border" = hasBackground
        ? "bg"
        : hasBorder
          ? "border"
          : "text";
      const targetOklch =
        defaultProperty === "bg"
          ? rgbToOklch(bgRed, bgGreen, bgBlue)
          : defaultProperty === "border"
            ? rgbToOklch(borderRed, borderGreen, borderBlue)
            : rgbToOklch(textRed, textGreen, textBlue);

      const position = findClosestPosition(scales, activeScale, targetOklch);
      const currentSize = parseFloat(computed.fontSize) || 16;
      const currentPaddingY = parseFloat(computed.paddingTop) || 0;
      const targetRect = target.getBoundingClientRect();

      let componentName: string | null = null;
      let sourceFile: string | null = null;
      try {
        const reactGrab = (window as unknown as Record<string, unknown>).__REACT_GRAB_MODULE__ as
          | {
              getStack: (
                element: Element,
              ) => Promise<
                Array<{ fileName?: string; lineNumber?: number; functionName?: string }>
              >;
            }
          | undefined;
        if (reactGrab?.getStack) {
          const stack = await reactGrab.getStack(target);
          if (stack) {
            for (const frame of stack) {
              if (frame.fileName && !frame.fileName.includes("node_modules")) {
                sourceFile = frame.fileName;
                if (frame.functionName && /^[A-Z]/.test(frame.functionName)) {
                  componentName = frame.functionName;
                }
                break;
              }
            }
          }
        }
      } catch {}

      const newModification: Modification = {
        element: target,
        selector: getSelector(target),
        componentName,
        sourceFile,
        textPreview: getTextPreview(target),
        originalInlineBg: target.style.backgroundColor,
        originalInlineColor: target.style.color,
        originalInlineBorderColor: target.style.borderColor,
        originalInlineFontSize: target.style.fontSize,
        originalInlinePaddingTop: target.style.paddingTop,
        originalInlinePaddingBottom: target.style.paddingBottom,
        originalInlineMarginTop: target.style.marginTop,
        originalInlineMarginBottom: target.style.marginBottom,
        originalInlineTransform: target.style.transform,
        property: defaultProperty,
        position,
        fontSize: currentSize,
        paddingY: currentPaddingY,
        translateX: 0,
        translateY: 0,
        dragOriginRect: {
          left: targetRect.left + window.scrollX,
          top: targetRect.top + window.scrollY,
          width: targetRect.width,
          height: targetRect.height,
        },
      };

      setModifications((previous) => [...previous, newModification]);
      setActiveIndex(modifications.length);
      setInputValue(String(position));
      setPicking(false);
    };

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("click", handleClick, true);
      if (hoveredElement) {
        hoveredElement.style.outline = "";
        hoveredElement.style.outlineOffset = "";
      }
    };
  }, [picking, activeScale, scales, modifications.length]);

  const fillColor = activeMod
    ? oklchToCssString(getColorAtPosition(scales, activeScale, activeMod.position))
    : (scales[activeScale]?.shades["500"] ?? "rgba(255,255,255,0.3)");

  const propertyLabel =
    activeMod?.property === "text" ? "F" : activeMod?.property === "border" ? "D" : "B";

  const isPaddingMode = shiftHeld && hasModifications && !picking;
  const isDragMode = controlHeld && hasModifications && !picking;

  const guideRect =
    activeMod && !picking && !spaceHeld ? activeMod.element.getBoundingClientRect() : null;
  const previewParentRect = activeRepositionContext
    ? {
        left: toViewportLeft(activeRepositionContext.parentContentRect.left),
        top: toViewportTop(activeRepositionContext.parentContentRect.top),
        width: activeRepositionContext.parentContentRect.width,
        height: activeRepositionContext.parentContentRect.height,
      }
    : null;
  const previewTargetRect = activeRepositionContext
    ? {
        left: toViewportLeft(activeRepositionContext.targetRect.left),
        top: toViewportTop(activeRepositionContext.targetRect.top),
        width: activeRepositionContext.targetRect.width,
        height: activeRepositionContext.targetRect.height,
      }
    : null;
  const previewIsHorizontal = activeRepositionContext?.parentLayout.flowAxis === "horizontal";
  const previewLineStyle: React.CSSProperties | null =
    activeRepositionContext && previewParentRect && previewTargetRect
      ? previewIsHorizontal
        ? {
            position: "absolute",
            left: previewTargetRect.left,
            top: previewParentRect.top,
            width: DRAG_PREVIEW_LINE_THICKNESS_PX,
            height: previewParentRect.height,
            background: "rgba(168, 85, 247, 0.8)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.15)",
          }
        : {
            position: "absolute",
            left: previewParentRect.left,
            top: previewTargetRect.top,
            width: previewParentRect.width,
            height: DRAG_PREVIEW_LINE_THICKNESS_PX,
            background: "rgba(168, 85, 247, 0.8)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.15)",
          }
      : null;
  const previewPositionLabel = activeRepositionContext
    ? activeRepositionContext.previousSibling
      ? `after ${describePreviewSibling(activeRepositionContext.previousSibling)}`
      : activeRepositionContext.nextSibling
        ? `before ${describePreviewSibling(activeRepositionContext.nextSibling)}`
        : `child ${activeRepositionContext.targetChildIndex + 1}`
    : "";
  const previewParentLabel = activeRepositionContext
    ? `${activeRepositionContext.targetParent.componentName ? `<${activeRepositionContext.targetParent.componentName}> ` : ""}${activeRepositionContext.targetParent.selector}`
    : "";
  const previewGapLabel = activeRepositionContext
    ? previewIsHorizontal
      ? `← ${activeRepositionContext.gapBefore}px  → ${activeRepositionContext.gapAfter}px`
      : `↑ ${activeRepositionContext.gapBefore}px  ↓ ${activeRepositionContext.gapAfter}px`
    : "";

  const thumbX = activeMod
    ? isPaddingMode
      ? (MINIMAP_WIDTH_PX - THUMB_SIZE_PX) / 2
      : ((activeMod.fontSize - FONT_SIZE_MIN_PX) / (FONT_SIZE_MAX_PX - FONT_SIZE_MIN_PX)) *
        (MINIMAP_WIDTH_PX - THUMB_SIZE_PX)
    : 0;
  const thumbY = activeMod
    ? isPaddingMode
      ? (1 - (activeMod.paddingY - PADDING_MIN_PX) / (PADDING_MAX_PX - PADDING_MIN_PX)) *
        (MINIMAP_HEIGHT_PX - THUMB_SIZE_PX)
      : (1 - activeMod.position / SLIDER_MAX) * (MINIMAP_HEIGHT_PX - THUMB_SIZE_PX)
    : MINIMAP_HEIGHT_PX - THUMB_SIZE_PX;

  return (
    <>
      {guideRect && activeMod && (
        <div data-tweaker style={guidelinesContainerStyle}>
          {previewParentRect && (
            <div
              style={{
                position: "absolute",
                left: previewParentRect.left,
                top: previewParentRect.top,
                width: previewParentRect.width,
                height: previewParentRect.height,
                boxSizing: "border-box",
                border: "1px dashed rgba(168, 85, 247, 0.55)",
                borderRadius: DRAG_PREVIEW_PARENT_RADIUS_PX,
                background: "rgba(168, 85, 247, 0.04)",
              }}
            />
          )}
          <div
            style={{
              position: "absolute",
              left: guideRect.left,
              top: guideRect.top,
              width: guideRect.width,
              height: guideRect.height,
              boxSizing: "border-box",
              border: "1px solid rgba(59, 130, 246, 0.5)",
              borderRadius: 1,
            }}
          />
          {activeMod.paddingY > 0 && (
            <>
              <div
                style={{
                  position: "absolute",
                  left: guideRect.left,
                  top: guideRect.top,
                  width: guideRect.width,
                  height: Math.min(activeMod.paddingY, guideRect.height / 2),
                  background: "rgba(255, 99, 132, 0.1)",
                  borderBottom: "1px dashed rgba(255, 99, 132, 0.35)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: guideRect.left,
                  top: guideRect.bottom - Math.min(activeMod.paddingY, guideRect.height / 2),
                  width: guideRect.width,
                  height: Math.min(activeMod.paddingY, guideRect.height / 2),
                  background: "rgba(255, 99, 132, 0.1)",
                  borderTop: "1px dashed rgba(255, 99, 132, 0.35)",
                }}
              />
            </>
          )}
          {previewLineStyle && <div style={previewLineStyle} />}
          {previewLineStyle && previewParentRect && (
            <div
              style={{
                position: "absolute",
                left: previewIsHorizontal ? (previewTargetRect?.left ?? 0) : previewParentRect.left,
                top: previewIsHorizontal
                  ? previewParentRect.top - DRAG_PREVIEW_LABEL_OFFSET_PX
                  : (previewTargetRect?.top ?? 0) - DRAG_PREVIEW_LABEL_OFFSET_PX,
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  ...guidelineLabelStyle,
                  color: "rgba(168, 85, 247, 0.95)",
                  background: "rgba(168, 85, 247, 0.12)",
                }}
              >
                {previewPositionLabel}
              </span>
            </div>
          )}
          <div
            style={{
              position: "absolute",
              left: guideRect.right + 8,
              top: guideRect.top,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              pointerEvents: "none",
            }}
          >
            <span style={guidelineLabelStyle}>↕ {activeMod.paddingY}px</span>
            <span
              style={{
                ...guidelineLabelStyle,
                color: "rgba(59, 130, 246, 0.8)",
                background: "rgba(59, 130, 246, 0.06)",
              }}
            >
              {activeMod.fontSize}px
            </span>
            {(activeMod.translateX !== 0 || activeMod.translateY !== 0) && (
              <span
                style={{
                  ...guidelineLabelStyle,
                  color: "rgba(168, 85, 247, 0.9)",
                  background: "rgba(168, 85, 247, 0.08)",
                }}
              >
                {Math.round(activeMod.translateX)}, {Math.round(activeMod.translateY)}
              </span>
            )}
            {activeRepositionContext && (
              <>
                <span
                  style={{
                    ...guidelineLabelStyle,
                    color: "rgba(168, 85, 247, 0.95)",
                    background: "rgba(168, 85, 247, 0.12)",
                  }}
                >
                  {previewParentLabel}
                </span>
                <span
                  style={{
                    ...guidelineLabelStyle,
                    color: "rgba(34, 197, 94, 0.92)",
                    background: "rgba(34, 197, 94, 0.08)",
                  }}
                >
                  {previewGapLabel}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      <AnimatePresence>
        {(hasModifications || picking) && (
          <motion.div
            key="minimap"
            data-tweaker
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            style={minimapContainerStyle}
          >
            <div style={minimapFieldStyle}>
              <div
                style={{
                  position: "absolute",
                  left: thumbX,
                  top: thumbY,
                  width: THUMB_SIZE_PX,
                  height: THUMB_SIZE_PX,
                  borderRadius: "50%",
                  background: fillColor,
                  border: "2px solid rgba(255,255,255,0.9)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  transition: "left 50ms, top 50ms",
                }}
              />
            </div>
            <div style={minimapModeStyle}>
              <span style={minimapLabelStyle}>
                {isDragMode ? "⌃ Move" : isPaddingMode ? "⇧ Padding" : "Style"}
              </span>
            </div>
            <div style={minimapValuesStyle}>
              <span style={minimapLabelStyle}>
                {picking
                  ? "Picking…"
                  : isDragMode
                    ? `x: ${activeMod?.translateX ?? 0}`
                    : isPaddingMode
                      ? `↕ ${activeMod?.paddingY ?? 0}px`
                      : `${propertyLabel} ${inputValue || "0"}`}
              </span>
              {!picking && activeMod && isDragMode && (
                <span style={minimapLabelStyle}>{`y: ${activeMod.translateY}`}</span>
              )}
              {!picking && activeMod && !isPaddingMode && !isDragMode && (
                <span style={minimapLabelStyle}>{`${activeMod.fontSize}px`}</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const baseTextStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontWeight: 500,
  letterSpacing: "-0.03em",
  fontSynthesis: "none",
  WebkitFontSmoothing: "antialiased",
};

const minimapContainerStyle: React.CSSProperties = {
  position: "fixed",
  left: 16,
  bottom: 16,
  zIndex: 9999,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const minimapFieldStyle: React.CSSProperties = {
  position: "relative",
  width: MINIMAP_WIDTH_PX,
  height: MINIMAP_HEIGHT_PX,
  borderRadius: 8,
  background: "rgba(0,0,0,0.25)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset",
  overflow: "hidden",
  pointerEvents: "none",
};

const minimapModeStyle: React.CSSProperties = {
  padding: "0 2px",
  pointerEvents: "none",
};

const minimapValuesStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "0 2px",
  pointerEvents: "none",
};

const minimapLabelStyle: React.CSSProperties = {
  ...baseTextStyle,
  fontSize: 11,
  color: "rgba(255,255,255,0.6)",
  whiteSpace: "nowrap",
};

const guidelinesContainerStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9998,
  pointerEvents: "none",
};

const guidelineLabelStyle: React.CSSProperties = {
  ...baseTextStyle,
  fontSize: 10,
  lineHeight: "16px",
  color: "rgba(255, 99, 132, 0.9)",
  background: "rgba(255, 99, 132, 0.08)",
  padding: "0 5px",
  borderRadius: 3,
  whiteSpace: "nowrap",
};
