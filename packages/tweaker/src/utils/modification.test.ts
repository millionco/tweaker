import { describe, expect, it } from "vitest";
import { SHADE_KEYS } from "../constants";
import type { GrayScale, Modification } from "../types";
import { applyModification } from "./modification";

const TEST_SCALES: Record<string, GrayScale> = {
  neutral: {
    label: "Neutral",
    shades: Object.fromEntries(
      SHADE_KEYS.map((shadeKey, shadeIndex) => [
        shadeKey,
        `oklch(${(0.98 - shadeIndex * 0.05).toFixed(3)} 0.01 250)`,
      ]),
    ),
  },
};

const createTestModification = (overrides: Partial<Modification> = {}): Modification => {
  const elementStyle = {
    backgroundColor: "",
    color: "",
    borderColor: "",
    fontSize: "",
    paddingTop: "",
    paddingRight: "",
    paddingBottom: "",
    paddingLeft: "",
    marginTop: "",
    marginRight: "",
    marginBottom: "",
    marginLeft: "",
  };

  return {
    element: { style: elementStyle } as HTMLElement,
    selector: "button.primary",
    componentName: null,
    sourceFile: null,
    textPreview: "Save",
    promptSignals: [],
    contextHint: null,
    originalInlineBg: "",
    originalInlineColor: "",
    originalInlineBorderColor: "",
    originalInlineFontSize: "",
    originalInlinePaddingTop: "",
    originalInlinePaddingBottom: "",
    originalInlinePaddingLeft: "",
    originalInlinePaddingRight: "",
    originalInlineMarginTop: "",
    originalInlineMarginBottom: "",
    originalInlineMarginLeft: "",
    originalInlineMarginRight: "",
    originalComputedBg: "rgb(241, 245, 249)",
    originalComputedColor: "rgb(15, 23, 42)",
    originalComputedBorderColor: "rgb(203, 213, 225)",
    originalComputedFontSize: 16,
    originalComputedPadding: {
      top: 8,
      right: 12,
      bottom: 10,
      left: 12,
    },
    originalComputedMargin: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    property: "bg",
    position: 4.5,
    fontSize: 16,
    paddingX: 12,
    paddingY: 8,
    ...overrides,
  };
};

describe("applyModification", () => {
  it("applies preserved-edge padding values to the element style", () => {
    const modification = createTestModification({
      paddingY: 12,
      paddingX: 14,
    });

    applyModification(modification, TEST_SCALES, "neutral");

    expect(modification.element.style.paddingTop).toBe("12px");
    expect(modification.element.style.paddingRight).toBe("14px");
    expect(modification.element.style.paddingBottom).toBe("14px");
    expect(modification.element.style.paddingLeft).toBe("14px");
    expect(modification.element.style.marginTop).toBe("");
    expect(modification.element.style.marginBottom).toBe("");
  });

  it("uses margin compensation when the target padding becomes negative", () => {
    const modification = createTestModification({
      originalComputedPadding: {
        top: 6,
        right: 12,
        bottom: 6,
        left: 12,
      },
      originalComputedMargin: {
        top: 4,
        right: 0,
        bottom: 4,
        left: 0,
      },
      paddingY: -2,
      paddingX: 12,
    });

    applyModification(modification, TEST_SCALES, "neutral");

    expect(modification.element.style.paddingTop).toBe("0px");
    expect(modification.element.style.paddingBottom).toBe("0px");
    expect(modification.element.style.marginTop).toBe("2px");
    expect(modification.element.style.marginBottom).toBe("2px");
  });
});
