/** Count identical GPU labels, keeping each model in its first reported position. */
export function formatGpuLabels(names: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => count > 1 ? `${name} x ${count}` : name);
}
