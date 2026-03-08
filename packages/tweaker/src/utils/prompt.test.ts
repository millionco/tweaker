import { describe, expect, it } from "vitest";
import { SHADE_KEYS } from "../constants";
import type { GrayScale, Modification } from "../types";
import { generatePrompt } from "./prompt";

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

const createTestModification = (overrides: Partial<Modification> = {}): Modification => ({
  element: { style: {} } as HTMLElement,
  selector: "button.primary",
  componentName: null,
  sourceFile: null,
  textPreview: "Save changes",
  promptSignals: [
    { label: "data-testid", value: "save-button" },
    { label: "role", value: "button" },
  ],
  contextHint: 'form#profile-form, aria-label="Profile settings"',
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
  fontSize: 18,
  paddingX: 14,
  paddingY: 12,
  ...overrides,
});

describe("generatePrompt", () => {
  it("includes high-signal targeting details and literal per-edge diffs", () => {
    const prompt = generatePrompt([createTestModification()], TEST_SCALES, "neutral");

    expect(prompt).toContain("Make the smallest possible code edit for each target below.");
    expect(prompt).toContain("Target 1");
    expect(prompt).toContain("- selector: button.primary");
    expect(prompt).toContain('- text: "Save changes"');
    expect(prompt).toContain('- context: form#profile-form, aria-label="Profile settings"');
    expect(prompt).toContain("- data-testid: save-button");
    expect(prompt).toContain("- role: button");
    expect(prompt).toContain("Exact diff");
    expect(prompt).toContain("- background-color: rgb(241, 245, 249) -> Neutral");
    expect(prompt).toContain("- font-size: 16px -> 18px");
    expect(prompt).toContain("- padding-top: 8px -> 12px");
    expect(prompt).toContain("- padding-right: 12px -> 14px");
    expect(prompt).toContain("- padding-bottom: 10px -> 14px");
    expect(prompt).toContain("- padding-left: 12px -> 14px");
  });

  it("describes negative spacing with padding clamps and margin compensation", () => {
    const prompt = generatePrompt(
      [
        createTestModification({
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
        }),
      ],
      TEST_SCALES,
      "neutral",
    );

    expect(prompt).toContain("- padding-top: 6px -> 0px");
    expect(prompt).toContain("- padding-bottom: 6px -> 0px");
    expect(prompt).toContain("- margin-top: 4px -> 2px");
    expect(prompt).toContain("- margin-bottom: 4px -> 2px");
    expect(prompt).not.toContain("- padding-top: 6px -> -2px");
    expect(prompt).not.toContain("- padding-bottom: 6px -> -2px");
  });
});
