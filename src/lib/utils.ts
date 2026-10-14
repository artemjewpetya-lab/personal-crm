import { createCn } from "cn/config";

// Class merging must know the landing tokens from globals.css: otherwise it takes
// "text-label" (a font size) for a color and drops it next to "text-plum".
// Keep these lists in sync with --text-* and --radius-* in globals.css.
export const cn = createCn({
  extend: {
    theme: {
      text: ["h1", "h2", "number", "tile", "tile-lg", "label", "logo", "logo-lg"],
      radius: ["logo", "icon-box", "button", "tile", "card", "bubble-tail"],
    },
  },
});
