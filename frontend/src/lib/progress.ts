export function parseProgressInput(value: unknown) {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return Math.max(0, Math.min(100, value));
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/%$/, '');
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed)) {
      return Math.max(0, Math.min(100, parsed));
    }
  }

  return null;
}
