# tweaker

A dev tool for tweaking colors along gray scales in React apps. Pick any element, adjust its color along a gray scale, then copy the result as an AI-ready prompt.

## Install

```bash
npm install tweaker
```

## Usage

Add the `<Tweaker />` component to your app layout, ideally only in development:

```tsx
import { Tweaker } from "tweaker";

const App = () => (
  <>
    <YourApp />
    {process.env.NODE_ENV === "development" && <Tweaker />}
  </>
);
```

### With a specific scale

```tsx
<Tweaker activeScale="slate" />
```

### With custom scales

```tsx
import { Tweaker } from "tweaker";
import type { GrayScale } from "tweaker";

const customScales: Record<string, GrayScale> = {
  brand: {
    label: "Brand",
    shades: {
      "50": "oklch(0.985 0.003 250)",
      "100": "oklch(0.968 0.006 250)",
      // ... 200-950
    },
  },
};

<Tweaker scales={customScales} activeScale="brand" />;
```

## Keybinds

| Key | Action |
| --- | --- |
| `T` | Enter picking mode |
| `B` | Switch to background color |
| `F` | Switch to text (foreground) color |
| `D` | Switch to border color |
| `Space` | Persist current change, copy prompt, pick next element |
| `Escape` | Copy prompt, restore all changes, and exit |
| `0-9` / `.` | Type a value directly (0–10 scale) |

## Workflow

1. Press `T` or click the pill to start picking
2. Click an element — its color is detected and mapped to the gray scale
3. Move your mouse up/down to adjust the shade (vertical slider)
4. Press `B`, `F`, or `D` to switch between background, text, or border
5. Press `Space` to persist and pick the next element (cumulative prompt)
6. Press `Escape` to copy the full prompt and reset

The copied prompt is formatted for AI coding agents:

```
Change the following colors using the design system's gray scale:

- background color of div.card ("Settings") → Slate 200 (oklch(0.929 0.013 255.5))
- text color of p.description ("Configure your...") → Slate 600 (oklch(0.446 0.043 257.3))
```

## Built-in scales

Neutral, Slate, Gray, Zinc, Stone, Mauve, Olive — matching Tailwind CSS v4 gray palettes.

## License

MIT
