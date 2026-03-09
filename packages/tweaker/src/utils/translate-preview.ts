import type { DraggedElement } from "../types";

export const applyTranslatePreview = (draggedElement: DraggedElement) => {
  draggedElement.element.style.setProperty(
    "translate",
    `${draggedElement.translateX}px ${draggedElement.translateY}px`,
  );
};

export const restoreTranslatePreview = (draggedElement: DraggedElement) => {
  if (draggedElement.originalInlineTranslate) {
    draggedElement.element.style.setProperty("translate", draggedElement.originalInlineTranslate);
    return;
  }

  draggedElement.element.style.removeProperty("translate");
};
