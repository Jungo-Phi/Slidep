/**
 * Helper to convert a decimal value to a ratio string (e.g., 0.5 -> "1:2")
 */
export function valueToRatioParts(value: number): [string, string] {
  if (value === 0) return ["0", "1"];
  const tolerance = 1.0e-6;
  for (let d = 1; d <= 1000; d++) {
    const n = Math.round(value * d);
    if (Math.abs(value - n / d) < tolerance) {
      return [n.toString(), d.toString()];
    }
  }
  return [value.toFixed(2), "1"];
}
