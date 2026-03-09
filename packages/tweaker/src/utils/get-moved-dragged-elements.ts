import type { DraggedElement } from "../types";

export const getMovedDraggedElements = (draggedElements: DraggedElement[]): DraggedElement[] =>
  draggedElements.filter(
    (draggedElement) => draggedElement.translateX !== 0 || draggedElement.translateY !== 0,
  );
