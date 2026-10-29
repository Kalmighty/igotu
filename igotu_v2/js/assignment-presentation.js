// Display only. Never derive an area from a private address or change map coordinates.
export function formatApproximateGridLabel(value) {
  const text = String(value ?? "");
  const match = /^Approximate grid: latitude (-?\d+(?:\.\d+)?) to (-?\d+(?:\.\d+)?), longitude (-?\d+(?:\.\d+)?) to (-?\d+(?:\.\d+)?)$/i.exec(text);
  if (!match) return text;
  const values = match.slice(1).map(Number);
  // Only shorten the known 0.1-degree grid, including floating-point tails.
  if (values.some((n, i) => !Number.isFinite(n) || Math.abs(n) > (i < 2 ? 90 : 180) || Math.abs(n * 10 - Math.round(n * 10)) > 1e-8) || values[0] > values[1] || values[2] > values[3]) return text;
  const [south, north, west, east] = values.map(n => n.toFixed(1));
  return `Approximate grid: latitude ${south} to ${north}, longitude ${west} to ${east}`;
}
