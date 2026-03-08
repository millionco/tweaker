import {
  CONTEXT_ANCESTOR_DEPTH,
  PROMPT_SIGNAL_LIMIT,
  SELECTOR_CLASS_LIMIT,
  TEXT_PREVIEW_MAX_LENGTH,
} from "../constants";
import type { PromptSignal } from "../types";

const PREFERRED_DATA_ATTRIBUTE_NAMES = [
  "data-testid",
  "data-test",
  "data-cy",
  "data-qa",
  "data-slot",
];
const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6, [role='heading']";

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const truncateText = (value: string): string => {
  const normalizedValue = normalizeWhitespace(value);
  return normalizedValue.length > TEXT_PREVIEW_MAX_LENGTH
    ? `${normalizedValue.slice(0, TEXT_PREVIEW_MAX_LENGTH)}…`
    : normalizedValue;
};

const isLikelyGeneratedClassName = (className: string): boolean =>
  className.startsWith("__") ||
  /^css-[a-z0-9-]+$/i.test(className) ||
  /^jsx-\d+$/i.test(className) ||
  /^sc-[a-z0-9-]+$/i.test(className) ||
  /^emotion-[a-z0-9-]+$/i.test(className) ||
  /^chakra-[a-z0-9-]+$/i.test(className) ||
  className.length > 32;

const getStableClassNames = (element: HTMLElement): string[] =>
  Array.from(element.classList)
    .filter((className) => !isLikelyGeneratedClassName(className))
    .slice(0, SELECTOR_CLASS_LIMIT);

const appendSignal = (
  signals: PromptSignal[],
  seenSignals: Set<string>,
  label: string,
  value: string | null,
) => {
  if (!value) return;
  const normalizedValue = truncateText(value);
  if (!normalizedValue) return;
  const signalKey = `${label}:${normalizedValue}`;
  if (seenSignals.has(signalKey)) return;
  seenSignals.add(signalKey);
  signals.push({ label, value: normalizedValue });
};

export const getSelector = (element: HTMLElement): string => {
  const tag = element.tagName.toLowerCase();
  if (element.id) return `${tag}#${element.id}`;

  const classes = getStableClassNames(element).join(".");
  return classes ? `${tag}.${classes}` : tag;
};

export const getTextPreview = (element: HTMLElement): string => {
  const text = element.textContent || "";
  return truncateText(text);
};

const getHeadingText = (element: HTMLElement): string | null => {
  const headingElement = element.querySelector(HEADING_SELECTOR);
  if (!(headingElement instanceof HTMLElement)) return null;
  const headingText = getTextPreview(headingElement);
  return headingText || null;
};

export const getPromptSignals = (element: HTMLElement): PromptSignal[] => {
  const signals: PromptSignal[] = [];
  const seenSignals = new Set<string>();
  const stableClassNames = getStableClassNames(element);

  appendSignal(signals, seenSignals, "id", element.id ? `#${element.id}` : null);
  appendSignal(
    signals,
    seenSignals,
    "class",
    stableClassNames.length > 0 ? `.${stableClassNames.join(".")}` : null,
  );

  PREFERRED_DATA_ATTRIBUTE_NAMES.forEach((attributeName) => {
    appendSignal(signals, seenSignals, attributeName, element.getAttribute(attributeName));
  });

  appendSignal(signals, seenSignals, "role", element.getAttribute("role"));
  appendSignal(signals, seenSignals, "aria-label", element.getAttribute("aria-label"));
  appendSignal(signals, seenSignals, "name", element.getAttribute("name"));
  appendSignal(signals, seenSignals, "type", element.getAttribute("type"));
  appendSignal(signals, seenSignals, "placeholder", element.getAttribute("placeholder"));
  appendSignal(signals, seenSignals, "href", element.getAttribute("href"));
  appendSignal(signals, seenSignals, "src", element.getAttribute("src"));

  return signals.slice(0, PROMPT_SIGNAL_LIMIT);
};

export const getContextHint = (element: HTMLElement): string | null => {
  let currentElement = element.parentElement;
  let currentDepth = 0;

  while (currentElement && currentDepth < CONTEXT_ANCESTOR_DEPTH) {
    const contextElement = currentElement;
    const contextSignals: string[] = [getSelector(contextElement)];
    const ariaLabel = contextElement.getAttribute("aria-label");
    const testId = PREFERRED_DATA_ATTRIBUTE_NAMES.map((attributeName) =>
      contextElement.getAttribute(attributeName),
    ).find(Boolean);
    const headingText = getHeadingText(contextElement);

    if (ariaLabel) contextSignals.push(`aria-label="${truncateText(ariaLabel)}"`);
    if (testId) contextSignals.push(`data="${truncateText(testId)}"`);
    if (headingText) contextSignals.push(`heading="${headingText}"`);

    if (contextSignals.length > 1 || contextElement.id || contextElement.classList.length > 0) {
      return contextSignals.join(", ");
    }

    currentElement = contextElement.parentElement;
    currentDepth += 1;
  }

  return null;
};
