/** `#rrggbb` for a colour written as `#rrggbb` or `rgb(r, g, b)` — the two forms the canvas palette and the stress ramps produce. */
export function to_hex(color: string): string {
  const match = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(color);
  if (!match) return color;
  const channel = (value: string) =>
    Math.min(255, Number(value)).toString(16).padStart(2, "0");
  return `#${channel(match[1])}${channel(match[2])}${channel(match[3])}`;
}
