import { useState, useCallback, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "motion/react";
import type { Modification, TweakerProps } from "./types";
import { GRAY_SCALES } from "./gray-scales";
import { SLIDER_MAX, BAR_WIDTH_PX, TYPING_RESET_DELAY_MS } from "./constants";
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
  const fillPercent = useMotionValue(0);
  const fillHeight = useTransform(fillPercent, (percent) => `${percent}%`);

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

  useEffect(() => {
    if (activeMod) {
      fillPercent.jump((activeMod.position / SLIDER_MAX) * 100);
    }
  }, [activeMod?.position, fillPercent]);

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

    const updateFromY = (clientY: number) => {
      const percent = Math.max(0, Math.min(1, 1 - clientY / window.innerHeight));
      const value = roundToStep(percent * SLIDER_MAX);
      const index = activeIndexRef.current;
      if (index < 0) return;
      fillPercent.jump(percent * 100);
      setModifications((previous) => {
        const updated = [...previous];
        updated[index] = { ...updated[index], position: value };
        applyModification(updated[index], scalesRef.current, activeScaleRef.current);
        return updated;
      });
      setInputValue(String(value));
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateFromY(event.clientY);
    };

    document.addEventListener("pointermove", handlePointerMove, true);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
    };
  }, [hasModifications, picking, fillPercent]);

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

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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
  }, [activeMod?.position, activeScale, scales]);

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

      const newModification: Modification = {
        element: target,
        selector: getSelector(target),
        componentName: null,
        sourceFile: null,
        textPreview: getTextPreview(target),
        originalInlineBg: target.style.backgroundColor,
        originalInlineColor: target.style.color,
        originalInlineBorderColor: target.style.borderColor,
        property: defaultProperty,
        position,
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

  return (
    <>
      <AnimatePresence>
        {hasModifications && !picking && (
          <motion.div
            key="bar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            data-tweaker
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              width: BAR_WIDTH_PX,
              height: "100vh",
              zIndex: 9999,
              pointerEvents: "none",
            }}
          >
            <motion.div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: fillHeight,
                background: fillColor,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        data-tweaker
        layout
        style={{
          ...pillStyle,
          ...(!hasModifications ? { cursor: "pointer" } : {}),
        }}
        animate={{
          backgroundColor: scales[activeScale]?.shades["900"] ?? "#1A1A1A",
        }}
        transition={{
          layout: { type: "spring", visualDuration: 0.3, bounce: 0.15 },
          backgroundColor: { duration: 0.3 },
        }}
        onClick={!hasModifications ? () => setPicking(!picking) : undefined}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={picking ? "picking" : hasModifications ? "value" : "idle"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            style={pillTextStyle}
          >
            {picking
              ? "Picking…"
              : hasModifications
                ? `${propertyLabel} ${inputValue || "0"}`
                : "Tweaker"}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </>
  );
};

const pillStyle: React.CSSProperties = {
  position: "fixed",
  left: 16,
  bottom: 16,
  zIndex: 9999,
  background: "#1A1A1A",
  color: "color(display-p3 1 1 1)",
  borderRadius: 9999,
  height: 28,
  padding: "0 12px",
  fontSize: 11,
  fontFamily: "system-ui, sans-serif",
  fontWeight: 500,
  letterSpacing: "-0.03em",
  fontSynthesis: "none",
  WebkitFontSmoothing: "antialiased",
  width: "fit-content",
  boxShadow: "0 4px 24px #0000004D",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const pillTextStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "color(display-p3 1 1 1)",
  whiteSpace: "nowrap",
};
