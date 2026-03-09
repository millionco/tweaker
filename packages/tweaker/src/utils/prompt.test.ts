import { describe, expect, it } from "vitest";
import type { DraggedElement } from "../types";
import type { RepositionContext } from "./nearby";
import { generatePrompt } from "./prompt";

const createDraggedElement = (
  selector: string,
  translateX: number,
  translateY: number,
): DraggedElement => ({
  element: document.createElement("div"),
  selector,
  componentName: "Card",
  sourceFile: "src/components/card.tsx",
  textPreview: "Settings",
  originalInlineTranslate: "",
  translateX,
  translateY,
});

const createVerticalContext = (): RepositionContext => ({
  translateX: 0,
  translateY: -48,
  originalChildIndex: 2,
  insertionIndex: 0,
  siblingCount: 4,
  parentDescription: "div.stack",
  parentComponentName: "SettingsPanel",
  previousSibling: null,
  nextSibling: { description: 'button.primary ("Save")' },
  gapBefore: 12,
  gapAfter: 12,
  existingMarginBefore: 0,
  existingMarginAfter: 0,
  parentLayout: {
    display: "flex",
    flowAxis: "vertical",
    flexDirection: "column",
    gap: 12,
  },
});

const createHorizontalContext = (): RepositionContext => ({
  translateX: 32,
  translateY: 0,
  originalChildIndex: 1,
  insertionIndex: 1,
  siblingCount: 2,
  parentDescription: "div.row",
  parentComponentName: null,
  previousSibling: { description: 'button.secondary ("Back")' },
  nextSibling: { description: 'button.primary ("Save")' },
  gapBefore: 24,
  gapAfter: 8,
  existingMarginBefore: 0,
  existingMarginAfter: 0,
  parentLayout: {
    display: "flex",
    flowAxis: "horizontal",
    flexDirection: "row",
    gap: 0,
  },
});

describe("generatePrompt", () => {
  it("returns a position-only prompt for reordered vertical layouts", () => {
    const draggedElement = createDraggedElement("div.card", 0, -48);
    const prompt = generatePrompt([draggedElement], new Map([[0, createVerticalContext()]]));

    expect(prompt).toContain("Reposition the following dragged elements");
    expect(prompt).toContain("Do not use CSS transforms");
    expect(prompt).toContain("Parent: <SettingsPanel> div.stack (flex, column, gap: 12px)");
    expect(prompt).toContain("Move from child #3 to child #1 (of 5)");
    expect(prompt).toContain('Below: button.primary ("Save") — 12px gap');
    expect(prompt).not.toContain("color");
    expect(prompt).not.toContain("font-size");
    expect(prompt).not.toContain("gray scale");
  });

  it("describes spacing instructions for gapless horizontal layouts", () => {
    const draggedElement = createDraggedElement("button.primary", 32, 0);
    const prompt = generatePrompt([draggedElement], new Map([[0, createHorizontalContext()]]));

    expect(prompt).toContain('Left:  button.secondary ("Back") — 24px gap');
    expect(prompt).toContain('Right: button.primary ("Save") — 8px gap');
    expect(prompt).toContain("Set margin-left: 24px");
    expect(prompt).toContain("Set margin-right: 8px");
  });

  it("falls back to preview offsets when sibling context is unavailable", () => {
    const draggedElement = createDraggedElement("div.card", 18, 6);
    const prompt = generatePrompt([draggedElement]);

    expect(prompt).toContain("Match the dragged preview without CSS transforms");
    expect(prompt).toContain("x=18px, y=6px");
    expect(prompt).toContain("src/components/card.tsx");
  });
});
