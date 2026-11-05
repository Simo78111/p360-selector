"use client";
/** Blanks a page canvas (white) while the next page draws. */
export function blank(c: HTMLCanvasElement | null) {
  if (!c) return;
  c.width = 1;
  c.height = 1;
  const x = c.getContext("2d", { alpha: false, willReadFrequently: true });
  if (x) {
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, 1, 1);
  }
}
