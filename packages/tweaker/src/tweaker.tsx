import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Modification, TweakerProps } from "./types";
import { GRAY_SCALES } from "./gray-scales";
import { SLIDER_MAX, TYPING_RESET_DELAY_MS, FONT_WEIGHT_MIN, FONT_WEIGHT_MAX, SCROLL_COLOR_SENSITIVITY, SCROLL_WEIGHT_SENSITIVITY, MINIMAP_WIDTH_PX, MINIMAP_HEIGHT_PX, THUMB_SIZE_PX } from "./constants";
import { getColorAtPosition, oklchToCssString, parseRgb, rgbToOklch, findClosestPosition } from "./utils/color";
import { getSelector, getTextPreview } from "./utils/dom";
import { applyModification, restoreModification, roundToStep } from "./utils/modification";
import { generatePrompt } from "./utils/prompt";

export const Tweaker = ({ scales = GRAY_SCALES, activeScale = "neutral" }: TweakerProps) => {
  const [picking, setPicking] = useState(false);
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [inputValue, setInputValue] = useState("");
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
    if (!hasModifications || picking) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const index = activeIndexRef.current;
      if (index < 0) return;

      setModifications((previous) => {
        const updated = [...previous];
        const current = updated[index];
        const newPosition = Math.max(0, Math.min(SLIDER_MAX, current.position - event.deltaY * SCROLL_COLOR_SENSITIVITY));
        const newWeight = Math.max(FONT_WEIGHT_MIN, Math.min(FONT_WEIGHT_MAX, current.fontWeight + event.deltaX * SCROLL_WEIGHT_SENSITIVITY));
        updated[index] = { ...current, position: roundToStep(newPosition), fontWeight: newWeight };
        applyModification(updated[index], scalesRef.current, activeScaleRef.current);
        setInputValue(String(updated[index].position));
        return updated;
      });
    };

    document.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => {
      document.removeEventListener("wheel", handleWheel, true);
    };
  }, [hasModifications, picking]);

  useEffect(() => {
    if (!hasModifications) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        const prompt = generatePrompt(modificationsRef.current, scalesRef.current, activeScaleRef.current);
        navigator.clipboard.writeText(prompt);
        modificationsRef.current.forEach(restoreModification);
        setModifications([]);
        setActiveIndex(-1);
        setInputValue("");
      }

      if (event.key === " ") {
        event.preventDefault();
        const prompt = generatePrompt(modificationsRef.current, scalesRef.current, activeScaleRef.current);
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
      modifications.forEach(restoreModification);
    };
  }, []);

  useEffect(() => {
    if (activeMod) {
      applyModification(activeMod, scales, activeScale);
    }
  }, [activeMod?.position, activeMod?.fontWeight, activeScale, scales]);

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

    const handleClick = (event: MouseEvent) => {
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
      const defaultProperty: "bg" | "text" | "border" = hasBackground ? "bg" : hasBorder ? "border" : "text";
      const targetOklch =
        defaultProperty === "bg"
          ? rgbToOklch(bgRed, bgGreen, bgBlue)
          : defaultProperty === "border"
            ? rgbToOklch(borderRed, borderGreen, borderBlue)
            : rgbToOklch(textRed, textGreen, textBlue);

      const position = findClosestPosition(scales, activeScale, targetOklch);
      const currentWeight = parseFloat(computed.fontWeight) || 400;

      const newModification: Modification = {
        element: target,
        selector: getSelector(target),
        componentName: null,
        sourceFile: null,
        textPreview: getTextPreview(target),
        originalInlineBg: target.style.backgroundColor,
        originalInlineColor: target.style.color,
        originalInlineBorderColor: target.style.borderColor,
        originalInlineFontWeight: target.style.fontWeight,
        property: defaultProperty,
        position,
        fontWeight: currentWeight,
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
    : scales[activeScale]?.shades["500"] ?? "rgba(255,255,255,0.3)";

  const propertyLabel =
    activeMod?.property === "text" ? "F" : activeMod?.property === "border" ? "D" : "B";

  const thumbX = activeMod
    ? ((activeMod.fontWeight - FONT_WEIGHT_MIN) / (FONT_WEIGHT_MAX - FONT_WEIGHT_MIN)) * (MINIMAP_WIDTH_PX - THUMB_SIZE_PX)
    : 0;
  const thumbY = activeMod
    ? (1 - activeMod.position / SLIDER_MAX) * (MINIMAP_HEIGHT_PX - THUMB_SIZE_PX)
    : MINIMAP_HEIGHT_PX - THUMB_SIZE_PX;

  const bgColor900 = scales[activeScale]?.shades["900"] ?? "#1A1A1A";

  return (
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
          <div style={{ ...minimapFieldStyle, background: bgColor900 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 6,
                background: `linear-gradient(to right, ${scales[activeScale]?.shades["950"] ?? "#111"}, ${scales[activeScale]?.shades["50"] ?? "#fafafa"})`,
                opacity: 0.15,
              }}
            />
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
          <div style={minimapValuesStyle}>
            <span style={minimapLabelStyle}>
              {picking
                ? "Picking…"
                : `${propertyLabel} ${inputValue || "0"}`}
            </span>
            {!picking && activeMod && (
              <span style={minimapLabelStyle}>
                W {Math.round(activeMod.fontWeight)}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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
  pointerEvents: "none",
};

const minimapFieldStyle: React.CSSProperties = {
  position: "relative",
  width: MINIMAP_WIDTH_PX,
  height: MINIMAP_HEIGHT_PX,
  borderRadius: 8,
  boxShadow: "0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08) inset",
  overflow: "hidden",
};

const minimapValuesStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "0 2px",
};

const minimapLabelStyle: React.CSSProperties = {
  ...baseTextStyle,
  fontSize: 11,
  color: "rgba(255,255,255,0.6)",
  whiteSpace: "nowrap",
};
