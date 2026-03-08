interface ReactFiberInfo {
  componentName: string | null;
  sourceFile: string | null;
  sourceLineNumber: number | null;
}

const EMPTY_FIBER_INFO: ReactFiberInfo = {
  componentName: null,
  sourceFile: null,
  sourceLineNumber: null,
};

const MAX_FIBER_WALK_DEPTH = 50;

const getReactFiber = (element: HTMLElement): Record<string, unknown> | null => {
  const fiberKey = Object.keys(element).find(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"),
  );
  if (!fiberKey) return null;
  return (element as unknown as Record<string, Record<string, unknown>>)[fiberKey];
};

const isComponentFiber = (fiber: Record<string, unknown>): boolean =>
  typeof fiber.type === "function" || (typeof fiber.type === "object" && fiber.type !== null);

const getComponentName = (fiber: Record<string, unknown>): string | null => {
  const fiberType = fiber.type as
    | Record<string, unknown>
    | ((...args: unknown[]) => unknown)
    | null;
  if (!fiberType) return null;
  if (typeof fiberType === "function") {
    return (
      (fiberType as unknown as { displayName?: string; name?: string }).displayName ||
      (fiberType as unknown as { displayName?: string; name?: string }).name ||
      null
    );
  }
  if (typeof fiberType === "object") {
    return (fiberType as { displayName?: string }).displayName || null;
  }
  return null;
};

interface DebugSource {
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
}

const getDebugSource = (fiber: Record<string, unknown>): DebugSource | null => {
  const source = fiber._debugSource as DebugSource | undefined;
  if (source?.fileName) return source;
  const owner = fiber._debugOwner as Record<string, unknown> | undefined;
  if (owner) {
    const ownerSource = owner._debugSource as DebugSource | undefined;
    if (ownerSource?.fileName) return ownerSource;
  }
  return null;
};

export const getReactFiberInfo = (element: HTMLElement): ReactFiberInfo => {
  const fiber = getReactFiber(element);
  if (!fiber) return EMPTY_FIBER_INFO;

  let componentName: string | null = null;
  let sourceFile: string | null = null;
  let sourceLineNumber: number | null = null;

  let current: Record<string, unknown> | null = fiber;
  let depth = 0;
  while (current && depth < MAX_FIBER_WALK_DEPTH) {
    if (isComponentFiber(current)) {
      const name = getComponentName(current);
      if (name && !componentName) {
        componentName = name;
      }

      const debugSource = getDebugSource(current);
      if (debugSource && !sourceFile) {
        sourceFile = debugSource.fileName;
        sourceLineNumber = debugSource.lineNumber;
      }

      if (componentName && sourceFile) break;
    }

    current = (current.return ?? current._debugOwner ?? null) as Record<string, unknown> | null;
    depth++;
  }

  return { componentName, sourceFile, sourceLineNumber };
};
