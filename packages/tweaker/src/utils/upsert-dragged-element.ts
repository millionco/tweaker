import type { DraggedElement } from "../types";

export const upsertDraggedElement = (
  draggedElements: DraggedElement[],
  nextDraggedElement: DraggedElement,
): DraggedElement[] => {
  const existingDraggedElementIndex = draggedElements.findIndex(
    (draggedElement) => draggedElement.element === nextDraggedElement.element,
  );

  if (existingDraggedElementIndex === -1) {
    return [...draggedElements, nextDraggedElement];
  }

  const updatedDraggedElements = [...draggedElements];
  updatedDraggedElements[existingDraggedElementIndex] = nextDraggedElement;
  return updatedDraggedElements;
};
