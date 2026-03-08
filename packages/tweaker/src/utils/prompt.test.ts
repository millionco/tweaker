import { describe, expect, it } from "vitest";
import type { Modification } from "../types";
import { GRAY_SCALES } from "../gray-scales";
import { measureInsertionIndex } from "./nearby";
import { generatePrompt } from "./prompt";

const unusedElement = {} as HTMLElement;

const baseModification: Modification = {
  element: unusedElement,
  selector: "button.primary",
  componentName: "PrimaryButton",
  sourceFile: "src/app.tsx",
  textPreview: "Save",
  originalInlineBg: "",
  originalInlineColor: "",
  originalInlineBorderColor: "",
  originalInlineFontSize: "",
  originalInlinePaddingTop: "",
  originalInlinePaddingBottom: "",
  originalInlineMarginTop: "",
  originalInlineMarginBottom: "",
  property: "bg",
  position: 5,
  fontSize: 16,
  paddingY: 12,
  translateX: 0,
  translateY: 48,
  originalInlineTransform: "",
  dragOriginRect: {
    left: 120,
    top: 120,
    width: 140,
    height: 40,
  },
};

describe("measureInsertionIndex", () => {
  it("chooses the middle vertical slot", () => {
    const parentRect = {
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      centerX: 200,
      centerY: 200,
    };
    const childRects = [
      {
        left: 40,
        top: 40,
        right: 200,
        bottom: 80,
        width: 160,
        height: 40,
        centerX: 120,
        centerY: 60,
      },
      {
        left: 40,
        top: 200,
        right: 200,
        bottom: 240,
        width: 160,
        height: 40,
        centerX: 120,
        centerY: 220,
      },
    ];
    const targetRect = {
      left: 40,
      top: 120,
      right: 200,
      bottom: 160,
      width: 160,
      height: 40,
      centerX: 120,
      centerY: 140,
    };

    expect(measureInsertionIndex(targetRect, parentRect, childRects, "vertical")).toBe(1);
  });

  it("chooses the first horizontal slot when dragged before all siblings", () => {
    const parentRect = {
      left: 0,
      top: 0,
      right: 600,
      bottom: 120,
      width: 600,
      height: 120,
      centerX: 300,
      centerY: 60,
    };
    const childRects = [
      {
        left: 180,
        top: 20,
        right: 280,
        bottom: 80,
        width: 100,
        height: 60,
        centerX: 230,
        centerY: 50,
      },
      {
        left: 320,
        top: 20,
        right: 420,
        bottom: 80,
        width: 100,
        height: 60,
        centerX: 370,
        centerY: 50,
      },
    ];
    const targetRect = {
      left: 40,
      top: 20,
      right: 140,
      bottom: 80,
      width: 100,
      height: 60,
      centerX: 90,
      centerY: 50,
    };

    expect(measureInsertionIndex(targetRect, parentRect, childRects, "horizontal")).toBe(0);
  });
});

describe("generatePrompt", () => {
  it("describes target parent, sibling anchors, and spacing guidance", () => {
    const prompt = generatePrompt(
      [baseModification],
      GRAY_SCALES,
      "neutral",
      new Map([
        [
          0,
          {
            originalRect: {
              left: 120,
              top: 120,
              right: 260,
              bottom: 160,
              width: 140,
              height: 40,
              centerX: 190,
              centerY: 140,
            },
            targetRect: {
              left: 120,
              top: 168,
              right: 260,
              bottom: 208,
              width: 140,
              height: 40,
              centerX: 190,
              centerY: 188,
            },
            translateX: 0,
            translateY: 48,
            originalParent: {
              selector: "div.stack",
              componentName: "Stack",
              textPreview: "",
            },
            targetParent: {
              selector: "div.stack",
              componentName: "Stack",
              textPreview: "",
            },
            didChangeParent: false,
            originalChildIndex: 0,
            targetChildIndex: 1,
            targetSiblingCount: 2,
            previousSibling: {
              selector: "label",
              componentName: "FieldLabel",
              textPreview: "Name",
              childIndex: 0,
            },
            nextSibling: {
              selector: "p.helper",
              componentName: "HelperText",
              textPreview: "Required",
              childIndex: 1,
            },
            gapBefore: 12,
            gapAfter: 12,
            crossAxisInsetStart: 0,
            crossAxisInsetEnd: 0,
            parentLayout: {
              display: "flex",
              flowAxis: "vertical",
              flexDirection: "column",
              gap: 12,
              crossGap: 0,
            },
            parentSpacing: {
              method: "gap",
              cssProperty: "row-gap",
              value: 12,
              isUniform: true,
            },
            parentContentRect: {
              left: 100,
              top: 100,
              right: 400,
              bottom: 500,
              width: 300,
              height: 400,
              centerX: 250,
              centerY: 300,
            },
            tree: {
              selector: "div.stack",
              componentName: "Stack",
              textPreview: "",
              childIndex: 0,
              positionX: 100,
              positionY: 100,
              width: 300,
              height: 400,
              isSelf: false,
              layout: "flex-vertical",
              spacing: "gap:row-gap:12px",
              children: [
                {
                  selector: "label",
                  componentName: "FieldLabel",
                  textPreview: "Name",
                  childIndex: 0,
                  positionX: 100,
                  positionY: 100,
                  width: 120,
                  height: 20,
                  isSelf: false,
                  layout: null,
                  spacing: null,
                  children: [],
                },
                {
                  selector: "p.helper",
                  componentName: "HelperText",
                  textPreview: "Required",
                  childIndex: 1,
                  positionX: 100,
                  positionY: 220,
                  width: 140,
                  height: 20,
                  isSelf: false,
                  layout: null,
                  spacing: null,
                  children: [],
                },
              ],
            },
          },
        ],
      ]),
    );

    expect(prompt).toContain("Target parent: <Stack> div.stack");
    expect(prompt).toContain('Place after: <FieldLabel> label ("Name")');
    expect(prompt).toContain('Place before: <HelperText> p.helper ("Required")');
    expect(prompt).toContain("Target box: left=120 top=168 right=260 bottom=208");
    expect(prompt).toContain("Re-order the JSX only. The parent already provides row-gap: 12px.");
    expect(prompt).toContain("Do NOT use CSS transforms.");
  });
});
