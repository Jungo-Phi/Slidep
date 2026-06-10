/**
 * Helper to convert a decimal value to a ratio string (e.g., 0.5 -> "1:2")
 */
export function value_to_ratio_parts(
  value: number,
  limit: number = 100,
): [string, string] {
  if (value === 0) return ["0", "1"];
  for (let d = 1; d <= limit; d++) {
    const n = Math.round(value * d);
    if (Math.abs(value - n / d) < 1.0e-4) {
      return [n.toString(), d.toString()];
    }
  }
  for (let d = 1; d <= limit; d++) {
    const n = Math.round(value * d);
    if (Math.abs(value - n / d) < 1.0e-3) {
      return [n.toString(), d.toString()];
    }
  }
  for (let d = 1; d <= limit; d++) {
    const n = Math.round(value * d);
    if (Math.abs(value - n / d) < 1.0e-2) {
      return [n.toString(), d.toString()];
    }
  }
  return ["1", "1"];
}

export function format_date(timestamp: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
