import { describe, expect, it } from "vitest";
import type { Modification } from "../types";
import { getResolvedSpacingState } from "./spacing";

const createTestModification = (overrides: Partial<Modification> = {}): Modification => ({
  element: { style: {} } as HTMLElement,
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
  originalComputedBg: "rgb(255, 255, 255)",
  originalComputedColor: "rgb(17, 24, 39)",
  originalComputedBorderColor: "rgb(229, 231, 235)",
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
  position: 5,
  fontSize: 16,
  paddingX: 12,
  paddingY: 8,
  ...overrides,
});

describe("getResolvedSpacingState", () => {
  it("preserves the original edge differences while applying axis deltas", () => {
    const modification = createTestModification({
      paddingY: 12,
      paddingX: 14,
    });

    const resolvedSpacingState = getResolvedSpacingState(modification);

    expect(resolvedSpacingState.targetPadding).toEqual({
      top: 12,
      right: 14,
      bottom: 14,
      left: 14,
    });
    expect(resolvedSpacingState.padding).toEqual({
      top: 12,
      right: 14,
      bottom: 14,
      left: 14,
    });
    expect(resolvedSpacingState.margin).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it("converts negative target padding into margin compensation", () => {
    const modification = createTestModification({
      originalComputedPadding: {
        top: 6,
        right: 10,
        bottom: 6,
        left: 10,
      },
      originalComputedMargin: {
        top: 4,
        right: 2,
        bottom: 4,
        left: 2,
      },
      paddingY: -2,
      paddingX: 10,
    });

    const resolvedSpacingState = getResolvedSpacingState(modification);

    expect(resolvedSpacingState.targetPadding).toEqual({
      top: -2,
      right: 10,
      bottom: -2,
      left: 10,
    });
    expect(resolvedSpacingState.padding).toEqual({
      top: 0,
      right: 10,
      bottom: 0,
      left: 10,
    });
    expect(resolvedSpacingState.margin).toEqual({
      top: 2,
      right: 2,
      bottom: 2,
      left: 2,
    });
  });
});
