import { TEXT_PREVIEW_MAX_LENGTH } from "../constants";

export const getSelector = (element: HTMLElement): string => {
  const tag = element.tagName.toLowerCase();
  const classes = Array.from(element.classList)
    .filter((className) => !className.startsWith("__"))
    .slice(0, 2)
    .join(".");
  return classes ? `${tag}.${classes}` : tag;
};

export const getTextPreview = (element: HTMLElement): string => {
  const text = element.textContent?.trim() || "";
  return text.length > TEXT_PREVIEW_MAX_LENGTH
    ? `${text.slice(0, TEXT_PREVIEW_MAX_LENGTH)}…`
    : text;
};
