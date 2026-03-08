const TAILWIND_SPACING_SCALE: [string, number][] = [
  ["0", 0],
  ["px", 1],
  ["0.5", 2],
  ["1", 4],
  ["1.5", 6],
  ["2", 8],
  ["2.5", 10],
  ["3", 12],
  ["3.5", 14],
  ["4", 16],
  ["5", 20],
  ["6", 24],
  ["7", 28],
  ["8", 32],
  ["9", 36],
  ["10", 40],
  ["11", 44],
  ["12", 48],
  ["14", 56],
  ["16", 64],
  ["20", 80],
  ["24", 96],
  ["28", 112],
  ["32", 128],
  ["36", 144],
  ["40", 160],
  ["44", 176],
  ["48", 192],
  ["52", 208],
  ["56", 224],
  ["60", 240],
  ["64", 256],
  ["72", 288],
  ["80", 320],
  ["96", 384],
];

const TAILWIND_PADDING_REGEX = /^(-?)(?:p|px|py|pt|pr|pb|pl|ps|pe)-(.+)$/;
const TAILWIND_PADDING_PREFIX_REGEX = /^(-?)(p|px|py|pt|pr|pb|pl|ps|pe)-/;
const ARBITRARY_VALUE_REGEX = /^\[(.+)\]$/;

export interface TailwindPaddingClass {
  original: string;
  prefix: string;
  suffix: string;
  pxValue: number;
  isNegative: boolean;
  isArbitrary: boolean;
}

const suffixToPx = (suffix: string): number | null => {
  const arbitraryMatch = suffix.match(ARBITRARY_VALUE_REGEX);
  if (arbitraryMatch) {
    const raw = arbitraryMatch[1];
    if (raw.endsWith("px")) return parseFloat(raw);
    if (raw.endsWith("rem")) return parseFloat(raw) * 16;
    if (raw.endsWith("em")) return parseFloat(raw) * 16;
    return parseFloat(raw) || null;
  }
  const entry = TAILWIND_SPACING_SCALE.find(([key]) => key === suffix);
  return entry ? entry[1] : null;
};

const parseSingleClass = (token: string): TailwindPaddingClass | null => {
  const match = token.match(TAILWIND_PADDING_REGEX);
  if (!match) return null;
  const isNegative = match[1] === "-";
  const prefixMatch = token.match(TAILWIND_PADDING_PREFIX_REGEX);
  if (!prefixMatch) return null;
  const prefix = prefixMatch[2];
  const suffix = match[2];
  const pxValue = suffixToPx(suffix);
  if (pxValue === null) return null;
  return {
    original: token,
    prefix,
    suffix,
    pxValue: isNegative ? -pxValue : pxValue,
    isNegative,
    isArbitrary: ARBITRARY_VALUE_REGEX.test(suffix),
  };
};

const hasVariantPrefix = (token: string): boolean => token.includes(":") && !token.startsWith("-");

export const parseTailwindPaddingClasses = (className: string): TailwindPaddingClass[] => {
  if (!className) return [];
  return className
    .split(/\s+/)
    .filter((token) => token && !hasVariantPrefix(token))
    .map(parseSingleClass)
    .filter((result): result is TailwindPaddingClass => result !== null);
};

export const pxToTailwindSuffix = (px: number): string => {
  const absPx = Math.abs(px);
  let closestSuffix = "0";
  let closestDistance = Infinity;

  for (const [suffix, scalePx] of TAILWIND_SPACING_SCALE) {
    const distance = Math.abs(scalePx - absPx);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestSuffix = suffix;
    }
  }

  return closestSuffix;
};

interface PaddingSides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const getAffectedSides = (prefix: string): (keyof PaddingSides)[] => {
  switch (prefix) {
    case "p":
      return ["top", "right", "bottom", "left"];
    case "px":
      return ["left", "right"];
    case "py":
      return ["top", "bottom"];
    case "pt":
      return ["top"];
    case "pr":
      return ["right"];
    case "pb":
      return ["bottom"];
    case "pl":
      return ["left"];
    case "ps":
      return ["left"];
    case "pe":
      return ["right"];
    default:
      return [];
  }
};

export const computeNewPaddingClasses = (
  originalClasses: TailwindPaddingClass[],
  newPaddingY: number,
  newPaddingX: number,
  originalPadding: PaddingSides,
): string[] => {
  const deltaY = newPaddingY - originalPadding.top;
  const deltaX = newPaddingX - originalPadding.left;

  return originalClasses.map((parsed) => {
    const sides = getAffectedSides(parsed.prefix);
    if (sides.length === 0) return parsed.original;

    const isVertical = sides.some((side) => side === "top" || side === "bottom");
    const isHorizontal = sides.some((side) => side === "left" || side === "right");

    let delta = 0;
    if (isVertical && isHorizontal) {
      delta = (deltaY + deltaX) / 2;
    } else if (isVertical) {
      delta = deltaY;
    } else {
      delta = deltaX;
    }

    const newPx = parsed.pxValue + delta;
    const newSuffix = pxToTailwindSuffix(newPx);
    const isNegative = newPx < 0;
    const negativePrefix = isNegative ? "-" : "";
    return `${negativePrefix}${parsed.prefix}-${newSuffix}`;
  });
};

export const replacePaddingClasses = (
  fullClassName: string,
  oldClasses: TailwindPaddingClass[],
  newClasses: string[],
): string => {
  let result = fullClassName;
  for (let index = 0; index < oldClasses.length; index++) {
    result = result.replace(oldClasses[index].original, newClasses[index]);
  }
  return result;
};

export const tailwindClassPxValue = (parsed: TailwindPaddingClass): number => parsed.pxValue;
