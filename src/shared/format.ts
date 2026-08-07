/**
 * Human-readable formatting helpers (pure, unit-tested).
 * Disk sizes use decimal units (1 GB = 1000 MB) to match how drives are labelled.
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log10(bytes) / 3));
  const value = bytes / 1000 ** i;
  const digits = i === 0 ? 0 : decimals;
  return `${value.toFixed(digits)} ${UNITS[i]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return formatEta(ms / 1000);
}

export function formatPercent(fraction: number, decimals = 0): string {
  if (!Number.isFinite(fraction)) return '0%';
  const clamped = Math.max(0, Math.min(1, fraction));
  return `${(clamped * 100).toFixed(decimals)}%`;
}
