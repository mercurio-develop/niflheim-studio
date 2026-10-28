"use client";

import { useState } from "react";
import { ImageGrid } from "./image-grid";

const cell = (n: string) => ({
  src: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='70' height='90'><rect width='100%' height='100%' fill='currentColor' opacity='0.${n}'/></svg>`,
  label: n.padStart(2, "0"),
});

export default function Preview() {
  const items = [cell("2"), cell("4"), cell("6"), cell("8")];
  const [picked, setPicked] = useState<string | undefined>(items[0].src);
  return <ImageGrid items={items} picked={picked} onPick={(i) => setPicked(items[i].src)} />;
}
