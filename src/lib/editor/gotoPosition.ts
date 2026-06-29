export interface GotoPosition {
  x: number;
  y: number;
}

export function parseGotoPositionInput(input: string): GotoPosition | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(/\b[xy]\s*[:=]\s*/gi, '')
    .replace(/[;]+/g, ',');
  const parts = normalized.includes(',')
    ? normalized.split(',').map(part => part.trim()).filter(Boolean)
    : normalized.split(/\s+/).map(part => part.trim()).filter(Boolean);

  if (parts.length !== 2) return null;
  const [x, y] = parts.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function formatGotoPositionValue(position: GotoPosition): string {
  return `${Math.round(position.x)}, ${Math.round(position.y)}`;
}
