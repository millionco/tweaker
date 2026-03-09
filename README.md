# tweaker

A dev tool for dragging page elements and turning the result into an AI-ready DOM repositioning prompt.

## Install

```bash
npm install @ben-million/tweaker
```

## Usage

Add the `<Tweaker />` component to your app layout, ideally only in development:

```tsx
import { Tweaker } from "@ben-million/tweaker";

const App = () => (
  <>
    <YourApp />
    {process.env.NODE_ENV === "development" && <Tweaker />}
  </>
);
```

## Keybinds

| Key      | Action                                     |
| -------- | ------------------------------------------ |
| `T`      | Toggle Tweaker on or off                   |
| `Enter`  | Copy the current DOM repositioning prompt  |
| `Escape` | Restore all previews, clear state, and off |

## Workflow

1. Toggle Tweaker on with `T` or the pill in the bottom-left corner
2. Drag any element on the page to preview its new position
3. Repeat for as many elements as you want
4. Press `Enter` to copy a prompt that only describes DOM order and spacing changes
5. Press `Escape` or toggle Tweaker off to restore all previews and clear the session

The copied prompt is formatted for AI coding agents:

```
Reposition the following dragged elements within their current parent in the DOM.
Do not use CSS transforms in the final implementation — reorder the JSX and adjust spacing instead.

- <Card> div.card ("Settings")
  Source: src/components/card.tsx
  Parent: <SettingsPanel> div.stack (flex, column, gap: 16px)
  Drag preview: x=0px, y=-48px
  Move from child #3 to child #1 (of 4)

  Neighbors at target position:
    Below: button.primary ("Save") — 16px gap

  Current element margins: top=0px, bottom=0px

  → Re-order this element in the JSX to be child #1 of its parent.
  → The gaps match the parent's gap (16px) — no extra margins needed.
```

## License

MIT
