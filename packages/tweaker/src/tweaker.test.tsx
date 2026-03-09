import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tweaker } from "./tweaker";

interface TestRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const createDomRect = (rect: TestRect): DOMRect => {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;

  return {
    bottom,
    height: rect.height,
    left: rect.left,
    right,
    top: rect.top,
    width: rect.width,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect;
};

const parseTranslate = (translateValue: string): { x: number; y: number } => {
  const match = translateValue.match(/^(-?\d+)px\s+(-?\d+)px$/);
  if (!match) {
    return { x: 0, y: 0 };
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
  };
};

const attachRect = (element: HTMLElement, rect: TestRect) => {
  element.getBoundingClientRect = () => {
    const translateOffset = parseTranslate(element.style.getPropertyValue("translate"));
    return createDomRect({
      ...rect,
      left: rect.left + translateOffset.x,
      top: rect.top + translateOffset.y,
    });
  };
};

describe("Tweaker", () => {
  const writeTextMock = vi.fn(async (_text: string) => undefined);
  let containerElement: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    containerElement = document.createElement("div");
    document.body.appendChild(containerElement);
    writeTextMock.mockReset();
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    containerElement.remove();
  });

  it("lets users drag elements and copy a position-only prompt", async () => {
    const rootInstance = createRoot(containerElement);
    root = rootInstance;

    await act(async () => {
      rootInstance.render(
        <>
          <div id="stack" style={{ display: "flex", flexDirection: "column", rowGap: "20px" }}>
            <div id="card-one">One</div>
            <div id="card-two">Two</div>
            <div id="card-three">Three</div>
          </div>
          <Tweaker />
        </>,
      );
    });

    const stackElement = containerElement.querySelector("#stack");
    const cardTwoElement = containerElement.querySelector("#card-two");
    const cardOneElement = containerElement.querySelector("#card-one");
    const cardThreeElement = containerElement.querySelector("#card-three");

    if (
      !(stackElement instanceof HTMLElement) ||
      !(cardOneElement instanceof HTMLElement) ||
      !(cardTwoElement instanceof HTMLElement) ||
      !(cardThreeElement instanceof HTMLElement)
    ) {
      throw new Error("Test elements did not render");
    }

    attachRect(stackElement, { left: 0, top: 0, width: 240, height: 220 });
    attachRect(cardOneElement, { left: 0, top: 60, width: 120, height: 20 });
    attachRect(cardTwoElement, { left: 0, top: 100, width: 120, height: 20 });
    attachRect(cardThreeElement, { left: 0, top: 140, width: 120, height: 20 });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true }));
    });

    expect(containerElement.textContent).toContain("Tweaker on");

    await act(async () => {
      cardTwoElement.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 100,
        }),
      );
      document.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: 20,
          clientY: 20,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        }),
      );
    });

    expect(cardTwoElement.style.getPropertyValue("translate")).toBe("0px -80px");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(writeTextMock).toHaveBeenCalledTimes(1);

    const copiedPrompt = writeTextMock.mock.calls[0]?.[0] ?? "";
    expect(copiedPrompt).toContain("Move from child #2 to child #1");
    expect(copiedPrompt).toContain("Do not use CSS transforms");
    expect(copiedPrompt).not.toContain("color");
    expect(copiedPrompt).not.toContain("font-size");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(cardTwoElement.style.getPropertyValue("translate")).toBe("");
    expect(containerElement.textContent).toContain("Tweaker off");
  });
});
