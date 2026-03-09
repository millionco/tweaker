import { describe, expect, it } from "vitest";
import type { DraggedElement } from "../types";
import { getMovedDraggedElements } from "./get-moved-dragged-elements";
import { upsertDraggedElement } from "./upsert-dragged-element";

const createDraggedElement = (
  element: HTMLElement,
  translateX: number,
  translateY: number,
): DraggedElement => ({
  element,
  selector: "div.card",
  componentName: "Card",
  sourceFile: null,
  textPreview: "Settings",
  originalInlineTranslate: "",
  translateX,
  translateY,
});

describe("dragged element utilities", () => {
  it("filters out elements that were not moved", () => {
    const stillElement = createDraggedElement(document.createElement("div"), 0, 0);
    const movedElement = createDraggedElement(document.createElement("div"), 24, -8);

    expect(getMovedDraggedElements([stillElement, movedElement])).toEqual([movedElement]);
  });

  it("upserts by element identity", () => {
    const element = document.createElement("div");
    const initialDraggedElement = createDraggedElement(element, 8, 4);
    const updatedDraggedElement = createDraggedElement(element, 48, -12);

    const draggedElements = upsertDraggedElement([initialDraggedElement], updatedDraggedElement);

    expect(draggedElements).toHaveLength(1);
    expect(draggedElements[0]).toEqual(updatedDraggedElement);
  });
});
