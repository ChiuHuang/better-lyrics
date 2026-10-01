const QUICK_FALLBACK_MS = 150;

// The minifier rewrites 150ms as .15s, so honour both units.
export function cssTimeMs(value: string, fallbackMs: number): number {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return fallbackMs;
  return value.trim().endsWith("ms") ? amount : amount * 1000;
}

export function quickDurationMs(): number {
  return cssTimeMs(getComputedStyle(document.documentElement).getPropertyValue("--duration-quick"), QUICK_FALLBACK_MS);
}

export function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
