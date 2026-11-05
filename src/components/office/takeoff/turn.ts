// Turning points with a page (a quarter turn clockwise moves (x, y) on a page H high to (H - y, x)), used to show
// another revision's marks lined up with the current page when the two were turned differently. The database does the
// same when a page is rotated (jm_tk_rotate_page).
import type { Pt } from "@/lib/takeoff-shared";

export function turnPoints(points: Pt[], turn: number, width: number, height: number): Pt[] {
  let pts = points, w = width, h = height;
  for (let n = 0; n < ((((turn / 90) % 4) + 4) % 4); n++) {
    pts = pts.map(([x, y]) => [h - y, x] as Pt);
    [w, h] = [h, w];
  }
  return pts;
}
